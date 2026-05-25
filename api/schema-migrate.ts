/**
 * api/schema-migrate.ts — V20
 *
 * Runs idempotent schema repair via the Supabase Management REST API.
 * No direct Postgres connection needed — no pg package.
 *
 * Required Vercel environment variables:
 *   SUPABASE_ACCESS_TOKEN — personal access token from
 *                           supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF  — your project ref, visible in the Supabase URL
 *                           e.g. https://supabase.com/dashboard/project/your-project-ref
 *                           → ref is "your-project-ref"
 *
 * Already required (should already be set):
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js'

const MIGRATION_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

alter table if exists public.accounts            add column if not exists deleted_at timestamptz;
alter table if exists public.categories          add column if not exists deleted_at timestamptz;
alter table if exists public.transactions        add column if not exists deleted_at timestamptz;
alter table if exists public.transaction_rules   add column if not exists deleted_at timestamptz;
alter table if exists public.savings_goals       add column if not exists deleted_at timestamptz;
alter table if exists public.savings_goal_contributions add column if not exists deleted_at timestamptz;
alter table if exists public.savings_goal_sets   add column if not exists deleted_at timestamptz;
alter table if exists public.scenarios           add column if not exists deleted_at timestamptz;
alter table if exists public.saved_budgets       add column if not exists deleted_at timestamptz;
alter table if exists public.budget_actuals      add column if not exists deleted_at timestamptz;
alter table if exists public.monthly_reviews     add column if not exists deleted_at timestamptz;
alter table if exists public.import_batches      add column if not exists deleted_at timestamptz;

alter table if exists public.import_batches add column if not exists import_source text;
alter table if exists public.import_batches add column if not exists updated_at timestamptz not null default now();
alter table if exists public.budget_actuals add column if not exists period_key text;
alter table if exists public.budget_actuals add column if not exists period text;
alter table if exists public.budget_actuals add column if not exists period_start text;

create table if not exists public.scenario_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  notes_blob jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.category_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  memory_blob jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.take_home_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  mode text not null default 'simple',
  simple_rate numeric not null default 0.8243,
  manual_monthly_net numeric not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table if exists public.scenario_notes       enable row level security;
alter table if exists public.category_memory      enable row level security;
alter table if exists public.take_home_settings   enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='scenario_notes' and policyname='Users manage own scenario_notes') then
    execute 'create policy "Users manage own scenario_notes" on public.scenario_notes for all using (auth.uid()=user_id) with check (auth.uid()=user_id)';
  end if;
  if not exists (select 1 from pg_policies where tablename='category_memory' and policyname='Users manage own category_memory') then
    execute 'create policy "Users manage own category_memory" on public.category_memory for all using (auth.uid()=user_id) with check (auth.uid()=user_id)';
  end if;
  if not exists (select 1 from pg_policies where tablename='take_home_settings' and policyname='Users manage own take_home_settings') then
    execute 'create policy "Users manage own take_home_settings" on public.take_home_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id)';
  end if;
end $$;

grant all on public.scenario_notes     to authenticated;
grant all on public.category_memory    to authenticated;
grant all on public.take_home_settings to authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='scenario_notes_user_id_local_id_key')    then alter table public.scenario_notes    add constraint scenario_notes_user_id_local_id_key    unique (user_id, local_id); end if;
  if not exists (select 1 from pg_constraint where conname='category_memory_user_id_local_id_key')   then alter table public.category_memory   add constraint category_memory_user_id_local_id_key   unique (user_id, local_id); end if;
  if not exists (select 1 from pg_constraint where conname='take_home_settings_user_id_local_id_key') then alter table public.take_home_settings add constraint take_home_settings_user_id_local_id_key unique (user_id, local_id); end if;
end $$;

insert into public.schema_migrations(version)
values ('v20_schema_repair_20260523')
on conflict (version) do nothing;
`

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const projectRef  = process.env.SUPABASE_PROJECT_REF
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Config check — give actionable message
  if (!projectRef || !accessToken) {
    return res.status(500).json({
      error:
        'Schema repair needs two Vercel env vars:\n' +
        '• SUPABASE_PROJECT_REF — from your Supabase URL ' +
        '(e.g. supabase.com/dashboard/project/your-project-ref)\n' +
        '• SUPABASE_ACCESS_TOKEN — personal token from supabase.com/dashboard/account/tokens',
    })
  }

  // Auth check — must be a signed-in user
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.' })
  }

  const raw = req.headers.authorization ?? req.headers.Authorization
  const token = (Array.isArray(raw) ? raw[0] : raw ?? '').replace(/^Bearer /i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  const admin = createClient(supabaseUrl, serviceKey)
  const { data, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !data.user) return res.status(401).json({ error: 'Invalid session.' })

  // Run SQL via Supabase Management API (no direct TCP connection needed)
  try {
    const mgmtRes = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: MIGRATION_SQL }),
      },
    )

    if (!mgmtRes.ok) {
      const body = await mgmtRes.json().catch(() => ({})) as Record<string, unknown>
      const msg = (body.message ?? body.error ?? `HTTP ${mgmtRes.status}`) as string
      return res.status(500).json({ error: `Management API: ${msg}` })
    }

    return res.status(200).json({ ok: true, applied: 'v20_schema_repair_20260523' })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Schema repair failed.' })
  }
}
