// Server-only Supabase JWT verification.
// NEVER trust a user_id, email, or account id sent in a request body.
// The only identity source is the Supabase Auth /user endpoint, using
// the caller's Bearer token. Returns null (not an exception) for
// missing/invalid tokens so routes can return a clean 401.
export type AuthedUser = { id: string; email?: string }

export function getBearerToken(req: any): string {
  const raw = req.headers?.authorization || req.headers?.Authorization || ''
  if (typeof raw !== 'string') return ''
  return raw.replace(/^Bearer\s+/i, '').trim()
}

export async function verifySupabaseUser(req: any): Promise<AuthedUser | null> {
  const token = getBearerToken(req)
  if (!token) return null
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    const data: any = await r.json()
    if (!data?.id) return null
    return { id: String(data.id), email: data.email ? String(data.email) : undefined }
  } catch {
    return null
  }
}

export function readJsonBody(req: any): any {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return {}
}

export function getQuery(req: any): Record<string, string> {
  if (req.query && typeof req.query === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.query)) out[k] = Array.isArray(v) ? String(v[0]) : String(v)
    return out
  }
  try {
    const u = new URL(req.url || '/', 'https://niketdigitalai.vercel.app')
    return Object.fromEntries(u.searchParams.entries())
  } catch { return {} }
}
