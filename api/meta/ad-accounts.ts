// GET /api/meta/ad-accounts — ad accounts the connected Meta user can access.
// Auth-checked. Never returns a token. On expired/revoked token (190),
// marks integrations needs_reconnect and returns needsReconnect:true.
import { verifySupabaseUser } from '../_lib/auth'
import { getDecryptedMetaToken, setIntegrationStatus } from '../_lib/supabase-server'
import { fetchUserAdAccounts, MetaApiError } from '../_lib/meta'

export const config = { runtime: 'nodejs' }

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  const user = await verifySupabaseUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  try {
    const conn = await getDecryptedMetaToken(user.id)
    if (!conn) return res.status(404).json({ error: 'No Meta connection found. Connect your Meta account first.', needsReconnect: true })
    const accounts = await fetchUserAdAccounts(conn.token)
    return res.status(200).json({ accounts })
  } catch (e: any) {
    if (e instanceof MetaApiError && e.needsReconnect) {
      try { await setIntegrationStatus(user.id, 'needs_reconnect', { lastConnectedAt: null }) } catch {}
      return res.status(401).json({ error: e.message, needsReconnect: true })
    }
    if (e instanceof MetaApiError && e.rateLimited) {
      return res.status(429).json({ error: e.message, retryAfterSeconds: e.retryAfterSeconds || null })
    }
    if (e instanceof MetaApiError) return res.status(e.status).json({ error: e.message })
    return res.status(503).json({ error: 'Server is not configured yet. Add the required server environment variables in Vercel only, then redeploy.' })
  }
}
