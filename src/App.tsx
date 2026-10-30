import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'

type Row = Record<string, any>
const NAV = ['Dashboard','AI Ads Creator','Google Ads Builder','Ad Copy Generator','Creative Studio','Audience Planner','Campaign Analyzer','Landing Page Builder','Tracking & Analytics','Budget Optimizer','Marketing Reports','Client Management','AI Assistant','Integrations','Plans & Pricing','Settings','Help Center'] as const
type Page = typeof NAV[number]

// ---------- small UI helpers ----------
function Card({ title, children }: { title: string, children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4"><h2 className="text-lg font-bold text-[#0b1e3a] mb-3">{title}</h2>{children}</section>
}
function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return <label className="block mb-3"><span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>{children}</label>
}
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white'
const btnCls = 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50'
const btnGhost = 'border border-slate-300 bg-white px-3 py-2 rounded-lg'
function Empty({ text }: { text: string }) { return <p className="text-slate-500 text-sm py-3">{text}</p> }
function useForm<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState<T>(initial)
  const set = (k: keyof T) => (e: any) => setV(prev => ({ ...prev, [k]: e.target.value }))
  return [v, set, setV] as const
}
const fmt = (n: number) => Number.isFinite(n) ? n.toFixed(2) : '—'
function calc(m: Row) {
  const imp = Number(m.impressions || 0), clk = Number(m.clicks || 0), spend = Number(m.spend || 0)
  const leads = Number(m.leads || 0), purch = Number(m.purchases || 0), rev = Number(m.revenue || 0)
  return {
    ctr: imp ? (clk / imp) * 100 : null,
    cpc: clk ? spend / clk : null,
    cpl: leads ? spend / leads : null,
    cpa: purch ? spend / purch : null,
    roas: spend ? rev / spend : null,
  }
}

