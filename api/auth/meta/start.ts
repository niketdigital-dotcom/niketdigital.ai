// Vercel serverless function — Meta OAuth START, SERVER ONLY.
// Required redirect URI (must match exactly in the Meta app console):
//   https://niketdigitalai.vercel.app/api/auth/meta/callback
// Facebook Login for Business: if META_CONFIG_ID is set, pass config_id
// and do NOT pass scope (Business Login defines permissions in the config).
// Otherwise pass scope ads_read,ads_management,business_management,
// which covers the user's required use cases: create & manage ads and
// measure ad performance. Publishing is still never automatic — campaign
// creation in this app defaults to PAUSED and needs an explicit action.
// CSRF: a random state is stored hashed server-side (when the signed-in
// frontend first called /api/meta/oauth-init) and also in a short-lived
// HttpOnly Secure SameSite=Lax cookie. The callback checks both.
import { randomBytes } from 'node:crypto'
import { getServiceClient } from '../../_lib/supabase-server'
import { hashState } from '../../_lib/crypto'
import { graphVersion } from '../../_lib/meta'

export const config = { runtime: 'nodejs' }

export const REQUIRED_REDIRECT_URI = 'https://niketdigitalai.vercel.app/api/auth/meta/callback'

function getCookie(req: any, name: string): string {
  const raw = req.headers?.cookie || ''
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(raw)
  return m ? decodeURIComponent(m[1]) : ''
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  const appId = process.env.META_APP_ID
  if (!appId) {
    return res.status(503).send('Meta OAuth is not configured yet: META_APP_ID is missing on the server. Add it in Vercel Environment Variables only (never in frontend code or GitHub), then redeploy. No ads were published.')
  }
  const redirectUri = process.env.META_REDIRECT_URI || REQUIRED_REDIRECT_URI
  if (redirectUri !== REQUIRED_REDIRECT_URI) {
    return res.status(500).send('Meta OAuth is misconfigured on the server: META_REDIRECT_URI does not match the required redirect URI. Fix it in Vercel Environment Variables only, then redeploy.')
  }
  const state = randomBytes(32).toString('hex')
  // Try to link this state to the signed-in user via the init cookie.
  // If there is no init record (e.g. a direct link, not the dashboard
  // Connect button), the callback will fail closed with meta_unlinked
  // instead of storing a token against an unknown user.
  try {
    const initToken = getCookie(req, 'meta_oauth_init')
    if (initToken) {
      const sb = getServiceClient()
      const { data: init } = await sb.from('meta_oauth_states')
        .select('user_id,expires_at')
        .eq('state_hash', hashState(`init:${initToken}`))
        .eq('kind', 'init')
        .maybeSingle()
      if (init && new Date(init.expires_at).getTime() > Date.now()) {
        await sb.from('meta_oauth_states').delete().eq('state_hash', hashState(`init:${initToken}`))
        await sb.from('meta_oauth_states').insert({
          state_hash: hashState(state),
          user_id: init.user_id,
          kind: 'state',
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
      }
    }
  } catch {
    // Linkage failure is not fatal here; the callback will fail closed
    // if no state record exists. Never leak the reason to the browser.
  }
  const version = graphVersion()
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  })
  const configId = process.env.META_CONFIG_ID
  if (configId) {
    params.set('config_id', configId)
  } else {
    params.set('scope', 'ads_read,ads_management,business_management')
  }
  const clearInit = 'meta_oauth_init=; Path=/api/auth/meta; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  const stateCookie = `oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  res.writeHead(302, {
    Location: `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`,
    'Set-Cookie': [clearInit, stateCookie],
  })
  res.end()
}
