// Vercel serverless function — Meta OAuth START, SERVER ONLY.
// Step 5 Part 2, read-only test only.
// Scopes requested: ads_read and business_management ONLY.
// ads_management (publish/create) is deliberately NOT requested here.
// Publishing needs a separate, explicitly approved step — connecting
// here never publishes ads, never changes live budgets, and never
// claims a live ad-account session.
// The Supabase user session cannot be carried through Meta's redirect,
// so this route does NOT receive or trust a browser token, and it does
// NOT store anything. The callback exchanges the code server-side,
// discards the access token, and only redirects back to the app, where
// the already-signed-in frontend records a read-only test status
// under its own Supabase RLS row (see src/App.tsx Integrations).
// Redirect URI (must match exactly in the Meta app console):
//   https://niketdigitalai.vercel.app/api/auth/meta/callback
export const config = { runtime: 'nodejs' }

const APP_URL = 'https://niketdigitalai.vercel.app'
const REDIRECT_URI = `${APP_URL}/api/auth/meta/callback`

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  const appId = process.env.META_APP_ID
  if (!appId) {
    return res.status(503).send(
      'Meta OAuth is not configured yet: META_APP_ID is missing on the server. ' +
      'Add META_APP_ID and META_APP_SECRET in Vercel Environment Variables only (never in frontend code or GitHub), then redeploy. No ads were published.'
    )
  }
  // Random CSRF state, stored only as a short-lived HttpOnly cookie.
  // It is NOT a user token and contains no secret.
  const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cookie = `oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    state,
    scope: 'ads_read,business_management',
    response_type: 'code',
  })
  res.writeHead(302, {
    Location: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
    'Set-Cookie': cookie,
  })
  res.end()
}