// ---------- main app ----------
export default function App() {
  const [session, setSession] = useState<any>(null)
  const [page, setPage] = useState<Page>('Dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authMsg, setAuthMsg] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [profile, setProfile] = useState<Row | null>(null)
  const [artifacts, setArtifacts] = useState<Row[]>([])
  const [clients, setClients] = useState<Row[]>([])
  const [metrics, setMetrics] = useState<Row[]>([])
  const [tasks, setTasks] = useState<Row[]>([])
  const [tracking, setTracking] = useState<Row[]>([])
  const [integrations, setIntegrations] = useState<Row[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadAll(uid: string) {
    const [p, a, c, m, t, tr, ig] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('artifacts').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('metric_rows').select('*').order('created_at', { ascending: false }),
      supabase.from('client_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('tracking_configs').select('*').order('created_at', { ascending: false }),
      supabase.from('integrations').select('*').order('created_at', { ascending: false }),
    ])
    if (p.data) setProfile(p.data)
    if (a.data) setArtifacts(a.data)
    if (c.data) setClients(c.data)
    if (m.data) setMetrics(m.data)
    if (t.data) setTasks(t.data)
    if (tr.data) setTracking(tr.data)
    if (ig.data) setIntegrations(ig.data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadAll(data.session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadAll(s.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function callAI(kind: string, prompt: string, context = '') {
    setBusy(kind); setError(''); setNotice('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Please sign in first.')
      const r = await fetch('/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, prompt, context }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'AI generation failed.')
      return j.result
    } finally { setBusy('') }
  }

  async function saveArtifact(kind: string, title: string, payload: any) {
    if (!session) return
    const { data, error } = await supabase.from('artifacts').insert({ user_id: session.user.id, kind, title, payload }).select().single()
    if (error) { setError(error.message); return }
    setArtifacts(prev => [data, ...prev]); setNotice('Saved.')
  }
  async function deleteArtifact(id: string) {
    const { error } = await supabase.from('artifacts').delete().eq('id', id)
    if (error) setError(error.message); else setArtifacts(prev => prev.filter(a => a.id !== id))
  }

  async function doAuth(e: React.FormEvent) {
    e.preventDefault(); setAuthMsg('')
    if (!isSupabaseConfigured) { setAuthMsg('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then run the SQL in supabase/schema.sql.'); return }
    try {
      if (authMode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        setAuthMsg('Password reset email sent. Check your inbox.')
      } else if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setAuthMsg('Account created. Check your email to confirm, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) { setAuthMsg(err.message) }
  }

  if (loading) return <div className="p-8">Loading AdGenius AI…</div>

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#0b1e3a]">
        <div className="bg-white rounded-2xl shadow p-8 w-full max-w-md">
          <h1 className="text-2xl font-black text-[#0b1e3a]">AdGenius AI</h1>
          <p className="text-slate-600 text-sm mb-4">AI-powered marketing for Facebook, Instagram & Google Ads. Sign up or sign in to use your own workspace — you only ever see your own data.</p>
          {!isSupabaseConfigured && <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm mb-3">Setup required: add your Supabase URL and anon key (see README.md). No real secret keys go in this browser code.</p>}
          <form onSubmit={doAuth}>
            <Field label="Email"><input className={inputCls} type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
            {authMode !== 'reset' && <Field label="Password"><input className={inputCls} type="password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>}
            <button className={btnCls + ' w-full'}>{authMode === 'signup' ? 'Sign up' : authMode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
          </form>
          {authMsg && <p className="text-sm mt-3 text-slate-700">{authMsg}</p>}
          <div className="flex gap-2 mt-4 text-sm">
            <button className={btnGhost} onClick={() => setAuthMode('login')}>Sign in</button>
            <button className={btnGhost} onClick={() => setAuthMode('signup')}>Sign up</button>
            <button className={btnGhost} onClick={() => setAuthMode('reset')}>Forgot password</button>
          </div>
        </div>
      </main>
    )
  }

  const uid = session.user.id
  const saved = (kind: string) => artifacts.filter(a => a.kind === kind)

  return (
    <div className="flex min-h-screen">
      <aside className={`bg-[#0b1e3a] text-white shrink-0 ${collapsed ? 'w-16' : 'w-64'} p-3 sticky top-0 h-screen overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <span className="font-black text-lg">{collapsed ? 'AG' : 'AdGenius AI'}</span>
          <button className="text-white/80 text-sm border border-white/20 rounded px-2 py-1" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? '›' : '‹'}</button>
        </div>
        <nav className="space-y-1">
          {NAV.map(n => (
            <button key={n} onClick={() => setPage(n)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${page === n ? 'bg-[#2563eb] text-white' : 'text-slate-200 hover:bg-white/10'}`} title={n}>{collapsed ? n[0] : n}</button>
          ))}
        </nav>
        <button className="mt-6 w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/10" onClick={() => supabase.auth.signOut()}>Sign out</button>
        <p className="text-xs text-slate-400 mt-4 px-1">Signed in as {session.user.email}. Your data is isolated by Supabase Row Level Security.</p>
      </aside>

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-black text-[#0b1e3a] mb-1">{page}</h1>
        <p className="text-slate-600 text-sm mb-4">Deep navy / electric blue workspace. Nothing here publishes ads or reads live ad accounts until you connect them explicitly (see Integrations).</p>
        {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">{error} <button className="underline ml-2" onClick={() => setError('')}>Dismiss</button></div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 mb-4 text-sm">{notice}</div>}
        {busy && <p className="text-sm text-slate-600 mb-4">Generating… please wait.</p>}

        {page === 'Dashboard' && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[['Clients', clients.length], ['Saved items', artifacts.length], ['Metric rows', metrics.length], ['Open tasks', tasks.filter(t => !t.done).length]].map(([l, v]) => (
              <div key={l} className="bg-white rounded-2xl border p-4"><div className="text-2xl font-black text-[#0b1e3a]">{v}</div><div className="text-sm text-slate-600">{l}</div></div>
            ))}
          </div>
          <Card title="Your business profile"><p className="text-sm text-slate-700">{profile?.business_name || 'Not set yet'} {profile?.industry ? `• ${profile.industry}` : ''} {profile?.monthly_budget ? `• Monthly budget ${profile.monthly_budget}` : ''}</p><p className="text-sm text-slate-500 mt-2">Go to Settings to complete onboarding. Demo data is never used as real performance — only your saved rows count.</p></Card>
          <Card title="Recent saved items">{saved('meta_campaign').length + saved('ad_copy').length + saved('google_campaign').length === 0 ? <Empty text="Nothing saved yet. Generate a campaign or ad copy and click Save." /> : artifacts.slice(0, 5).map(a => <div key={a.id} className="flex justify-between border-b py-2 text-sm"><span>{a.title} ({a.kind})</span><button className="text-red-600" onClick={() => deleteArtifact(a.id)}>Delete</button></div>)}</Card>
        </>}

        {page === 'AI Ads Creator' && <GenForm kind="meta_campaign" title="Meta campaign plan (Facebook & Instagram)" fields={['Business name', 'Product or service', 'Target audience', 'Campaign objective', 'Daily budget', 'Special offer']} onResult={r => saveArtifact('meta_campaign', `${r.campaignNames?.[0] || 'Meta campaign'}`, r)} callAI={callAI} />}
        {page === 'Google Ads Builder' && <GoogleForm callAI={callAI} onSave={(r: any) => saveArtifact('google_campaign', 'Google campaign plan', r)} />}
        {page === 'Ad Copy Generator' && <GenForm kind="ad_copy" title="Ad copy — 5 variations + compliance review" fields={['Platform', 'Product or service', 'Target audience', 'Objective', 'Brand tone', 'Offer']} onResult={r => saveArtifact('ad_copy', 'Ad copy ×5', r)} callAI={callAI} />}
        {page === 'Creative Studio' && <CreativeStudio callAI={callAI} onSave={(r: any) => saveArtifact('creative_concept', 'Creative concept', r)} />}
        {page === 'Audience Planner' && <GenForm kind="audience_plan" title="Audience plan — suggestions only, not verified platform segments" fields={['Industry', 'Product or service', 'Offer', 'Target country', 'Objective']} onResult={r => saveArtifact('audience_plan', 'Audience plan', r)} callAI={callAI} />}
        {page === 'Campaign Analyzer' && <Analyzer metrics={metrics} uid={uid} onReload={() => loadAll(uid)} setError={setError} setNotice={setNotice} />}
        {page === 'Landing Page Builder' && <LandingPage callAI={callAI} onSave={(r: any) => saveArtifact('landing_page', r.heroHeadline || 'Landing page', r)} />}
        {page === 'Tracking & Analytics' && <Tracking tracking={tracking} uid={uid} onReload={() => loadAll(uid)} setError={setError} />}
        {page === 'Budget Optimizer' && <GenForm kind="budget_plan" title="Budget plan — Conservative / Balanced / Growth-focused" fields={['Total budget', 'Platforms', 'Objective', 'Target cost per lead']} onResult={r => saveArtifact('budget_plan', 'Budget plan', r)} callAI={callAI} />}
        {page === 'Marketing Reports' && <Reports metrics={metrics} callAI={callAI} onSave={(r: any) => saveArtifact('report', 'Marketing report', r)} />}
        {page === 'Client Management' && <Clients clients={clients} tasks={tasks} uid={uid} onReload={() => loadAll(uid)} setError={setError} setNotice={setNotice} />}
        {page === 'AI Assistant' && <Assistant uid={uid} />}
        {page === 'Integrations' && <Integrations integrations={integrations} uid={uid} onReload={() => loadAll(uid)} setError={setError} />}
        {page === 'Plans & Pricing' && <Plans profile={profile} uid={uid} onReload={() => loadAll(uid)} setError={setError} />}
        {page === 'Settings' && <Settings profile={profile} uid={uid} onReload={() => loadAll(uid)} setError={setError} setNotice={setNotice} session={session} />}
        {page === 'Help Center' && <Card title="Help Center"><details className="mb-2"><summary className="font-semibold cursor-pointer">How do I get AI generation working?</summary><p className="text-sm text-slate-600 mt-1">Add AI_API_KEY as a server Environment Variable in Vercel (never in the browser or GitHub), then redeploy. If it is missing, the API returns a clear error instead of fake content.</p></details><details className="mb-2"><summary className="font-semibold cursor-pointer">Why do Analyzer and Reports show “no data”?</summary><p className="text-sm text-slate-600 mt-1">They calculate only from metric rows you enter. They never invent impressions, spend, or revenue.</p></details><details><summary className="font-semibold cursor-pointer">Does this publish ads?</summary><p className="text-sm text-slate-600 mt-1">No. Generating a plan is not publishing. Publishing requires a separate, explicitly authorized Meta/Google OAuth connection, which is not in this build.</p></details></Card>}
      </main>
    </div>
  )
}

// ---------- professional result rendering (no raw JSON) ----------
// Renders only data returned by the existing /api/ai-generate backend.
// No mock data, no hardcoded campaign results: every value below comes
// from the `result` argument, and missing fields are simply skipped.
function formatLabel(key: string): string {
  const map: Record<string, string> = {
    campaignNames: 'Campaign Names', primaryTexts: 'Primary Texts',
    callToActions: 'Call To Actions', callToAction: 'Call To Action',
    adSets: 'Ad Sets', creativeConcepts: 'Creative Concepts',
    testingIdeas: 'Testing Ideas', trackingChecklist: 'Tracking Checklist',
    heroHeadline: 'Hero Headline', heroSubheadline: 'Hero Subheadline',
    campaignStructure: 'Campaign Structure', negativeKeywords: 'Negative Keywords',
    biddingSuggestion: 'Bidding Suggestion', budgetNote: 'Budget Note',
    executiveSummary: 'Executive Summary', nextMonthPlan: 'Next Month Plan',
    complianceFlags: 'Compliance Flags', displayConcepts: 'Display Concepts',
    videoScript: 'Video Script',
  }
  if (map[key]) return map[key]
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
const COPYABLE_KEYS = new Set(['headlines', 'headline', 'primaryTexts', 'primaryText', 'descriptions', 'description'])
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return <button type="button" className={btnGhost + ' !py-1 !px-2 text-xs shrink-0'} onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
}
function CopyText({ text }: { text: string }) {
  return <div className="flex items-start justify-between gap-2"><p className="text-sm text-slate-700 flex-1 whitespace-pre-wrap">{text}</p><CopyButton text={text} /></div>
}
function ObjectCard({ obj }: { obj: Row }) {
  const title = obj.name || obj.title || obj.angle || obj.headline || null
  const rest = Object.entries(obj).filter(([k, v]) => v !== title && k !== 'name' && k !== 'title')
  return <div className="bg-white border border-slate-200 rounded-xl p-4">
    {title && <h5 className="font-bold text-[#0b1e3a] mb-2">{String(title)}</h5>}
    <div className="space-y-3">{rest.map(([k, v]) => <ResultValue key={k} name={k} value={v} />)}</div>
  </div>
}
function ResultValue({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value)
    if (COPYABLE_KEYS.has(name)) return <CopyText text={text} />
    return <p className="text-sm text-slate-700 whitespace-pre-wrap">{text}</p>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-slate-500">None.</p>
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      if (COPYABLE_KEYS.has(name)) {
        return <div className="grid gap-2 sm:grid-cols-2">{value.map((v, i) => <div key={i} className="bg-white border border-slate-200 rounded-xl p-3"><CopyText text={String(v)} /></div>)}</div>
      }
      return <ul className="list-disc ml-5 space-y-1 text-sm text-slate-700">{value.map((v, i) => <li key={i}>{String(v)}</li>)}</ul>
    }
    return <div className="grid gap-3 md:grid-cols-2">{value.map((v, i) => typeof v === 'object' && v !== null ? <ObjectCard key={i} obj={v as Row} /> : <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-700">{String(v)}</div>)}</div>
  }
  if (typeof value === 'object') {
    const obj = value as Row
    if (obj.name || obj.title || obj.angle) return <ObjectCard obj={obj} />
    return <div className="space-y-3">{Object.entries(obj).map(([k, v]) => <ResultValue key={k} name={k} value={v} />)}</div>
  }
  return null
}
function ResultField({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null
  return <div className="mb-4"><h4 className="font-semibold text-[#0b1e3a] mb-1">{formatLabel(name)}</h4><ResultValue name={name} value={value} /></div>
}
function ResultView({ result, kind }: { result: any; kind: string }) {
  if (!result) return null
  if (typeof result === 'string') return <div className="mt-4"><CopyText text={result} /></div>
  if (typeof result.raw === 'string' && Object.keys(result).length === 1) {
    return <div className="mt-4"><p className="text-sm text-slate-600 mb-2">The AI returned plain text instead of a structured plan:</p><CopyText text={result.raw} /></div>
  }
  const handled = new Set<string>()
  const rest = () => Object.entries(result).filter(([k]) => !handled.has(k)).map(([k, v]) => <ResultField key={k} name={k} value={v} />)
  if (kind === 'meta_campaign') {
    handled.add('campaignNames'); handled.add('objective'); handled.add('adSets'); handled.add('headlines'); handled.add('primaryTexts'); handled.add('callToActions')
    return <div className="mt-4 space-y-5">
      {Array.isArray(result.campaignNames) && result.campaignNames.length > 0 && <section><h3 className="font-bold text-[#0b1e3a] mb-2">Campaign Names</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{result.campaignNames.map((n: string, i: number) => <div key={i} className="bg-[#0b1e3a] text-white rounded-xl p-4"><p className="text-xs text-blue-200 mb-1">Campaign {i + 1}</p><p className="font-semibold">{n}</p></div>)}</div></section>}
      {result.objective && <section className="bg-blue-50 border border-blue-200 rounded-xl p-4"><h3 className="font-bold text-[#0b1e3a]">Campaign Objective</h3><p className="text-sm text-slate-700 mt-1">{String(result.objective)}</p></section>}
      {Array.isArray(result.adSets) && result.adSets.length > 0 && <section><h3 className="font-bold text-[#0b1e3a] mb-2">Ad Sets</h3><div className="grid gap-3 md:grid-cols-2">{result.adSets.map((s: Row, i: number) => <ObjectCard key={i} obj={s} />)}</div></section>}
      {Array.isArray(result.headlines) && result.headlines.length > 0 && <section><h3 className="font-bold text-[#0b1e3a] mb-2">Headlines</h3><div className="grid gap-2 sm:grid-cols-2">{result.headlines.map((h: string, i: number) => <div key={i} className="bg-white border border-slate-200 rounded-xl p-3"><CopyText text={h} /></div>)}</div></section>}
      {Array.isArray(result.primaryTexts) && result.primaryTexts.length > 0 && <section><h3 className="font-bold text-[#0b1e3a] mb-2">Primary Texts</h3><div className="grid gap-3 md:grid-cols-2">{result.primaryTexts.map((t: string, i: number) => <div key={i} className="bg-white border border-slate-200 rounded-xl p-4"><CopyText text={t} /></div>)}</div></section>}
      {Array.isArray(result.callToActions) && result.callToActions.length > 0 && <section><h3 className="font-bold text-[#0b1e3a] mb-2">Call To Actions</h3><div className="flex flex-wrap gap-2">{result.callToActions.map((c: string, i: number) => <span key={i} className="bg-[#2563eb] text-white text-sm font-semibold px-3 py-1.5 rounded-full">{c}</span>)}</div></section>}
      {rest()}
    </div>
  }
  if (Array.isArray(result.variations)) {
    handled.add('variations'); handled.add('complianceFlags')
    return <div className="mt-4 space-y-4">
      {result.variations.map((v: Row, i: number) => <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
        <h3 className="font-bold text-[#0b1e3a] mb-3">Variation {i + 1}{v.angle ? ` — ${v.angle}` : ''}</h3>
        {v.primaryText && <div className="mb-3"><h4 className="font-semibold text-[#0b1e3a] mb-1">Primary Text</h4><CopyText text={String(v.primaryText)} /></div>}
        {v.headline && <div className="mb-3"><h4 className="font-semibold text-[#0b1e3a] mb-1">Headline</h4><CopyText text={String(v.headline)} /></div>}
        {v.description && <div className="mb-3"><h4 className="font-semibold text-[#0b1e3a] mb-1">Description</h4><CopyText text={String(v.description)} /></div>}
        {v.callToAction && <span className="bg-[#2563eb] text-white text-sm font-semibold px-3 py-1.5 rounded-full">{String(v.callToAction)}</span>}
      </div>)}
      {Array.isArray(result.complianceFlags) && result.complianceFlags.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900"><strong>Compliance flags — review before use:</strong><ul className="list-disc ml-5 mt-1">{result.complianceFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>}
      {rest()}
    </div>
  }
  return <div className="mt-4">{Object.entries(result).map(([k, v]) => <ResultField key={k} name={k} value={v} />)}</div>
}

// ---------- generator form ----------
function GenForm({ kind, title, fields, onResult, callAI }: {
  kind: string
  title: string
  fields: string[]
  onResult: (result: { campaignNames?: string[]; [key: string]: unknown }) => void
  callAI: (kind: string, prompt: string, context?: string) => Promise<Record<string, unknown>>
}) {
  const [form, set] = useForm(Object.fromEntries(fields.map((f: string) => [f, ''])))
  const [result, setResult] = useState<any>(null)
  const [formError, setFormError] = useState('')
  async function run(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    try {
      const prompt = fields.map((f: string) => `${f}: ${form[f]}`).join('\n')
      const r = await callAI(kind, prompt)
      if (!r) throw new Error('AI generation did not return a result.')
      setResult(r)
    } catch (err: any) { setFormError(err?.message || 'AI generation failed. Please try again.'); setResult(null) }
  }
  return <Card title={title}>
    <form onSubmit={run}>
      {fields.map((f: string) => <Field key={f} label={f}><input className={inputCls} value={form[f]} onChange={set(f)} required /></Field>)}
      <button className={btnCls}>Generate</button>
    </form>
    {formError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mt-4 text-sm">Generation failed: {formError} Nothing was saved.</div>}
    {result && <div className="mt-4"><ResultView result={result} kind={kind} /><button className={btnCls + ' mt-4'} onClick={() => onResult(result)}>Save this result</button></div>}
  </Card>
}

function GoogleForm({ callAI, onSave }: any) {
  const [form, set] = useForm({ Business: '', Website: '', Keywords: '', Budget: '', Objective: '' })
  const [result, setResult] = useState<any>(null)
  const [formError, setFormError] = useState('')
  async function run(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    try {
      const r = await callAI('google_campaign', `Business: ${form.Business}\nWebsite: ${form.Website}\nKeywords: ${form.Keywords}\nBudget: ${form.Budget}\nObjective: ${form.Objective}`)
      if (!r) throw new Error('AI generation did not return a result.')
      setResult(r)
    } catch (err: any) { setFormError(err?.message || 'AI generation failed. Please try again.'); setResult(null) }
  }
  const badHeadlines = (result?.headlines || []).filter((h: string) => h.length > 30)
  const badDesc = (result?.descriptions || []).filter((d: string) => d.length > 90)
  return <Card title="Google Ads plan — Responsive Search Ad limits checked (30 / 90 characters)">
    <form onSubmit={run}>
      {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} required /></Field>)}
      <button className={btnCls}>Generate Google plan</button>
    </form>
    {formError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mt-4 text-sm">Generation failed: {formError} Nothing was saved.</div>}
    {result && <div className="mt-4">
      {badHeadlines.length > 0 && <p className="text-red-700 text-sm">⚠ {badHeadlines.length} headline(s) exceed 30 characters — edit them before use: {badHeadlines.join(' | ')}</p>}
      {badDesc.length > 0 && <p className="text-red-700 text-sm">⚠ {badDesc.length} description(s) exceed 90 characters.</p>}
      <p className="text-sm text-slate-600">Keyword ideas are ideas only — no search volume, CPC, or competition score is shown, because none is verified here.</p>
      <ResultView result={result} kind="google_campaign" />
      <button className={btnCls + ' mt-4'} onClick={() => onSave(result)}>Save this plan</button>
    </div>}
  </Card>
}

function CreativeStudio({ callAI, onSave }: any) {
  const [form, set] = useForm({ Product: '', Platform: '', Format: '1:1', Headline: '', Style: '' })
  const [result, setResult] = useState<any>(null)
  const [formError, setFormError] = useState('')
  async function run(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    try {
      const r = await callAI('meta_campaign', `Creative concept only. Product: ${form.Product}\nPlatform: ${form.Platform}\nFormat: ${form.Format}\nHeadline: ${form.Headline}\nStyle: ${form.Style}`)
      if (!r) throw new Error('AI generation did not return a result.')
      setResult(r)
    } catch (err: any) { setFormError(err?.message || 'AI generation failed. Please try again.'); setResult(null) }
  }
  return <Card title="Creative Studio">
    <form onSubmit={run}>
      {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} required /></Field>)}
      <button className={btnCls}>Generate creative concept</button>
    </form>
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 text-sm text-amber-900"><strong>Image generation: configuration-required.</strong> No image is shown here, and no fake image is displayed. Real image generation needs an image-provider key set server-side (a later step) — until then, use the concept text below with your own design tool.</div>
    {formError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mt-4 text-sm">Generation failed: {formError} Nothing was saved.</div>}
    {result && <div className="mt-4"><ResultView result={result} kind="meta_campaign" /><button className={btnCls + ' mt-4'} onClick={() => onSave(result)}>Save concept</button></div>}
  </Card>
}

function Analyzer({ metrics, uid, onReload, setError, setNotice }: any) {
  const [form, set, reset] = useForm({ campaign_name: '', platform: 'Meta', impressions: '0', clicks: '0', spend: '0', leads: '0', purchases: '0', revenue: '0', period: '' })
  async function add(e: React.FormEvent) {
    e.preventDefault()
    const row = { user_id: uid, campaign_name: form.campaign_name, platform: form.platform, impressions: Number(form.impressions), clicks: Number(form.clicks), spend: Number(form.spend), leads: Number(form.leads), purchases: Number(form.purchases), revenue: Number(form.revenue), period: form.period }
    const { error } = await supabase.from('metric_rows').insert(row)
    if (error) setError(error.message); else { setNotice('Metric row saved.'); reset({ campaign_name: '', platform: 'Meta', impressions: '0', clicks: '0', spend: '0', leads: '0', purchases: '0', revenue: '0', period: '' }); onReload() }
  }
  async function del(id: string) { await supabase.from('metric_rows').delete().eq('id', id); onReload() }
  return <>
    <Card title="Add a metric row (your own data only)">
      <form onSubmit={add} className="grid md:grid-cols-3 gap-3">
        {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} required={k === 'campaign_name'} /></Field>)}
        <div><button className={btnCls}>Save row</button></div>
      </form>
    </Card>
    <Card title="Calculated results — empty means no data, never invented">
      {metrics.length === 0 ? <Empty text="No metric rows yet. Add a row above, then CTR, CPC, CPL and ROAS will be calculated from it." /> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Campaign</th><th>CTR %</th><th>CPC</th><th>CPL</th><th>ROAS</th><th></th></tr></thead><tbody>
          {metrics.map((m: Row) => { const c = calc(m); return <tr key={m.id} className="border-t"><td>{m.campaign_name}</td><td>{c.ctr === null ? '—' : fmt(c.ctr)}</td><td>{c.cpc === null ? '—' : fmt(c.cpc)}</td><td>{c.cpl === null ? '—' : fmt(c.cpl)}</td><td>{c.roas === null ? '—' : fmt(c.roas)}</td><td><button className="text-red-600" onClick={() => del(m.id)}>Delete</button></td></tr> })}
        </tbody></table></div>
      )}
    </Card>
  </>
}

function LandingPage({ callAI, onSave }: any) {
  const [form, set] = useForm({ Business: '', Product: '', Offer: '', Audience: '' })
  const [result, setResult] = useState<any>(null)
  const [formError, setFormError] = useState('')
  async function run(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    try {
      const r = await callAI('landing_page', `Business: ${form.Business}\nProduct: ${form.Product}\nOffer: ${form.Offer}\nAudience: ${form.Audience}`)
      if (!r) throw new Error('AI generation did not return a result.')
      setResult(r)
    } catch (err: any) { setFormError(err?.message || 'AI generation failed. Please try again.'); setResult(null) }
  }
  function downloadHtml() {
    if (!result) return
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${result.heroHeadline || 'Landing page'}</title></head><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:20px"><h1>${result.heroHeadline || ''}</h1><p>${result.heroSubheadline || ''}</p><ul>${(result.benefits || []).map((b: string) => `<li>${b}</li>`).join('')}</ul><p><button>${result.callToAction || 'Get started'}</button></p><p><small>Testimonials are only shown if you supply real ones. No testimonials are invented here.</small></p></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'landing-page.html'; a.click()
  }
  return <Card title="Landing page builder — preview + HTML export (hosting is a later step)">
    <form onSubmit={run}>
      {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} required /></Field>)}
      <button className={btnCls}>Generate landing page</button>
    </form>
    {formError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mt-4 text-sm">Generation failed: {formError} Nothing was saved.</div>}
    {result && <div className="mt-4 border rounded-2xl p-5 bg-slate-50">
      <h3 className="text-xl font-black">{result.heroHeadline}</h3><p className="text-slate-600">{result.heroSubheadline}</p>
      <ul className="list-disc ml-5 mt-2 text-sm">{(result.benefits || []).map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
      <ResultView result={{ features: result.features, faqs: result.faqs, callToAction: result.callToAction }} kind="landing_page" />
      <button className={btnCls + ' mt-3 mr-2'} onClick={downloadHtml}>Download HTML</button>
      <button className={btnGhost} onClick={() => onSave(result)}>Save page</button>
    </div>}
  </Card>
}

function Tracking({ tracking, uid, onReload, setError }: any) {
  const [form, set] = useForm({ provider: 'Meta Pixel', identifier: '' })
  async function add(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('tracking_configs').insert({ user_id: uid, provider: form.provider, identifier: form.identifier })
    if (error) setError(error.message); else onReload()
  }
  return <Card title="Tracking & Analytics — identifiers only, not verified as active">
    <p className="text-sm text-slate-600 mb-3">Entering an ID does NOT mean tracking is active. Tracking must be installed correctly and verified, and is affected by consent and browser restrictions. Supported events: PageView, ViewContent, Lead, AddToCart, InitiateCheckout, Purchase.</p>
    <form onSubmit={add} className="flex gap-2 flex-wrap">
      <input className={inputCls + ' !w-auto flex-1'} value={form.provider} onChange={set('provider')} placeholder="Provider, e.g. Meta Pixel" />
      <input className={inputCls + ' !w-auto flex-1'} value={form.identifier} onChange={set('identifier')} placeholder="Pixel / Measurement ID" required />
      <button className={btnCls}>Save</button>
    </form>
    {tracking.length === 0 ? <Empty text="No tracking IDs saved yet." /> : tracking.map((t: Row) => <div key={t.id} className="border-b py-2 text-sm flex justify-between"><span>{t.provider}: {t.identifier} — status: saved, not verified</span><button className="text-red-600" onClick={async () => { await supabase.from('tracking_configs').delete().eq('id', t.id); onReload() }}>Delete</button></div>)}
  </Card>
}

function Reports({ metrics, callAI, onSave }: any) {
  const [result, setResult] = useState<any>(null)
  const [formError, setFormError] = useState('')
  async function run() {
    setFormError('')
    try {
      if (metrics.length === 0) { setResult({ note: 'No metric rows yet. Add data in Campaign Analyzer first — this report will not invent results.' }); return }
      const totals = metrics.reduce((a: any, m: Row) => ({ spend: a.spend + Number(m.spend || 0), clicks: a.clicks + Number(m.clicks || 0), leads: a.leads + Number(m.leads || 0), revenue: a.revenue + Number(m.revenue || 0) }), { spend: 0, clicks: 0, leads: 0, revenue: 0 })
      const r = await callAI('report', 'Marketing report', JSON.stringify({ totals, campaigns: metrics.map((m: Row) => m.campaign_name) }))
      if (!r) throw new Error('AI generation did not return a result.')
      setResult(r)
    } catch (err: any) { setFormError(err?.message || 'AI generation failed. Please try again.'); setResult(null) }
  }
  return <Card title="Marketing report — from your saved data only">
    <button className={btnCls} onClick={run}>Generate report from my metric rows</button>
    {formError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mt-4 text-sm">Generation failed: {formError} Nothing was saved.</div>}
    {result && result.note && <p className="text-sm text-slate-600 mt-4">{result.note}</p>}
    {result && !result.note && <ResultView result={result} kind="report" />}
    {result && !result.note && <button className={btnCls + ' mt-4'} onClick={() => onSave(result)}>Save report</button>}
  </Card>
}

function Clients({ clients, tasks, uid, onReload, setError, setNotice }: any) {
  const [cform, cset] = useForm({ name: '', website: '', industry: '', objectives: '' })
  const [tform, tset] = useForm({ title: '' })
  async function addClient(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('clients').insert({ user_id: uid, ...cform })
    if (error) setError(error.message); else { setNotice('Client saved.'); onReload() }
  }
  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('client_tasks').insert({ user_id: uid, title: tform.title })
    if (error) setError(error.message); else onReload()
  }
  return <>
    <Card title="Add client"><form onSubmit={addClient}>{Object.keys(cform).map(k => <Field key={k} label={k}><input className={inputCls} value={(cform as any)[k]} onChange={cset(k as any)} required={k === 'name'} /></Field>)}<button className={btnCls}>Save client</button></form></Card>
    <Card title="Clients">{clients.length === 0 ? <Empty text="No clients yet." /> : clients.map((c: Row) => <div key={c.id} className="flex justify-between border-b py-2 text-sm"><span>{c.name} {c.website ? `— ${c.website}` : ''}</span><button className="text-red-600" onClick={async () => { await supabase.from('clients').delete().eq('id', c.id); onReload() }}>Delete</button></div>)}</Card>
    <Card title="Tasks"><form onSubmit={addTask} className="flex gap-2"><input className={inputCls} value={tform.title} onChange={tset('title')} placeholder="Task title" required /><button className={btnCls}>Add</button></form>
      {tasks.map((t: Row) => <div key={t.id} className="flex justify-between border-b py-2 text-sm"><span><input type="checkbox" checked={t.done} onChange={async () => { await supabase.from('client_tasks').update({ done: !t.done }).eq('id', t.id); onReload() }} /> {t.title}</span><button className="text-red-600" onClick={async () => { await supabase.from('client_tasks').delete().eq('id', t.id); onReload() }}>Delete</button></div>)}
    </Card>
  </>
}

function Assistant({ uid }: any) {
  const [msgs, setMsgs] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { supabase.from('assistant_messages').select('*').order('created_at').then(({ data }) => data && setMsgs(data)) }, [])
  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      await supabase.from('assistant_messages').insert({ user_id: uid, role: 'user', content: q })
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/ai-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ message: q }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Assistant failed.')
      await supabase.from('assistant_messages').insert({ user_id: uid, role: 'assistant', content: j.reply })
      setMsgs(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: j.reply }]); setQ('')
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return <Card title="AI Assistant">
    <div className="space-y-2 mb-4 max-h-96 overflow-auto">{msgs.length === 0 ? <Empty text="Ask about campaigns, copy, audiences, budgets, or reports. Answers use your saved profile/data when available." /> : msgs.map((m, i) => <div key={i} className={`p-3 rounded-lg text-sm ${m.role === 'user' ? 'bg-blue-50 ml-8' : 'bg-slate-100 mr-8'}`}><strong>{m.role}:</strong> {m.content}</div>)}</div>
    {err && <p className="text-red-700 text-sm mb-2">{err}</p>}
    <form onSubmit={send} className="flex gap-2"><input className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder="Ask a marketing question…" required /><button className={btnCls} disabled={busy}>{busy ? 'Thinking…' : 'Send'}</button></form>
  </Card>
}

