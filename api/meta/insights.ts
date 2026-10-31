// GET /api/meta/insights — campaign/account performance insights.
// Auth-checked, ownership-checked. No token is ever returned.
// Query: ad_account_id (required), campaign_id (optional),
// date_preset (default last_30d; allowed: today,yesterday,last_7d,last_30d,last_90d).
// Expired token -> 401 with needsReconnect:true. The token is NOT
// auto-refreshed silently: a long-lived token (60 days) is stored at
// connect time, and when it expires the user must reconnect explicitly.
// Rate limits return 429 with retryAfterSeconds when Meta provides it.
import { verifySupabaseUser, getQuery } from '../_lib/auth.js'
import { getDecryptedMetaToken, setIntegrationStatus } from '../_lib/supabase-server.js'
import { metaFetch, assertAccountOwned, normalizeAccountId, MetaApiError } from '../_lib/meta.js'

export const config = { runtime: 'nodejs' }

const ALLOWED_PRESETS = new Set(['today', 'yesterday', 'last_7d', 'last_30d', 'last_90d'])

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  const user = await verifySupabaseUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  try {
    const conn = await getDecryptedMetaToken(user.id)
    if (!conn) return res.status(404).json({ error: 'No Meta connection found. Connect your Meta account first.', needsReconnect: true })
    const token = conn.token
    const q = getQuery(req)
    const accountId = q.ad_account_id
    const campaignId = q.campaign_id || ''
    const datePreset = q.date_preset || 'last_30d'
    if (!accountId) return res.status(400).json({ error: 'ad_account_id is required.' })
    if (!ALLOWED_PRESETS.has(datePreset)) return res.status(400).json({ error: 'Invalid date_preset. Use today, yesterday, last_7d, last_30d, or last_90d.' })
    await assertAccountOwned(token, accountId)
    let target = normalizeAccountId(accountId)
    if (campaignId) {
      const list = await metaFetch(token, `/${target}/campaigns?fields=id&limit=100`)
      const ids = new Set((Array.isArray(list?.data) ? list.data : []).map((c: any) => String(c.id)))
      if (!ids.has(campaignId)) return res.status(403).json({ error: 'That campaign does not belong to the selected ad account.' })
      target = campaignId
    }
    const fields = 'impressions,clicks,spend,reach,actions,action_values,ctr,cpc,cpm'
    const data = await metaFetch(token, `/${target}/insights?fields=${fields}&date_preset=${datePreset}`)
    return res.status(200).json({ insights: Array.isArray(data?.data) ? data.data : [], date_preset: datePreset })
  } catch (e: any) {
    if (e instanceof MetaApiError && e.needsReconnect) {
      try { await setIntegrationStatus(user.id, 'needs_reconnect', {}) } catch {}
      return res.status(401).json({ error: e.message, needsReconnect: true })
    }
    if (e instanceof MetaApiError && e.rateLimited) {
      return res.status(429).json({ error: e.message, retryAfterSeconds: e.retryAfterSeconds || null })
    }
    if (e instanceof MetaApiError) return res.status(e.status).json({ error: e.message })
    return res.status(503).json({ error: 'Server is not configured yet. Add the required server environment variables in Vercel only, then redeploy.' })
  }
}
