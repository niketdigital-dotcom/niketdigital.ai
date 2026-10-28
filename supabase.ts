import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    'Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (local) or Vercel Environment Variables (deployed). The app will show a setup message instead of crashing.'
  )
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key')
export const isSupabaseConfigured = Boolean(url && anonKey && !anonKey.includes('YOUR_ANON_KEY'))
