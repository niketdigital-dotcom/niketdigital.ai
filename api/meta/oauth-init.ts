// Server-only OAuth-init: bridges the Supabase browser session to the
// Meta redirect flow WITHOUT putting a user token in a URL.
// Flow: signed-in frontend POSTs here with Authorization: Bearer <Supabase JWT>.
// This route verifies the JWT, creates a one-time init record, and sets a
// short-lived HttpOnly cookie. The frontend then navigates to
// /api/auth/meta/start, which consumes that cookie, creates the CSRF
// state record, and redirects to Meta. No user_id is ever trusted from
// the browser, and no token is returned to the browser.
import { randomBytes } from 'node:crypto'
import { verifySupabaseUser, readJsonBody } from '../_lib/auth'
import { getServiceClient } from '../_lib/supabase-server'
import { hashState } from '../_lib/crypto'

export const config = { runtime: 'nodejs' }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  const user = await verifySupabaseUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  try {
    const sb = getServiceClient()
    const initToken = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { error } = await sb.from('meta_oauth_states').insert({
      state_hash: hashState(`init:${initToken}`),
      user_id: user.id,
      kind: 'init',
      expires_at: expiresAt,
    })
    if (error) throw error
    res.setHeader('Set-Cookie', `meta_oauth_init=${initToken}; Path=/api/auth/meta; HttpOnly; Secure; SameSite=Lax; Max-Age=600`)
    return res.status(200).json({ ok: true, startUrl: '/api/auth/meta/start' })
  } catch (e: any) {
    if (e?.message?.includes('missing') || e?.message?.includes('SUPABASE')) {
      return res.status(503).json({ error: 'Server is not configured yet. Add the Supabase service-role key in Vercel Environment Variables only, then redeploy.' })
    }
    return res.status(500).json({ error: 'Could not start Meta connection. Please try again.' })
  }
}
