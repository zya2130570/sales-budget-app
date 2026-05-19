-- V12.1 Supabase schema setup only
-- No app runtime connection, auth UI, or localStorage sync is added in this version.
-- This migration defines the future cloud data model for the local-first Sales Budget App.

create extension if not exists pgcrypto;

-- Profiles mirror Supabase auth users. Keep id equal to auth.uid().
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  active_tab text,
  period text,
  take_home_mode text,
  simple_rate numeric,
  manual_monthly_net numeric,
  schema_version integer not null default 1,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  name text not null,
  type text not null,
  balance numeric not null default 0,
  institution text,
  starting_balance numeric,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  name text not null,
  type text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  source text not null,
  preset text,
  account_id uuid references public.accounts(id) on delete set null,
  account_name text,
  import_month text,
  imported_count integer not null default 0,
  skipped_duplicate_count integer not null default 0,
  failed_row_count integer not null default 0,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  date date not null,
  merchant text not null,
  amount numeric not null,
  type text not null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  notes text,
  source text not null default 'manual',
  import_batch_id uuid references public.import_batches(id) on delete set null,
  review_status text,
  applied_by_rule boolean not null default false,
  imported_category_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  name text not null,
  match_text text not null,
  match_field text not null,
  category_id uuid references public.categories(id) on delete set null,
  type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.duplicate_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id text not null,
  transaction_ids uuid[] not null default '{}',
  status text not null default 'unresolved',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month text not null,
  notes text,
  status text,
  checklist jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  name text not null,
  goal_amount numeric not null default 0,
  current_saved numeric not null default 0,
  start_date date,
  deadline date,
  type text,
  completed boolean not null default false,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  local_id text,
  date date not null,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Goal sets preserve current app behavior: snapshot JSON, not live references.
create table if not exists public.savings_goal_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  name text not null,
  targets_snapshot jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_id text,
  name text not null,
  period text,
  scenario_values jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenario_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete cascade,
  scenario_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  merchant text not null,
  normalized_merchant text not null,
  amount numeric,
  cadence text,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  first_seen_date date,
  last_seen_date date,
  is_active boolean not null default true,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_actuals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  period_key text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, period_key)
);

create table if not exists public.category_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  normalized_merchant text not null,
  category_id uuid references public.categories(id) on delete set null,
  confidence numeric,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_merchant)
);

-- Indexes
create index if not exists idx_accounts_user_id on public.accounts(user_id);
create index if not exists idx_accounts_user_type on public.accounts(user_id, type);
create index if not exists idx_categories_user_id on public.categories(user_id);
create index if not exists idx_categories_user_type on public.categories(user_id, type);
create index if not exists idx_transactions_user_date on public.transactions(user_id, date);
create index if not exists idx_transactions_user_account on public.transactions(user_id, account_id);
create index if not exists idx_transactions_user_category on public.transactions(user_id, category_id);
create index if not exists idx_transactions_user_import_batch on public.transactions(user_id, import_batch_id);
create index if not exists idx_transactions_user_review on public.transactions(user_id, review_status);
create index if not exists idx_transaction_rules_user on public.transaction_rules(user_id);
create index if not exists idx_import_batches_user_month on public.import_batches(user_id, import_month);
create index if not exists idx_import_batches_user_imported_at on public.import_batches(user_id, imported_at);
create index if not exists idx_duplicate_resolutions_user_group on public.duplicate_resolutions(user_id, group_id);
create index if not exists idx_duplicate_resolutions_user_status on public.duplicate_resolutions(user_id, status);
create index if not exists idx_monthly_reviews_user_month on public.monthly_reviews(user_id, month);
create index if not exists idx_savings_goals_user_deadline on public.savings_goals(user_id, deadline);
create index if not exists idx_savings_goals_user_status on public.savings_goals(user_id, completed, paused);
create index if not exists idx_savings_goal_contributions_user_goal on public.savings_goal_contributions(user_id, goal_id);
create index if not exists idx_goal_sets_user_saved_at on public.savings_goal_sets(user_id, saved_at);
create index if not exists idx_scenarios_user_saved_at on public.scenarios(user_id, saved_at);
create index if not exists idx_recurring_items_user_norm on public.recurring_items(user_id, normalized_merchant);
create index if not exists idx_budget_actuals_user_period on public.budget_actuals(user_id, period_key);
create index if not exists idx_category_memory_user_norm on public.category_memory(user_id, normalized_merchant);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_rules enable row level security;
alter table public.import_batches enable row level security;
alter table public.duplicate_resolutions enable row level security;
alter table public.monthly_reviews enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_goal_contributions enable row level security;
alter table public.savings_goal_sets enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_notes enable row level security;
alter table public.recurring_items enable row level security;
alter table public.budget_actuals enable row level security;
alter table public.category_memory enable row level security;

-- Profiles policy
create policy "Users can manage their own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Generic user-owned policies
create policy "Users can manage their own app settings" on public.app_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own accounts" on public.accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own categories" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own transactions" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own transaction rules" on public.transaction_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own import batches" on public.import_batches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own duplicate resolutions" on public.duplicate_resolutions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own monthly reviews" on public.monthly_reviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own savings goals" on public.savings_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own savings goal contributions" on public.savings_goal_contributions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own savings goal sets" on public.savings_goal_sets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own scenarios" on public.scenarios
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own scenario notes" on public.scenario_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own recurring items" on public.recurring_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own budget actuals" on public.budget_actuals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can manage their own category memory" on public.category_memory
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
