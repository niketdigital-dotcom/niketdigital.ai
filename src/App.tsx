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

// ---------- generator form ----------
function GenForm({ kind, title, fields, onResult, callAI }: any) {
  const [form, set] = useForm(Object.fromEntries(fields.map((f: string) => [f, ''])))
  const [result, setResult] = useState<any>(null)
  async function run(e: React.FormEvent) {
    e.preventDefault()
    const prompt = fields.map((f: string) => `${f}: ${form[f]}`).join('\n')
    const r = await callAI(kind, prompt)
    setResult(r)
  }
  return <Card title={title}>
    <form onSubmit={run}>
      {fields.map((f: string) => <Field key={f} label={f}><input className={inputCls} value={form[f]} onChange={set(f)} required /></Field>)}
      <button className={btnCls}>Generate</button>
    </form>
    {result && <div className="mt-4"><pre className="bg-slate-50 border rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre><button className={btnCls + ' mt-3'} onClick={() => onResult(result)}>Save this result</button></div>}
  </Card>
}

function GoogleForm({ callAI, onSave }: any) {
  const [form, set] = useForm({ Business: '', Website: '', Keywords: '', Budget: '', Objective: '' })
  const [result, setResult] = useState<any>(null)
  async function run(e: React.FormEvent) {
    e.preventDefault()
    const r = await callAI('google_campaign', `Business: ${form.Business}\nWebsite: ${form.Website}\nKeywords: ${form.Keywords}\nBudget: ${form.Budget}\nObjective: ${form.Objective}`)
    setResult(r)
  }
  const badHeadlines = (result?.headlines || []).filter((h: string) => h.length > 30)
  const badDesc = (result?.descriptions || []).filter((d: string) => d.length > 90)
  return <Card title="Google Ads plan — Responsive Search Ad limits checked (30 / 90 characters)">
    <form onSubmit={run}>
      {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} required /></Field>)}
      <button className={btnCls}>Generate Google plan</button>
    </form>
    {result && <div className="mt-4">
      {badHeadlines.length > 0 && <p className="text-red-700 text-sm">⚠ {badHeadlines.length} headline(s) exceed 30 characters — edit them before use: {badHeadlines.join(' | ')}</p>}
      {badDesc.length > 0 && <p className="text-red-700 text-sm">⚠ {badDesc.length} description(s) exceed 90 characters.</p>}
      <p className="text-sm text-slate-600">Keyword ideas are ideas only — no search volume, CPC, or competition score is shown, because none is verified here.</p>
      <pre className="bg-slate-50 border rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap mt-2">{JSON.stringify(result, null, 2)}</pre>
      <button className={btnCls + ' mt-3'} onClick={() => onSave(result)}>Save this plan</button>
    </div>}
  </Card>
}

function CreativeStudio({ callAI, onSave }: any) {
  const [form, set] = useForm({ Product: '', Platform: '', Format: '1:1', Headline: '', Style: '' })
  const [result, setResult] = useState<any>(null)
  async function run(e: React.FormEvent) {
    e.preventDefault()
    const r = await callAI('meta_campaign', `Creative concept only. Product: ${form.Product}\nPlatform: ${form.Platform}\nFormat: ${form.Format}\nHeadline: ${form.Headline}\nStyle: ${form.Style}`)
    setResult(r)
  }
  return <Card title="Creative Studio">
    <form onSubmit={run}>
      {Object.keys(form).map(k => <Field key={k} label={k}><input className={inputCls} value={(form as any)[k]} onChange={set(k as any)} required /></Field>)}
      <button className={btnCls}>Generate creative concept</button>
    </form>
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 text-sm text-amber-900"><strong>Image generation: configuration-required.</strong> No image is shown here, and no fake image is displayed. Real image generation needs an image-provider key set server-side (a later step) — until then, use the concept text below with your own design tool.</div>
    {result && <div className="mt-4"><pre className="bg-slate-50 border rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre><button className={btnCls + ' mt-3'} onClick={() => onSave(result)}>Save concept</button></div>}
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
  async function run(e: React.FormEvent) {
    e.preventDefault()
    const r = await callAI('landing_page', `Business: ${form.Business}\nProduct: ${form.Product}\nOffer: ${form.Offer}\nAudience: ${form.Audience}`)
    setResult(r)
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
    {result && <div className="mt-4 border rounded-2xl p-5 bg-slate-50">
      <h3 className="text-xl font-black">{result.heroHeadline}</h3><p className="text-slate-600">{result.heroSubheadline}</p>
      <ul className="list-disc ml-5 mt-2 text-sm">{(result.benefits || []).map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
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
  async function run() {
    if (metrics.length === 0) { setResult({ note: 'No metric rows yet. Add data in Campaign Analyzer first — this report will not invent results.' }); return }
    const totals = metrics.reduce((a: any, m: Row) => ({ spend: a.spend + Number(m.spend || 0), clicks: a.clicks + Number(m.clicks || 0), leads: a.leads + Number(m.leads || 0), revenue: a.revenue + Number(m.revenue || 0) }), { spend: 0, clicks: 0, leads: 0, revenue: 0 })
    const r = await callAI('report', 'Marketing report', JSON.stringify({ totals, campaigns: metrics.map((m: Row) => m.campaign_name) }))
    setResult(r)
  }
  return <Card title="Marketing report — from your saved data only">
    <button className={btnCls} onClick={run}>Generate report from my metric rows</button>
    {result && <pre className="bg-slate-50 border rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap mt-4">{JSON.stringify(result, null, 2)}</pre>}
    {result && !result.note && <button className={btnCls + ' mt-3'} onClick={() => onSave(result)}>Save report</button>}
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
  const providers = [
    ['Meta Marketing API', 'Needs a Meta developer app, Business Manager access, and ads permissions. OAuth + review are later steps.'],
    ['Google Ads API', 'Needs a Google Ads developer token, OAuth consent, and API access approval. Publishing is a later step.'],
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
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-900"><strong>Nothing is published without your explicit authorization.</strong> Saving a card here only records “saved, not verified.” It does not connect an ad account, does not publish ads, and does not change live budgets.</div>
    {providers.map(([p, note]) => <Card key={p} title={`${p} — ${statusOf(p) === 'connected' ? 'Connected' : statusOf(p) === 'saved_unverified' ? 'Saved, not verified' : statusOf(p) === 'disconnected' ? 'Disconnected' : 'Not connected'}`}>
      <p className="text-sm text-slate-600 mb-3">{note}</p>
      <button className={btnGhost + ' mr-2'} onClick={() => save(p)}>Save as not verified</button>
      <button className={btnGhost} onClick={() => disconnect(p)}>Disconnect</button>
    </Card>)}
  </>
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
