import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

type VercelRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

const migrationSql = `
create extension if not exists pgcrypto;

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- Core schema repair. Keep every statement idempotent.
alter table if exists public.accounts add column if not exists deleted_at timestamptz;
alter table if exists public.categories add column if not exists deleted_at timestamptz;
alter table if exists public.transactions add column if not exists deleted_at timestamptz;
alter table if exists public.transaction_rules add column if not exists deleted_at timestamptz;
alter table if exists public.savings_goals add column if not exists deleted_at timestamptz;
alter table if exists public.savings_goal_contributions add column if not exists deleted_at timestamptz;
alter table if exists public.savings_goal_sets add column if not exists deleted_at timestamptz;
alter table if exists public.scenarios add column if not exists deleted_at timestamptz;
alter table if exists public.saved_budgets add column if not exists deleted_at timestamptz;
alter table if exists public.budget_actuals add column if not exists deleted_at timestamptz;
alter table if exists public.monthly_reviews add column if not exists deleted_at timestamptz;
alter table if exists public.import_batches add column if not exists deleted_at timestamptz;

alter table if exists public.import_batches add column if not exists import_source text;
alter table if exists public.import_batches add column if not exists updated_at timestamptz not null default now();
update public.import_batches
set import_source = coalesce(import_source, source, 'csv')
where import_source is null;
alter table if exists public.import_batches alter column import_source set default 'csv';

alter table if exists public.budget_actuals add column if not exists period_key text;
alter table if exists public.budget_actuals add column if not exists period text;
alter table if exists public.budget_actuals add column if not exists period_start text;
update public.budget_actuals
set period_key = coalesce(period_key, period, period_start, 'default')
where period_key is null;
alter table if exists public.budget_actuals alter column period_key set default 'default';

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

create table if not exists public.saved_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  name text not null,
  categories_snapshot jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.scenario_notes enable row level security;
alter table public.category_memory enable row level security;
alter table public.take_home_settings enable row level security;
alter table public.saved_budgets enable row level security;

drop policy if exists "Users manage own scenario_notes" on public.scenario_notes;
create policy "Users manage own scenario_notes" on public.scenario_notes
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own category_memory" on public.category_memory;
create policy "Users manage own category_memory" on public.category_memory
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own take_home_settings" on public.take_home_settings;
create policy "Users manage own take_home_settings" on public.take_home_settings
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own saved_budgets" on public.saved_budgets;
create policy "Users manage own saved_budgets" on public.saved_budgets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on public.scenario_notes to authenticated;
grant all on public.category_memory to authenticated;
grant all on public.take_home_settings to authenticated;
grant all on public.saved_budgets to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scenario_notes_user_id_local_id_key') then
    alter table public.scenario_notes add constraint scenario_notes_user_id_local_id_key unique (user_id, local_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_memory_user_id_local_id_key') then
    alter table public.category_memory add constraint category_memory_user_id_local_id_key unique (user_id, local_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'take_home_settings_user_id_local_id_key') then
    alter table public.take_home_settings add constraint take_home_settings_user_id_local_id_key unique (user_id, local_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saved_budgets_user_id_local_id_key') then
    alter table public.saved_budgets add constraint saved_budgets_user_id_local_id_key unique (user_id, local_id);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='budget_actuals' and column_name='period_key')
     and not exists (select 1 from pg_constraint where conname = 'budget_actuals_user_id_period_key_key') then
    alter table public.budget_actuals add constraint budget_actuals_user_id_period_key_key unique (user_id, period_key);
  end if;
end $$;

insert into public.schema_migrations(version)
values ('v18_automatic_schema_repair_20260522')
on conflict (version) do nothing;
`

const requiredChecks = [
  { table: 'import_batches', column: 'import_source' },
  { table: 'import_batches', column: 'updated_at' },
  { table: 'budget_actuals', column: 'period_key' },
  { table: 'scenario_notes', column: 'notes_blob' },
  { table: 'category_memory', column: 'memory_blob' },
  { table: 'take_home_settings', column: 'simple_rate' },
  { table: 'saved_budgets', column: 'categories_snapshot' },
]

function getBearerToken(req: VercelRequest): string | null {
  const raw = req.headers.authorization ?? req.headers.Authorization
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !value.toLowerCase().startsWith('bearer ')) return null
  return value.slice(7).trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const databaseUrl = process.env.DATABASE_URL
  const adminEmail = process.env.FLOW_ADMIN_EMAIL

  if (!supabaseUrl || !serviceKey || !databaseUrl) {
    return res.status(500).json({
      error: 'Schema repair is not configured. Add SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL to Vercel environment variables.',
    })
  }

  const token = getBearerToken(req)
  if (!token) return res.status(401).json({ error: 'Missing auth token.' })

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)

  if (userError || !userData.user) return res.status(401).json({ error: 'Invalid auth token.' })
  if (adminEmail && userData.user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    return res.status(403).json({ error: 'Only the configured admin user can run schema repair.' })
  }

  const pg = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

  try {
    await pg.connect()
    await pg.query('begin')
    await pg.query(migrationSql)
    await pg.query('commit')

    const checkResult = await pg.query(
      `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
      and (
        (table_name = 'import_batches' and column_name in ('import_source','updated_at'))
        or (table_name = 'budget_actuals' and column_name = 'period_key')
        or (table_name = 'scenario_notes' and column_name = 'notes_blob')
        or (table_name = 'category_memory' and column_name = 'memory_blob')
        or (table_name = 'take_home_settings' and column_name = 'simple_rate')
        or (table_name = 'saved_budgets' and column_name = 'categories_snapshot')
      )
      `,
    )

    const found = new Set(checkResult.rows.map((r: { table_name: string; column_name: string }) => `${r.table_name}.${r.column_name}`))
    const missing = requiredChecks
      .map(c => `${c.table}.${c.column}`)
      .filter(key => !found.has(key))

    return res.status(200).json({
      ok: missing.length === 0,
      applied: 'v18_automatic_schema_repair_20260522',
      missing,
    })
  } catch (err) {
    try { await pg.query('rollback') } catch { /* ignore */ }
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Schema repair failed.' })
  } finally {
    try { await pg.end() } catch { /* ignore */ }
  }
}
