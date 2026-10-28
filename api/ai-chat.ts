// Vercel serverless function — AI Assistant chat, SERVER ONLY.
// Same security rules as ai-generate.ts: Supabase JWT verified server-side,
// AI key read ONLY from process.env.AI_API_KEY, clear error if missing,
// never a fake answer. The frontend must call /api/ai-chat only.
export const config = { runtime: 'nodejs' }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  const auth = req.headers?.authorization || ''
  const token = typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : ''
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!token || !url || !anon) return res.status(401).json({ error: 'Not signed in. Please sign in and try again.' })
  try {
    const check = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
    if (!check.ok) return res.status(401).json({ error: 'Could not verify your session. Please sign in again.' })
  } catch {
    return res.status(401).json({ error: 'Could not verify your session. Please sign in again.' })
  }
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'AI is not configured yet: AI_API_KEY is missing on the server. Add it in Vercel Environment Variables, then redeploy.' })
  let body: any = {}
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}') } catch { body = {} }
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions'
  const model = process.env.AI_MODEL || 'gpt-4o-mini'
  try {
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are AdGenius AI, a helpful marketing assistant. Give specific, actionable recommendations. Do not claim campaigns are published, do not invent metrics, and do not guarantee results.' },
          { role: 'user', content: String(body.message || '') },
        ],
        temperature: 0.7,
      }),
    })
    if (!r.ok) return res.status(502).json({ error: `AI provider returned an error (${r.status}). Check the server AI key/model, then try again.` })
    const data = await r.json()
    return res.status(200).json({ reply: data?.choices?.[0]?.message?.content || 'No reply returned by the AI provider.' })
  } catch (e: any) {
    return res.status(502).json({ error: `Could not reach the AI provider: ${e?.message || 'unknown error'}` })
  }
}
