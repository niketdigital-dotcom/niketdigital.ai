// Server-only Meta disconnect. POST only, auth-checked.
// Deletes the encrypted stored token and marks integrations disconnected.
// It does not revoke the token at Meta (a separate Graph call could do
// that, but deleting locally is the safe, explicit disconnect step);
// the user can also revoke access in Facebook Settings > Business Integrations.
import { verifySupabaseUser } from '../../_lib/auth.js'
import { deleteMetaConnection, setIntegrationStatus } from '../../_lib/supabase-server.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  const user = await verifySupabaseUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  try {
    await deleteMetaConnection(user.id)
    await setIntegrationStatus(user.id, 'disconnected', { lastConnectedAt: null })
    return res.status(200).json({ ok: true, disconnected: true })
  } catch {
    return res.status(503).json({ error: 'Server is not configured yet. Add the Supabase service-role key in Vercel Environment Variables only, then redeploy.' })
  }
}
