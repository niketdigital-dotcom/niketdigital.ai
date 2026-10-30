// Server-only Meta Graph API client.
// Graph version comes from META_GRAPH_VERSION (default v21.0).
// Errors are mapped to safe messages: no token, no secret, no raw
// Graph payload is ever returned to the browser or logged.
// Code 190 = expired / revoked token -> needsReconnect.
// Code 429 = rate limit -> caller should surface Retry-After, not retry silently.
export class MetaApiError extends Error {
  status: number
  code?: number
  needsReconnect = false
  rateLimited = false
  retryAfterSeconds?: number
  constructor(message: string, status = 502, code?: number) {
    super(message)
    this.status = status
    this.code = code
    if (code === 190) this.needsReconnect = true
  }
}

export function graphVersion(): string {
  const v = (process.env.META_GRAPH_VERSION || 'v21.0').trim()
  return v.startsWith('v') ? v : `v${v}`
}

export function graphBase(): string {
  return `https://graph.facebook.com/${graphVersion()}`
}

export async function metaFetch(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const url = path.startsWith('http') ? path : `${graphBase()}${path.startsWith('/') ? path : `/${path}`}`
  let r: Response
  try {
    r = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
  } catch (e: any) {
    throw new MetaApiError(`Could not reach Meta: ${e?.message || 'network error'}`, 502)
  }
  if (r.status === 429) {
    const retryAfter = r.headers.get('retry-after')
    const err = new MetaApiError('Meta rate limit reached. Please wait and try again.', 429)
    err.rateLimited = true
    if (retryAfter) err.retryAfterSeconds = Number(retryAfter) || undefined
    throw err
  }
  let data: any = {}
  try { data = await r.json() } catch { data = {} }
  if (!r.ok) {
    const ge = data?.error
    const code = ge?.code
    const msg = typeof ge?.message === 'string' ? ge.message : 'Meta API error.'
    if (code === 190) {
      throw new MetaApiError('Your Meta connection has expired or was revoked. Please reconnect your Meta account.', 401, 190)
    }
    // Strip any token-like fragments defensively before surfacing a message.
    const safe = msg.replace(/EA[A-Za-z0-9]+/g, '[token]').slice(0, 300)
    throw new MetaApiError(`Meta error (${r.status}): ${safe}`, r.status, code)
  }
  return data
}

export function normalizeAccountId(input: string): string {
  const s = String(input || '').trim()
  return s.startsWith('act_') ? s : `act_${s}`
}

export function stripActPrefix(id: string): string {
  return String(id || '').replace(/^act_/, '')
}

export async function fetchUserAdAccounts(token: string): Promise<any[]> {
  const data = await metaFetch(token, '/me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=100')
  return Array.isArray(data?.data) ? data.data : []
}

export async function assertAccountOwned(token: string, accountId: string): Promise<any> {
  const accounts = await fetchUserAdAccounts(token)
  const wanted = normalizeAccountId(accountId)
  const found = accounts.find((a: any) => normalizeAccountId(a.id) === wanted)
  if (!found) throw new MetaApiError('That ad account does not belong to the connected Meta account.', 403)
  return found
}
