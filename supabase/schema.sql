-- Minha Farmácia: execute este SQL no SQL Editor do Supabase.
-- RLS garante que cada conta só consulte e altere os próprios dados.
create extension if not exists pgcrypto;

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  presentation text not null default '',
  unit text not null default 'unidades',
  initial_quantity numeric not null default 0 check (initial_quantity >= 0),
  base_remaining numeric not null default 0 check (base_remaining >= 0),
  daily_consumption numeric not null default 0 check (daily_consumption >= 0),
  base_date date not null default current_date,
  started_at date not null default current_date,
  prescription_days integer not null default 14 check (prescription_days >= 0),
  needs_prescription boolean not null default false,
  low_stock_days integer not null default 7 check (low_stock_days >= 0),
  paused boolean not null default false,
  paused_days_offset integer not null default 0 check (paused_days_offset >= 0),
  color text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medications add column if not exists needs_prescription boolean not null default false;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  purchased_at date not null default current_date,
  price numeric check (price is null or price >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists medications_user_idx on public.medications(user_id);
create index if not exists purchases_user_idx on public.purchases(user_id, purchased_at desc);
create index if not exists purchases_medication_idx on public.purchases(medication_id);

alter table public.medications enable row level security;
alter table public.purchases enable row level security;

drop policy if exists "medications_select_own" on public.medications;
drop policy if exists "medications_insert_own" on public.medications;
drop policy if exists "medications_update_own" on public.medications;
drop policy if exists "medications_delete_own" on public.medications;
drop policy if exists "purchases_select_own" on public.purchases;
drop policy if exists "purchases_insert_own" on public.purchases;
drop policy if exists "purchases_update_own" on public.purchases;
drop policy if exists "purchases_delete_own" on public.purchases;

create policy "medications_select_own" on public.medications for select to authenticated using (auth.uid() = user_id);
create policy "medications_insert_own" on public.medications for insert to authenticated with check (auth.uid() = user_id);
create policy "medications_update_own" on public.medications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "medications_delete_own" on public.medications for delete to authenticated using (auth.uid() = user_id);
create policy "purchases_select_own" on public.purchases for select to authenticated using (auth.uid() = user_id);
create policy "purchases_insert_own" on public.purchases for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid()));
create policy "purchases_update_own" on public.purchases for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid()));
create policy "purchases_delete_own" on public.purchases for delete to authenticated using (auth.uid() = user_id);

-- O front-end deve usar somente a chave anon/public. Nunca exponha service_role.


-- Pendências independentes de receita e compra, repetidas até confirmação no app.
create table if not exists public.medication_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  kind text not null check (kind in ('prescription', 'purchase')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  is_eligible boolean not null default true,
  last_notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medication_id, kind)
);
create index if not exists medication_reminders_user_status_idx on public.medication_reminders(user_id, status);
alter table public.medication_reminders enable row level security;
drop policy if exists "medication_reminders_select_own" on public.medication_reminders;
drop policy if exists "medication_reminders_insert_own" on public.medication_reminders;
drop policy if exists "medication_reminders_update_own" on public.medication_reminders;
drop policy if exists "medication_reminders_delete_own" on public.medication_reminders;
create policy "medication_reminders_select_own" on public.medication_reminders for select to authenticated using (auth.uid() = user_id);
create policy "medication_reminders_insert_own" on public.medication_reminders for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid()));
create policy "medication_reminders_update_own" on public.medication_reminders for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid()));
create policy "medication_reminders_delete_own" on public.medication_reminders for delete to authenticated using (auth.uid() = user_id);