function Integrations({ integrations, uid, onReload, setError }: any) {
  const [oauthMsg, setOauthMsg] = useState('')
  // Full Meta OAuth (not the old read-only test): the server exchanges
  // the code, encrypts the long-lived token, and stores it server-side
  // only. The callback redirects back with only a flag — no token ever
  // reaches the browser. Meta status is read from /api/meta/status.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get('oauth')
    if (!oauth) return
    window.history.replaceState({}, '', window.location.pathname)
    if (oauth === 'meta_connected') {
      setOauthMsg('Meta account connected. Your token is stored encrypted on the server only. No campaign was created or launched by connecting.')
      onReload()
    } else if (oauth === 'meta_cancelled') {
      setOauthMsg('Meta connection cancelled. Nothing was connected and no campaign was changed.')
    } else if (oauth === 'meta_unlinked') {
      setError('Meta connection could not be linked to your signed-in account. Please click Connect Meta Account in the dashboard while signed in, then try again.')
    } else if (oauth === 'google_connected') {
      supabase.from('integrations').upsert({
        user_id: uid, provider: 'Google Ads API', status: 'connected',
        config: { readOnlyTest: true, scope: 'https://www.googleapis.com/auth/adwords', publishingEnabled: false, tokenStored: false, connectedAt: new Date().toISOString() },
      }, { onConflict: 'user_id,provider' }).then(({ error }) => {
        if (error) setError(error.message)
        else { setOauthMsg('Google connected for a read-only test. No ads are published, and no access token was stored.'); onReload() }
      })
    } else if (oauth === 'meta_error' || oauth === 'google_error') {
      setError('That connection did not complete. Check the Vercel environment variables and the exact redirect URI in the Meta/Google console, then try Connect again. No ads were published.')
    }
  }, [])
  const providers = [
    ['Google Ads API', 'Connect uses the Google Ads read-only scope only. Publishing is NOT requested here and needs a separate approval step. A developer token and API approval are still required for live use.'],
    ['Google Analytics 4', 'Enter a Measurement ID in Tracking. Verification is a later step.'],
    ['Google Tag Manager', 'Enter a Container ID in Tracking. Verification is a later step.'],
    ['Meta Pixel & Conversions API', 'Enter a Pixel ID in Tracking. Server-side tokens must stay server-side only.'],
    ['AI text provider', 'Set AI_API_KEY in Vercel Environment Variables only. Never in the browser or GitHub.'],
    ['AI image provider', 'Configuration-required. No image provider is connected in this build.'],
    ['Landing page hosting', 'Pages export as HTML here. Custom-domain hosting is a later step.'],
  ]
  const statusOf = (p: string) => integrations.find((i: Row) => i.provider === p)?.status || 'not_configured'
  async function save(p: string) {
    const { error } = await supabase.from('integrations').upsert({ user_id: uid, provider: p, status: 'saved_unverified', config: {} }, { onConflict: 'user_id,provider' })
    if (error) setError(error.message); else onReload()
  }
  async function disconnect(p: string) {
    await supabase.from('integrations').update({ status: 'disconnected' }).eq('provider', p).eq('user_id', uid); onReload()
  }
  return <>
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-900"><strong>Nothing is published without your explicit authorization.</strong> Connecting Meta below does not create, launch, or change any campaign. Campaigns are created as PAUSED by default and only become ACTIVE if you explicitly confirm launch. Tokens are never shown in this browser.</div>
    {oauthMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-sm text-green-900">{oauthMsg}</div>}
    <MetaConnect uid={uid} onReload={onReload} setError={setError} />
    {providers.map(([p, note]) => <Card key={p} title={`${p} — ${statusOf(p) === 'connected' ? 'Connected (read-only test)' : statusOf(p) === 'saved_unverified' ? 'Saved, not verified' : statusOf(p) === 'disconnected' ? 'Disconnected' : 'Not connected'}`}>
      <p className="text-sm text-slate-600 mb-3">{note}</p>
      {p === 'Google Ads API' && <a className={btnGhost + ' mr-2 inline-block'} href="/api/auth/google">Connect with Google (read-only test)</a>}
      <button className={btnGhost + ' mr-2'} onClick={() => save(p)}>Save as not verified</button>
      <button className={btnGhost} onClick={() => disconnect(p)}>Disconnect</button>
    </Card>)}
  </>
}

