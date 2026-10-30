// Vercel serverless function — Meta OAuth CALLBACK, SERVER ONLY.
// What this route does, in order:
//  1. Handles provider errors, including user-cancelled authorization.
//  2. Validates the CSRF state cookie AND the server-side state record.
//     If there is no state record, it fails closed (meta_unlinked):
//     no token is stored against an unknown user.
//  3. Exchanges the one-time code server-side for a short-lived token,
//     then exchanges that for a long-lived token (60 days, Meta default).
//  4. Fetches /me (id only) to record which Meta user connected.
//  5. Encrypts the long-lived token with AES-256-GCM (META_TOKEN_ENCRYPTION_KEY)
//     and stores ONLY the encrypted value in public.meta_connections,
//     via the service-role client. The plaintext token is never returned
//     to the browser, never put in a URL, never stored in integrations.config,
//     and never logged.
//  6. Records ONLY safe status metadata in integrations (provider='meta',
//     status='connected', config without any token).
// Redirects back to the app with only a flag: ?oauth=meta_connected,
// ?oauth=meta_cancelled, ?oauth=meta_unlinked, or ?oauth=meta_error.
import { getQuery } from '../../_lib/auth'
import { getServiceClient, setMetaConnection, setIntegrationStatus } from '../../_lib/supabase-server'
import { hashState, encryptToken, ConfigError } from '../../_lib/crypto'
import { graphBase, graphVersion } from '../../_lib/meta'

export const config = { runtime: 'nodejs' }

const APP_URL = 'https://niketdigitalai.vercel.app'
const REQUIRED_REDIRECT_URI = 'https://niketdigitalai.vercel.app/api/auth/meta/callback'

function getCookie(req: any, name: string): string {
  const raw = req.headers?.cookie || ''
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(raw)
  return m ? decodeURIComponent(m[1]) : ''
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  const q = getQuery(req)
  const redirect = (flag: string) => {
    res.writeHead(302, {
      Location: `${APP_URL}/?oauth=${flag}`,
      'Set-Cookie': 'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    })
    res.end()
  }
  // User cancelled in the Meta dialog, or Meta returned an error.
  if (q.error) {
    if (q.error === 'access_denied') return redirect('meta_cancelled')
    return redirect('meta_error')
  }
  if (!q.code) return redirect('meta_error')
  if (!q.state || getCookie(req, 'oauth_state') !== q.state) return redirect('meta_error')

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.META_REDIRECT_URI || REQUIRED_REDIRECT_URI
  if (!appId || !appSecret || redirectUri !== REQUIRED_REDIRECT_URI) return redirect('meta_error')

  let userId: string | null = null
  try {
    const sb = getServiceClient()
    const { data: stateRow } = await sb.from('meta_oauth_states')
      .select('user_id,expires_at')
      .eq('state_hash', hashState(q.state))
      .eq('kind', 'state')
      .maybeSingle()
    if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) return redirect('meta_unlinked')
    userId = String(stateRow.user_id)
    // One-time state: delete it immediately so it cannot be replayed.
    await sb.from('meta_oauth_states').delete().eq('state_hash', hashState(q.state))
  } catch {
    return redirect('meta_error')
  }
  if (!userId) return redirect('meta_unlinked')

  try {
    const version = graphVersion()
    const base = graphBase()
    // 1) Short-lived token
    const shortBody = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code: q.code })
    const shortRes = await fetch(`${base}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: shortBody.toString(),
    })
    const shortData: any = await shortRes.json().catch(() => ({}))
    if (!shortRes.ok || !shortData?.access_token) return redirect('meta_error')
    // 2) Long-lived token (Meta: fb_exchange_token)
    const longUrl = `${base}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortData.access_token)}`
    const longRes = await fetch(longUrl)
    const longData: any = await longRes.json().catch(() => ({}))
    const longToken: string | null = longData?.access_token || null
    if (!longToken) return redirect('meta_error')
    const expiresIn: number | null = typeof longData?.expires_in === 'number' ? longData.expires_in : null
    // 3) Who connected? id only.
    const meRes = await fetch(`${base}/me?fields=id`, { headers: { Authorization: `Bearer ${longToken}` } })
    const me: any = await meRes.json().catch(() => ({}))
    const metaUserId = me?.id ? String(me.id) : null
    // 4) Encrypt + store server-side only. Plaintext never leaves this function.
    const encrypted = encryptToken(longToken)
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
    const scopes = process.env.META_CONFIG_ID
      ? 'facebook_login_for_business (config-defined)'
      : 'ads_read,ads_management,business_management'
    await setMetaConnection(userId, { meta_user_id: metaUserId, encrypted_access_token: encrypted, token_expires_at: expiresAt, scopes })
    await setIntegrationStatus(userId, 'connected', {
      lastConnectedAt: new Date().toISOString(),
      scopes,
      metaUserId,
      tokenStoredEncrypted: true,
      publishingEnabled: false,
    })
    return redirect('meta_connected')
  } catch (e: any) {
    if (e instanceof ConfigError) return redirect('meta_error')
    return redirect('meta_error')
  }
}
