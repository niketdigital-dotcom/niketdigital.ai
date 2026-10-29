// Vercel serverless function — Meta OAuth CALLBACK, SERVER ONLY.
// Step 5 Part 2, read-only test only.
// What this route does:
//  1. Rejects provider errors and CSRF state mismatches.
//  2. Exchanges the one-time code for a token SERVER-SIDE using
//     META_APP_ID / META_APP_SECRET from process.env ONLY.
//  3. DISCARDS the access token immediately. It is NEVER stored in the
//     database, NEVER returned to the browser, NEVER put in a URL that
//     identifies an account, and NEVER logged (not even in part).
//  4. Redirects to the app with only a success/error flag and, if the
//     provider returned one, the discarded token's expiry in seconds.
//     The signed-in frontend then records ONLY a read-only test status
//     in its own RLS-protected integrations row. That status does NOT
//     mean a live ad-account session exists.
// TOKEN STORAGE WARNING (production launch):
//  If a real access token must ever be persisted for live reads, it
//  must NOT go in integrations.config as plain text in this build.
//  Move it to a vault / encrypted column first, with owner-only access.
//  Until that vault step exists, live Meta reads are NOT enabled.
//  Connecting here never publishes ads.
export const config = { runtime: 'nodejs' }

const APP_URL = 'https://niketdigitalai.vercel.app'
const REDIRECT_URI = `${APP_URL}/api/auth/meta/callback`

function getQuery(req: any): Record<string, string> {
  if (req.query && typeof req.query === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.query)) out[k] = Array.isArray(v) ? String(v[0]) : String(v)
    return out
  }
  try {
    const u = new URL(req.url || '/', APP_URL)
    return Object.fromEntries(u.searchParams.entries())
  } catch { return {} }
}

function getStateCookie(req: any): string {
  const raw = req.headers?.cookie || ''
  const m = /(?:^|;\s*)oauth_state=([^;]+)/.exec(raw)
  return m ? decodeURIComponent(m[1]) : ''
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  const q = getQuery(req)
  const fail = (reason: string) => {
    res.writeHead(302, { Location: `${APP_URL}/?oauth=meta_error&reason=${encodeURIComponent(reason)}`, 'Set-Cookie': 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure' })
    res.end()
  }
  if (q.error) return fail('provider_denied')
  if (!q.code) return fail('missing_code')
  if (!q.state || getStateCookie(req) !== q.state) return fail('state_mismatch')
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return fail('not_configured')
  try {
    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: REDIRECT_URI,
      code: q.code,
    })
    const r = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!r.ok) return fail('exchange_failed')
    const data: any = await r.json()
    // The token is intentionally NOT stored, NOT returned, and NOT logged.
    // Only its expiry (if the provider returned one) is passed back as a
    // plain number, so the frontend can record that the test token was
    // discarded — not that a live session exists.
    const expiresIn = data?.expires_in ? String(data.expires_in) : ''
    if (!data?.access_token) return fail('exchange_failed')
    const suffix = expiresIn ? `&expires_in=${encodeURIComponent(expiresIn)}` : ''
    res.writeHead(302, {
      Location: `${APP_URL}/?oauth=meta_connected${suffix}`,
      'Set-Cookie': 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
    })
    res.end()
  } catch {
    return fail('exchange_failed')
  }
}