function MetaConnect({ uid, onReload, setError }: any) {
  const [status, setStatus] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selected, setSelected] = useState('')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [insights, setInsights] = useState<any[]>([])
  const [loading, setLoading] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [datePreset, setDatePreset] = useState('last_30d')
  const [createForm, setCreateForm] = useState({ name: '', objective: 'OUTCOME_LEADS', daily_budget: '' })
  const [confirmLaunch, setConfirmLaunch] = useState(false)
  const [confirmResume, setConfirmResume] = useState(false)
  const [actionBusy, setActionBusy] = useState('')

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Please sign in first.')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }
  async function loadStatus() {
    setLoading('status'); setErr('')
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/meta/status', { headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load Meta status.')
      setStatus(j)
      if (j.connected) await loadAccounts()
    } catch (e: any) { setErr(e.message) } finally { setLoading('') }
  }
  async function loadAccounts() {
    setLoading('accounts'); setErr('')
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/meta/ad-accounts', { headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load ad accounts.')
      setAccounts(j.accounts || [])
      if ((j.accounts || []).length === 0) setMsg('No ad accounts found for this Meta account.')
      else if (!selected) setSelected(j.accounts[0].id)
    } catch (e: any) { setErr(e.message) } finally { setLoading('') }
  }
  async function loadCampaigns() {
    if (!selected) { setErr('Select an ad account first.'); return }
    setLoading('campaigns'); setErr('')
    try {
      const headers = await authHeaders()
      const r = await fetch(`/api/meta/campaigns?ad_account_id=${encodeURIComponent(selected)}`, { headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load campaigns.')
      setCampaigns(j.campaigns || [])
      if ((j.campaigns || []).length === 0) setMsg('No campaigns in this ad account yet.')
    } catch (e: any) { setErr(e.message) } finally { setLoading('') }
  }
  async function loadInsights(campaignId = '') {
    if (!selected) { setErr('Select an ad account first.'); return }
    setLoading('insights'); setErr('')
    try {
      const headers = await authHeaders()
      const url = `/api/meta/insights?ad_account_id=${encodeURIComponent(selected)}&date_preset=${datePreset}${campaignId ? `&campaign_id=${encodeURIComponent(campaignId)}` : ''}`
      const r = await fetch(url, { headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load insights.')
      setInsights(j.insights || [])
      if ((j.insights || []).length === 0) setMsg('No insights for this selection and date range.')
    } catch (e: any) { setErr(e.message) } finally { setLoading('') }
  }
  async function connectMeta(e: React.MouseEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/meta/oauth-init', { method: 'POST', headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not start Meta connection.')
      // Plain link target, after a signed-in init step: /api/auth/meta/start
      window.location.href = j.startUrl || '/api/auth/meta/start'
    } catch (e: any) { setErr(e.message) }
  }
  async function disconnectMeta() {
    setErr(''); setMsg('')
    try {
      const headers = await authHeaders()
      const r = await fetch('/api/auth/meta/disconnect', { method: 'POST', headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not disconnect.')
      setStatus(null); setAccounts([]); setCampaigns([]); setInsights([]); setSelected(''); setMsg('Meta account disconnected. The stored token was deleted.'); onReload()
    } catch (e: any) { setErr(e.message) }
  }
  async function createCampaign(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setMsg(''); setActionBusy('create')
    try {
      if (!selected) throw new Error('Select an ad account first.')
      if (!createForm.name.trim()) throw new Error('Campaign name is required.')
      const headers = await authHeaders()
      const body: any = { ad_account_id: selected, name: createForm.name.trim(), objective: createForm.objective }
      if (createForm.daily_budget) body.daily_budget = Number(createForm.daily_budget)
      // Explicit launch only: both the ACTIVE choice AND the checkbox are required.
      if (confirmLaunch) { body.confirmLaunch = true; body.status = 'ACTIVE' } else { body.status = 'PAUSED' }
      const r = await fetch('/api/meta/campaigns', { method: 'POST', headers, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not create campaign.')
      setMsg(j.note || `Campaign created (${j.status || 'PAUSED'}).`)
      setCreateForm({ name: '', objective: 'OUTCOME_LEADS', daily_budget: '' }); setConfirmLaunch(false)
      await loadCampaigns()
    } catch (e: any) { setErr(e.message) } finally { setActionBusy('') }
  }
  async function campaignAction(campaign: any, action: 'pause' | 'resume' | 'update') {
    setErr(''); setMsg(''); setActionBusy(`${action}-${campaign.id}`)
    try {
      if (action === 'resume' && !confirmResume) throw new Error('To resume, first tick the “I confirm I want to resume / activate” checkbox below.')
      const headers = await authHeaders()
      const body: any = { ad_account_id: selected, campaign_id: campaign.id, action }
      if (action === 'resume') body.confirmResume = true
      const r = await fetch('/api/meta/campaigns', { method: 'PATCH', headers, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Campaign action failed.')
      setMsg(`Campaign ${action}d.`)
      await loadCampaigns()
    } catch (e: any) { setErr(e.message) } finally { setActionBusy('') }
  }

  useEffect(() => { loadStatus() }, [])
  const statusLabel = !status ? 'Not checked yet' : status.connected ? 'Connected' : status.needsReconnect ? 'Needs reconnect — token expired or revoked' : 'Not connected'
  return <Card title={`Meta Marketing API — ${statusLabel}`}>
    <p className="text-sm text-slate-600 mb-3">Create &amp; manage ads and measure ad performance, with your explicit action only. Connecting does not create or launch a campaign. Campaigns are created as PAUSED unless you explicitly confirm launch. Tokens are stored encrypted on the server only and are never shown here.</p>
    {err && <p className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-3 text-sm">{err}</p>}
    {msg && <p className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 mb-3 text-sm">{msg}</p>}
    {loading && <p className="text-sm text-slate-600 mb-3">Loading {loading}… please wait.</p>}
    <div className="flex gap-2 flex-wrap mb-4">
      <a className={btnCls + ' inline-block'} href="/api/auth/meta/start" onClick={connectMeta}>Connect Meta Account</a>
      <button className={btnGhost} onClick={loadStatus}>Refresh status</button>
      {status?.connected && <button className={btnGhost} onClick={loadAccounts}>Load ad accounts</button>}
      {status?.connected && <button className={btnGhost} onClick={disconnectMeta}>Disconnect Meta</button>}
    </div>
    {status && <p className="text-sm text-slate-700 mb-3">Status: {statusLabel}{status.metaUserId ? ` • Meta user: ${status.metaUserId}` : ''}{status.tokenExpiresAt ? ` • Token expires: ${new Date(status.tokenExpiresAt).toLocaleDateString()}` : ''}{status.scopes ? ` • Scopes: ${status.scopes}` : ''}</p>}
    {accounts.length > 0 && <div className="mb-4">
      <Field label="Ad account"><select className={inputCls} value={selected} onChange={e => setSelected(e.target.value)}>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.id}) — {a.account_status}</option>)}</select></Field>
      <div className="flex gap-2 flex-wrap">
        <button className={btnCls} onClick={loadCampaigns}>Load campaigns</button>
        <button className={btnGhost} onClick={() => loadInsights()}>Load account insights</button>
        <Field label="Date range"><select className={inputCls} value={datePreset} onChange={e => setDatePreset(e.target.value)}><option value="last_7d">Last 7 days</option><option value="last_30d">Last 30 days</option><option value="last_90d">Last 90 days</option></select></Field>
      </div>
    </div>}
    {accounts.length === 0 && status?.connected && <Empty text="No ad accounts found yet. Click Load ad accounts, or check that this Meta user has access to a Business Manager ad account." />}
    {campaigns.length > 0 && <div className="mb-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Campaign</th><th>Objective</th><th>Status</th><th></th></tr></thead><tbody>
      {campaigns.map((c: any) => <tr key={c.id} className="border-t"><td>{c.name}<div className="text-xs text-slate-500">{c.id}</div></td><td>{c.objective}</td><td>{c.effective_status || c.status}</td><td className="space-x-2">
        <button className={btnGhost} disabled={actionBusy === `pause-${c.id}`} onClick={() => campaignAction(c, 'pause')}>Pause</button>
        <button className={btnGhost} disabled={actionBusy === `resume-${c.id}`} onClick={() => campaignAction(c, 'resume')}>Resume</button>
        <button className={btnGhost} onClick={() => loadInsights(c.id)}>Insights</button>
      </td></tr>)}
    </tbody></table></div>}
    {campaigns.length === 0 && selected && <Empty text="No campaigns loaded yet. Click Load campaigns above." />}
    <label className="flex items-center gap-2 text-sm mb-4"><input type="checkbox" checked={confirmResume} onChange={e => setConfirmResume(e.target.checked)} /> I confirm I want to resume / activate a campaign (required before Resume works).</label>
    {selected && <form onSubmit={createCampaign} className="border rounded-lg p-3 mb-4">
      <h3 className="font-bold mb-2">Create a campaign — PAUSED by default</h3>
      <Field label="Campaign name"><input className={inputCls} value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required /></Field>
      <Field label="Objective"><select className={inputCls} value={createForm.objective} onChange={e => setCreateForm({ ...createForm, objective: e.target.value })}><option value="OUTCOME_LEADS">Leads</option><option value="OUTCOME_SALES">Sales</option><option value="OUTCOME_TRAFFIC">Traffic</option><option value="OUTCOME_AWARENESS">Awareness</option><option value="OUTCOME_ENGAGEMENT">Engagement</option><option value="OUTCOME_APP_PROMOTION">App promotion</option></select></Field>
      <Field label="Daily budget (optional, in account currency minor units as Meta expects)"><input className={inputCls} value={createForm.daily_budget} onChange={e => setCreateForm({ ...createForm, daily_budget: e.target.value })} placeholder="e.g. 1000" /></Field>
      <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={confirmLaunch} onChange={e => setConfirmLaunch(e.target.checked)} /> I confirm I want to launch this campaign as ACTIVE right now. If unticked, it is created as PAUSED and will not spend.</label>
      <button className={btnCls} disabled={!!actionBusy}>{actionBusy === 'create' ? 'Creating…' : 'Create campaign'}</button>
    </form>}
    {insights.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Impressions</th><th>Clicks</th><th>Spend</th><th>Reach</th><th>CTR</th><th>CPC</th><th>CPM</th></tr></thead><tbody>
      {insights.map((row: any, i: number) => <tr key={i} className="border-t"><td>{row.impressions ?? '—'}</td><td>{row.clicks ?? '—'}</td><td>{row.spend ?? '—'}</td><td>{row.reach ?? '—'}</td><td>{row.ctr ?? '—'}</td><td>{row.cpc ?? '—'}</td><td>{row.cpm ?? '—'}</td></tr>)}
    </tbody></table></div>}
  </Card>
}

function Plans({ profile, uid, onReload, setError }: any) {
  const plans = [['starter', 'Starter', 'Basic AI copy, limited creatives, basic planning.'], ['pro', 'Pro', 'Advanced campaigns, audience planning, analyzer, landing pages, reports.'], ['agency', 'Agency', 'Multiple clients, advanced reporting, higher limits, client branding.']]
  async function choose(plan: string) {
    const { error } = await supabase.from('profiles').update({ plan }).eq('user_id', uid)
    if (error) setError(error.message); else onReload()
  }
  return <Card title="Plans & Pricing — no payment is charged in this build">
    <p className="text-sm text-slate-600 mb-3">Choosing a plan only changes your profile plan. No payment provider is connected yet, so no money is taken. That is a later step.</p>
    {plans.map(([id, name, desc]) => <div key={id} className="border rounded-lg p-3 mb-2 flex justify-between items-center"><div><strong>{name}</strong><p className="text-sm text-slate-600">{desc}</p></div><button className={btnCls} disabled={profile?.plan === id} onClick={() => choose(id)}>{profile?.plan === id ? 'Current plan' : 'Choose'}</button></div>)}
  </Card>
}

function Settings({ profile, uid, onReload, setError, setNotice, session }: any) {
  const [form, set] = useForm({ business_name: profile?.business_name || '', owner_name: profile?.owner_name || '', industry: profile?.industry || '', website: profile?.website || '', target_country: profile?.target_country || '', monthly_budget: String(profile?.monthly_budget || ''), business_type: profile?.business_type || '', objectives: profile?.objectives || '' })
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = { user_id: uid, email: session.user.email, business_name: form.business_name, owner_name: form.owner_name, industry: form.industry, website: form.website, target_country: form.target_country, monthly_budget: form.monthly_budget ? Number(form.monthly_budget) : null, business_type: form.business_type, objectives: form.objectives }
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) setError(error.message); else { setNotice('Profile saved.'); onReload() }
  }
  async function deleteMyData() {
    if (!confirm('Delete all your saved artifacts, clients, metrics, tasks, tracking, integrations, and assistant messages? This cannot be undone.')) return
    for (const t of ['artifacts', 'clients', 'metric_rows', 'client_tasks', 'tracking_configs', 'integrations', 'assistant_messages']) {
      await supabase.from(t).delete().eq('user_id', uid)
    }
    setNotice('Your saved data was deleted. Your account itself is not deleted by this button.'); onReload()
  }
  return <>
    <Card title="Business profile & onboarding — update anytime">
      <form onSubmit={save}>
        {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} /></Field>)}
        <button className={btnCls}>Save profile</button>
      </form>
    </Card>
    <Card title="Danger zone"><p className="text-sm text-slate-600 mb-3">Delete your saved workspace data (not your Supabase login itself).</p><button className="bg-red-600 text-white px-4 py-2 rounded-lg" onClick={deleteMyData}>Delete my saved data</button></Card>
  </>
}
