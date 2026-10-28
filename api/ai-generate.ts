// Vercel serverless function — AI generation, SERVER ONLY.
// Security rules enforced here:
//  1. The caller must send a Supabase user JWT: Authorization: Bearer <token>.
//     The token is verified against Supabase Auth (not just trusted blindly).
//  2. The AI key is read ONLY from process.env.AI_API_KEY. It is never read
//     from the browser, never sent to the browser, and never logged.
//  3. If AI_API_KEY is missing, return a clear error — NEVER fake a response.
//  4. This is an OpenAI-compatible chat-completions call. Point AI_BASE_URL
//     at another compatible provider if you use one; the key stays server-side.
export const config = { runtime: 'nodejs' }

async function verifyUser(req: any): Promise<boolean> {
  const auth = req.headers?.authorization || req.headers?.Authorization || ''
  const token = typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : ''
  if (!token) return false
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anon) return false
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    return r.ok
  } catch {
    return false
  }
}

function readBody(req: any): any {
  if (req.body && typeof req.body === 'object') return req.body
  try { return req.body ? JSON.parse(req.body) : {} } catch { return {} }
}

const SYSTEM_PROMPTS: Record<string, string> = {
  meta_campaign: 'You are AdGenius AI, a performance marketing planner. Return a Meta (Facebook/Instagram) campaign plan as JSON with keys: campaignNames (array of 3 strings), objective, adSets (array of {name, audience, placements, budgetNote}), headlines (array of 5), primaryTexts (array of 3), callToActions (array of 3), creativeConcepts (array of 4 with angle + description), testingIdeas (array of 3), trackingChecklist (array of 4). Do not claim the campaign is published. Do not invent performance numbers.',
  google_campaign: 'You are AdGenius AI, a Google Ads planner. Return JSON with keys: campaignStructure (array of 3 strings), adGroups (array of 3 {name, keywords}), negativeKeywords (array of 5), headlines (array of 10, each 30 characters or fewer), descriptions (array of 4, each 90 characters or fewer), displayConcepts (array of 2), videoScript (string), biddingSuggestion (string), budgetNote (string). Never invent search volumes, CPCs, or competition scores; keyword ideas are ideas only, not verified metrics.',
  ad_copy: 'You are AdGenius AI, an ad copywriter. Return JSON with keys: variations (array of exactly 5 objects, each with angle, primaryText, headline, description, callToAction), complianceFlags (array of strings flagging misleading claims, unsupported promises, or policy risks; empty array if none). Each variation must use a different marketing angle. Do not guarantee approval or results.',
  audience_plan: 'You are AdGenius AI, an audience planner. Return JSON with keys: personas (array of 3 {name, why, message, objective, test, metrics}), prospecting (array of 2 strings), retargeting (array of 2 strings), exclusions (array of 2 strings). Clearly note these are suggestions, not verified platform segments.',
  landing_page: 'You are AdGenius AI, a landing page writer. Return JSON with keys: heroHeadline, heroSubheadline, benefits (array of 4), features (array of 4), faqs (array of 3 {q,a}), callToAction. Do not invent testimonials, certifications, addresses, or trust claims.',
  budget_plan: 'You are AdGenius AI, a budget planner. Return JSON with keys: scenarios (array of 3 objects named Conservative, Balanced, Growth-focused, each with allocation (string), assumptions (string), tradeoffs (string), nextSteps (string)). Do not guarantee future performance.',
  report: 'You are AdGenius AI, a marketing analyst. Using ONLY the metrics the user provides, return JSON with keys: executiveSummary (string), strengths (array of 2), weaknesses (array of 2), recommendations (array of 3), nextMonthPlan (array of 3). If data is missing, say so. Never invent missing results.',
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  if (!(await verifyUser(req))) {
    return res.status(401).json({ error: 'Not signed in. Please sign in and try again. (Server could not verify your Supabase session.)' })
  }
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'AI is not configured yet: AI_API_KEY is missing on the server. Add it in Vercel Environment Variables (never in frontend code or GitHub), then redeploy. No fake content was generated.' })
  }
  const body = readBody(req)
  const kind = String(body.kind || '')
  const system = SYSTEM_PROMPTS[kind]
  if (!system) return res.status(400).json({ error: `Unknown generation kind: ${kind}` })
  const userPrompt = `Business/product: ${body.prompt || ''}\nExtra context (user-entered data only): ${body.context || ''}\nReturn JSON only, no markdown fences.`
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions'
  const model = process.env.AI_MODEL || 'gpt-4o-mini'
  try {
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    })
    if (!r.ok) {
      const text = await r.text()
      return res.status(502).json({ error: `AI provider returned an error (${r.status}). Check your server AI key/model, then try again. Provider detail (no key included): ${text.slice(0, 300)}` })
    }
    const data = await r.json()
    const content = data?.choices?.[0]?.message?.content || ''
    let parsed: any
    try { parsed = JSON.parse(content) } catch { parsed = { raw: content } }
    return res.status(200).json({ kind, result: parsed })
  } catch (e: any) {
    return res.status(502).json({ error: `Could not reach the AI provider: ${e?.message || 'unknown error'}` })
  }
}
