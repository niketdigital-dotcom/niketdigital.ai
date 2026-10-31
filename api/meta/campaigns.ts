// Meta campaigns: GET list, POST create (PAUSED by default), PATCH pause/resume/update.
// Every request is auth-checked and ownership-checked: the ad_account_id
// must belong to the connected Meta user's fetched ad accounts, and for
// PATCH the campaign_id must appear in that account's campaign list.
// NOTHING here runs on page load or on connect. Creation and resume
// are only triggered by an explicit dashboard button click.
// Create: status defaults to PAUSED. It becomes ACTIVE only if the body
// explicitly contains confirmLaunch:true AND status:'ACTIVE'.
// Resume: requires confirmResume:true in the body.
// Update: only name, daily_budget, lifetime_budget are accepted.
import { verifySupabaseUser, getQuery, readJsonBody } from '../_lib/auth.js'
import { getDecryptedMetaToken, setIntegrationStatus } from '../_lib/supabase-server.js'
import { metaFetch, assertAccountOwned, normalizeAccountId, MetaApiError } from '../_lib/meta.js'

export const config = { runtime: 'nodejs' }

const ALLOWED_OBJECTIVES = new Set([
  'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS',
  'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION', 'LINK_CLICKS', 'BRAND_AWARENESS',
  'REACH', 'TRAFFIC', 'ENGAGEMENT', 'LEAD_GENERATION', 'CONVERSIONS', 'APP_INSTALLS', 'VIDEO_VIEWS',
])

async function getToken(userId: string, res: any): Promise<string | null> {
  const conn = await getDecryptedMetaToken(userId)
  if (!conn) { res.status(404).json({ error: 'No Meta connection found. Connect your Meta account first.', needsReconnect: true }); return null }
  return conn.token
}

function handleMetaError(e: any, userId: string, res: any) {
  if (e instanceof MetaApiError && e.needsReconnect) {
    setIntegrationStatus(userId, 'needs_reconnect', {}).catch(() => {})
    return res.status(401).json({ error: e.message, needsReconnect: true })
  }
  if (e instanceof MetaApiError && e.rateLimited) {
    return res.status(429).json({ error: e.message, retryAfterSeconds: e.retryAfterSeconds || null })
  }
  if (e instanceof MetaApiError) return res.status(e.status).json({ error: e.message })
  return res.status(503).json({ error: 'Server is not configured yet. Add the required server environment variables in Vercel only, then redeploy.' })
}

export default async function handler(req: any, res: any) {
  const user = await verifySupabaseUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })

  if (req.method === 'GET') {
    try {
      const token = await getToken(user.id, res); if (!token) return
      const q = getQuery(req)
      const accountId = q.ad_account_id
      if (!accountId) return res.status(400).json({ error: 'ad_account_id is required.' })
      await assertAccountOwned(token, accountId)
      const acct = normalizeAccountId(accountId)
      const data = await metaFetch(token, `/${acct}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time&limit=100`)
      return res.status(200).json({ campaigns: Array.isArray(data?.data) ? data.data : [] })
    } catch (e: any) { return handleMetaError(e, user.id, res) }
  }

  if (req.method === 'POST') {
    try {
      const token = await getToken(user.id, res); if (!token) return
      const body = readJsonBody(req)
      const accountId = String(body.ad_account_id || '')
      const name = String(body.name || '').trim()
      const objective = String(body.objective || '').trim().toUpperCase()
      if (!accountId || !name) return res.status(400).json({ error: 'ad_account_id and name are required.' })
      if (!ALLOWED_OBJECTIVES.has(objective)) return res.status(400).json({ error: 'Invalid objective. Use a supported Meta objective, e.g. OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, or OUTCOME_APP_PROMOTION.' })
      await assertAccountOwned(token, accountId)
      const acct = normalizeAccountId(accountId)
      // PAUSED by default. ACTIVE only on an explicit, confirmed launch.
      const status = body.confirmLaunch === true && body.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'
      const params = new URLSearchParams({ name, objective, status, special_ad_categories: '[]' })
      if (body.daily_budget !== undefined && body.daily_budget !== null && body.daily_budget !== '') {
        const n = Number(body.daily_budget); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'daily_budget must be a non-negative number.' })
        params.set('daily_budget', String(Math.round(n)))
      }
      if (body.lifetime_budget !== undefined && body.lifetime_budget !== null && body.lifetime_budget !== '') {
        const n = Number(body.lifetime_budget); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'lifetime_budget must be a non-negative number.' })
        params.set('lifetime_budget', String(Math.round(n)))
      }
      const data = await metaFetch(token, `/${acct}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      return res.status(200).json({ campaign: data, status, note: status === 'PAUSED' ? 'Created as PAUSED. It will not run or spend until you explicitly resume it.' : 'Created as ACTIVE because you explicitly confirmed launch.' })
    } catch (e: any) { return handleMetaError(e, user.id, res) }
  }

  if (req.method === 'PATCH') {
    try {
      const token = await getToken(user.id, res); if (!token) return
      const body = readJsonBody(req)
      const accountId = String(body.ad_account_id || '')
      const campaignId = String(body.campaign_id || '')
      const action = String(body.action || '')
      if (!accountId || !campaignId || !action) return res.status(400).json({ error: 'ad_account_id, campaign_id, and action are required.' })
      await assertAccountOwned(token, accountId)
      // Ownership: campaign must be in this account's list.
      const acct = normalizeAccountId(accountId)
      const list = await metaFetch(token, `/${acct}/campaigns?fields=id&limit=100`)
      const ids = new Set((Array.isArray(list?.data) ? list.data : []).map((c: any) => String(c.id)))
      if (!ids.has(campaignId)) return res.status(403).json({ error: 'That campaign does not belong to the selected ad account.' })
      let params = new URLSearchParams()
      if (action === 'pause') {
        params.set('status', 'PAUSED')
      } else if (action === 'resume') {
        if (body.confirmResume !== true) return res.status(400).json({ error: 'Resume requires explicit confirmation: send confirmResume:true.' })
        params.set('status', 'ACTIVE')
      } else if (action === 'update') {
        if (body.name !== undefined) {
          const n = String(body.name).trim(); if (!n) return res.status(400).json({ error: 'name must not be empty.' })
          params.set('name', n)
        }
        if (body.daily_budget !== undefined) {
          const n = Number(body.daily_budget); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'daily_budget must be a non-negative number.' })
          params.set('daily_budget', String(Math.round(n)))
        }
        if (body.lifetime_budget !== undefined) {
          const n = Number(body.lifetime_budget); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'lifetime_budget must be a non-negative number.' })
          params.set('lifetime_budget', String(Math.round(n)))
        }
        if ([...params.keys()].length === 0) return res.status(400).json({ error: 'Nothing to update. Send name, daily_budget, or lifetime_budget.' })
      } else {
        return res.status(400).json({ error: "Invalid action. Use 'pause', 'resume', or 'update'." })
      }
      const data = await metaFetch(token, `/${campaignId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      return res.status(200).json({ success: true, result: data, action })
    } catch (e: any) { return handleMetaError(e, user.id, res) }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET, POST, or PATCH.' })
}
