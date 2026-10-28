-- AdGenius AI — Supabase schema (Step 2 production port)
-- HOW TO RUN (later, Step 3/4 — do NOT run yet in this step):
--   Supabase dashboard > SQL Editor > New query > paste this file > Run.
-- SECURITY MODEL:
--   Every business table has user_id uuid REFERENCES auth.users(id).
--   Row Level Security (RLS) is ENABLED on every table.
--   Each policy allows ONLY the owner: auth.uid() = user_id.
--   There is no policy that lets one user see another user's rows.
--   Service-role keys must NEVER be put in frontend code or GitHub.
--   If you run this twice, the IF NOT EXISTS / DROP POLICY guards make it safe.

-- ---------- Helper: keep profiles in sync with auth.users ----------
-- NOTE: This function + trigger auto-create a profile row on sign-up.
-- It runs as SECURITY DEFINER by design (a standard Supabase pattern) and
-- only inserts a row for the NEW user (NEW.id), never anyone else's data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, business_name, plan)
  values (new.id, new.email, 'My Business', 'starter')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  business_name text default 'My Business',
  owner_name text,
  industry text,
  website text,
  target_country text,
  monthly_budget numeric,
  business_type text,
  objectives text,
  plan text default 'starter' check (plan in ('starter','pro','agency')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles owner only" on public.profiles;
create policy "profiles owner only" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- clients ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  website text,
  industry text,
  objectives text,
  status text default 'active',
  notes text,
  created_at timestamptz default now()
);
alter table public.clients enable row level security;
drop policy if exists "clients owner only" on public.clients;
create policy "clients owner only" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- artifacts: campaigns, ad copy sets, landing pages, reports ----------
create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  kind text not null check (kind in ('meta_campaign','google_campaign','ad_copy','audience_plan','landing_page','budget_plan','report','creative_concept')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  is_demo boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.artifacts enable row level security;
drop policy if exists "artifacts owner only" on public.artifacts;
create policy "artifacts owner only" on public.artifacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- metric_rows: user-entered campaign performance ONLY ----------
-- These are NOT live ad-account metrics. Analyzer/Reports calculate
-- CTR/CPC/CPL/ROAS only from these rows, and show "no data" when empty.
create table if not exists public.metric_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_name text not null,
  platform text,
  impressions numeric default 0,
  clicks numeric default 0,
  spend numeric default 0,
  leads numeric default 0,
  purchases numeric default 0,
  revenue numeric default 0,
  period text,
  created_at timestamptz default now()
);
alter table public.metric_rows enable row level security;
drop policy if exists "metric_rows owner only" on public.metric_rows;
create policy "metric_rows owner only" on public.metric_rows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- integrations: IDs / status ONLY, never secrets ----------
-- Do NOT store API keys, access tokens, or passwords in this table.
-- Status is only 'not_configured' or 'saved_unverified' until a real
-- verified OAuth connection exists (a later step, not this build).
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text default 'not_configured' check (status in ('not_configured','saved_unverified','connected','disconnected')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, provider)
);
alter table public.integrations enable row level security;
drop policy if exists "integrations owner only" on public.integrations;
create policy "integrations owner only" on public.integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- tracking_configs: identifiers + event names only ----------
create table if not exists public.tracking_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  identifier text,
  events text[] default array['PageView','ViewContent','Lead','AddToCart','InitiateCheckout','Purchase'],
  created_at timestamptz default now()
);
alter table public.tracking_configs enable row level security;
drop policy if exists "tracking_configs owner only" on public.tracking_configs;
create policy "tracking_configs owner only" on public.tracking_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- assistant_messages ----------
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);
alter table public.assistant_messages enable row level security;
drop policy if exists "assistant_messages owner only" on public.assistant_messages;
create policy "assistant_messages owner only" on public.assistant_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- client_tasks ----------
create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  done boolean default false,
  created_at timestamptz default now()
);
alter table public.client_tasks enable row level security;
drop policy if exists "client_tasks owner only" on public.client_tasks;
create policy "client_tasks owner only" on public.client_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
