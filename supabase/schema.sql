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

-- Listas pessoais: cada lista organiza medicamentos dentro da conta autenticada.
create table if not exists public.medication_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.medications add column if not exists list_id uuid references public.medication_lists(id) on delete cascade;

-- Associa dados existentes a uma lista padrão, sem alterar medicamentos/compras.
do $$
declare
  owner_row record;
  default_list uuid;
begin
  for owner_row in select distinct user_id from public.medications where list_id is null loop
    select id into default_list from public.medication_lists where user_id = owner_row.user_id and name = 'Minha lista' order by created_at limit 1;
    if default_list is null then
      insert into public.medication_lists(user_id, name) values (owner_row.user_id, 'Minha lista') returning id into default_list;
    end if;
    update public.medications set list_id = default_list where user_id = owner_row.user_id and list_id is null;
    default_list := null;
  end loop;
end $$;
create index if not exists medication_lists_user_idx on public.medication_lists(user_id, is_archived, created_at);
create index if not exists medications_list_idx on public.medications(list_id);

alter table public.medication_lists enable row level security;
drop policy if exists "medication_lists_select_own" on public.medication_lists;
drop policy if exists "medication_lists_insert_own" on public.medication_lists;
drop policy if exists "medication_lists_update_own" on public.medication_lists;
drop policy if exists "medication_lists_delete_own" on public.medication_lists;
create policy "medication_lists_select_own" on public.medication_lists for select to authenticated using (auth.uid() = user_id);
create policy "medication_lists_insert_own" on public.medication_lists for insert to authenticated with check (auth.uid() = user_id);
create policy "medication_lists_update_own" on public.medication_lists for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "medication_lists_delete_own" on public.medication_lists for delete to authenticated using (auth.uid() = user_id);

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
create policy "medications_insert_own" on public.medications for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.medication_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "medications_update_own" on public.medications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.medication_lists l where l.id = list_id and l.user_id = auth.uid()));
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
  list_id uuid references public.medication_lists(id) on delete cascade,
  kind text not null check (kind in ('prescription', 'purchase')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  is_eligible boolean not null default true,
  last_notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medication_id, kind)
);
alter table public.medication_reminders add column if not exists list_id uuid references public.medication_lists(id) on delete cascade;
-- Preenche os vínculos de listas para lembretes criados antes desta atualização.
do $$
declare
  owner_row record;
  default_list uuid;
begin
  for owner_row in select distinct user_id from public.medications where list_id is null loop
    select id into default_list from public.medication_lists where user_id = owner_row.user_id and name = 'Minha lista' order by created_at limit 1;
    if default_list is null then
      insert into public.medication_lists(user_id, name) values (owner_row.user_id, 'Minha lista') returning id into default_list;
    end if;
    update public.medications set list_id = default_list where user_id = owner_row.user_id and list_id is null;
    default_list := null;
  end loop;
end $$;
update public.medication_reminders r set list_id = m.list_id from public.medications m where r.medication_id = m.id and r.list_id is null;
alter table public.medication_reminders alter column list_id set not null;
create index if not exists medication_reminders_user_status_idx on public.medication_reminders(user_id, status);
alter table public.medication_reminders enable row level security;
drop policy if exists "medication_reminders_select_own" on public.medication_reminders;
drop policy if exists "medication_reminders_insert_own" on public.medication_reminders;
drop policy if exists "medication_reminders_update_own" on public.medication_reminders;
drop policy if exists "medication_reminders_delete_own" on public.medication_reminders;
create policy "medication_reminders_select_own" on public.medication_reminders for select to authenticated using (auth.uid() = user_id);
create policy "medication_reminders_insert_own" on public.medication_reminders for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid() and m.list_id = medication_reminders.list_id));
create policy "medication_reminders_update_own" on public.medication_reminders for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_id and m.user_id = auth.uid() and m.list_id = medication_reminders.list_id));
create policy "medication_reminders_delete_own" on public.medication_reminders for delete to authenticated using (auth.uid() = user_id);

-- Estado temporário para a pergunta de quantidade enviada pelo bot.
create table if not exists public.telegram_pending_purchases (
  chat_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid not null references public.medication_reminders(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.telegram_pending_purchases enable row level security;

-- Idempotência: impede registrar duas compras se o Telegram repetir uma atualização.
create table if not exists public.telegram_processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);
alter table public.telegram_processed_updates enable row level security;

-- Executada somente pela Edge Function usando service_role; registra compra, atualiza saldo e conclui lembrete em uma transação.
create or replace function public.complete_telegram_purchase(p_update_id bigint, p_chat_id text, p_quantity numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare pending_row record;
declare reminder_row record;
declare med_row record;
declare remaining numeric;
declare inserted_count integer;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'A quantidade deve ser maior que zero.'; end if;
  select * into pending_row from public.telegram_pending_purchases where chat_id = p_chat_id for update;
  if not found or pending_row.expires_at < now() then return false; end if;
  insert into public.telegram_processed_updates(update_id) values (p_update_id) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;
  select * into reminder_row from public.medication_reminders where id = pending_row.reminder_id and user_id = pending_row.user_id and kind = 'purchase' and status = 'pending' for update;
  if not found then raise exception 'O lembrete de compra não está pendente.'; end if;
  select * into med_row from public.medications where id = reminder_row.medication_id and user_id = pending_row.user_id for update;
  if not found then raise exception 'Medicamento não encontrado para esta conta.'; end if;
  remaining := greatest(0, med_row.base_remaining - (case when med_row.paused then 0 else greatest(current_date - med_row.base_date - med_row.paused_days_offset, 0) * med_row.daily_consumption end));
  insert into public.purchases(user_id, medication_id, quantity, purchased_at, notes)
  values (pending_row.user_id, med_row.id, p_quantity, current_date, 'Compra registrada pelo Telegram');
  update public.medications set base_remaining = remaining + p_quantity, initial_quantity = remaining + p_quantity, base_date = current_date, updated_at = now() where id = med_row.id;
  update public.medication_reminders set status = 'completed', completed_at = now(), last_notified_at = null, is_eligible = true, updated_at = now() where id = reminder_row.id;
  delete from public.telegram_pending_purchases where chat_id = p_chat_id;
  return true;
end;
$$;
revoke all on function public.complete_telegram_purchase(bigint, text, numeric) from public, anon, authenticated;
grant execute on function public.complete_telegram_purchase(bigint, text, numeric) to service_role;
