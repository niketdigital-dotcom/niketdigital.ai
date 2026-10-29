// Vercel serverless function — Google OAuth START, SERVER ONLY.
// Step 5 Part 2, read-only test only.
// Scope requested: https://www.googleapis.com/auth/adwords (Google Ads,
// read-only in this test step). No write/publish scope is requested here.
// Publishing needs a separate, explicitly approved step — connecting
// here never publishes ads and never changes live budgets.
// access_type=online is used deliberately: no refresh token is requested
// in this step, so no long-lived token exists to store.
// The Supabase user session cannot be carried through Google's redirect,
// so this route does NOT receive or trust a browser token, and it does
// NOT store anything. The callback exchanges the code server-side,
// discards the access token, and only redirects back to the app, where
// the already-signed-in frontend records a read-only test status
// under its own Supabase RLS row (see src/App.tsx Integrations).
// Redirect URI (must match exactly in the Google Cloud console):
//   https://niketdigitalai.vercel.app/api/auth/google/callback
export const config = { runtime: 'nodejs' }

const APP_URL = 'https://niketdigitalai.vercel.app'
const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return res.status(503).send(
      'Google OAuth is not configured yet: GOOGLE_CLIENT_ID is missing on the server. ' +
      'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables only (never in frontend code or GitHub), then redeploy. No ads were published.'
    )
  }
  // Random CSRF state, stored only as a short-lived HttpOnly cookie.
  // It is NOT a user token and contains no secret.
  const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cookie = `oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'online',
    prompt: 'consent',
    state,
  })
  res.writeHead(302, {
    Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    'Set-Cookie': cookie,
  })
  res.end()
}
