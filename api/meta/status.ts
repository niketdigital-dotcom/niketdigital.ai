// GET /api/meta/status — connection status only. Never returns a token.
import { verifySupabaseUser } from '../_lib/auth'
import { getMetaConnection, getServiceClient } from '../_lib/supabase-server'

export const config = { runtime: 'nodejs' }

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  const user = await verifySupabaseUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  try {
    const conn = await getMetaConnection(user.id)
    const sb = getServiceClient()
    const { data: ig } = await sb.from('integrations').select('status,config').eq('user_id', user.id).eq('provider', 'meta').maybeSingle()
    if (!conn) {
      return res.status(200).json({ connected: false, needsReconnect: false, status: ig?.status || 'not_configured' })
    }
    const expired = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() <= Date.now() : false
    return res.status(200).json({
      connected: !expired,
      needsReconnect: expired || ig?.status === 'needs_reconnect',
      status: expired ? 'needs_reconnect' : (ig?.status || 'connected'),
      metaUserId: conn.meta_user_id,
      tokenExpiresAt: conn.token_expires_at,
      scopes: conn.scopes,
      lastConnectedAt: (ig?.config as any)?.lastConnectedAt || null,
    })
  } catch {
    return res.status(503).json({ error: 'Server is not configured yet. Add the Supabase service-role key in Vercel Environment Variables only, then redeploy.' })
  }
}
