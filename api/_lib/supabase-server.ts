// Server-only Supabase service-role client.
// NEVER import this file from frontend code (src/). It uses
// SUPABASE_SERVICE_ROLE_KEY, which must never reach a browser.
// This client bypasses RLS by design, so every caller MUST first
// verify the Supabase user JWT (api/_lib/auth.ts) and then only
// ever query rows where user_id equals that verified user id.
// Tokens are stored only in public.meta_connections, encrypted
// (see api/_lib/crypto.ts). They are never stored in integrations.config.
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from './crypto.js'

export class ServerConfigError extends Error {}

export function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new ServerConfigError('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing on the server.')
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type MetaConnection = {
  user_id: string
  meta_user_id: string | null
  encrypted_access_token: string
  token_expires_at: string | null
  scopes: string | null
}

export async function getMetaConnection(userId: string): Promise<MetaConnection | null> {
  const sb = getServiceClient()
  const { data, error } = await sb.from('meta_connections').select('*').eq('user_id', userId).maybeSingle()
  if (error || !data) return null
  return data as MetaConnection
}

export async function getDecryptedMetaToken(userId: string): Promise<{ token: string; metaUserId: string | null; expiresAt: string | null } | null> {
  const conn = await getMetaConnection(userId)
  if (!conn) return null
  try {
    const token = decryptToken(conn.encrypted_access_token)
    return { token, metaUserId: conn.meta_user_id, expiresAt: conn.token_expires_at }
  } catch {
    return null
  }
}

export async function setMetaConnection(userId: string, row: { meta_user_id: string | null; encrypted_access_token: string; token_expires_at: string | null; scopes: string | null }) {
  const sb = getServiceClient()
  const { error } = await sb.from('meta_connections').upsert(
    { user_id: userId, ...row, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (error) throw error
}

export async function deleteMetaConnection(userId: string) {
  const sb = getServiceClient()
  await sb.from('meta_connections').delete().eq('user_id', userId)
}

export async function setIntegrationStatus(userId: string, status: string, config: Record<string, any>) {
  const sb = getServiceClient()
  // config must never contain a token. Callers pass only safe metadata.
  const safeConfig = { ...config }
  delete (safeConfig as any).access_token
  delete (safeConfig as any).refresh_token
  delete (safeConfig as any).encrypted_access_token
  await sb.from('integrations').upsert(
    { user_id: userId, provider: 'meta', status, config: safeConfig },
    { onConflict: 'user_id,provider' }
  )
}
