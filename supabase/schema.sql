-- Minha Farmácia: execute este SQL no SQL Editor do Supabase.
-- RLS garante que cada conta só consulte e altere os próprios dados.
create extension if not exists pgcrypto;

create table if not exists public.medication_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medication_lists_user_idx on public.medication_lists(user_id, created_at);
alter table public.medication_lists enable row level security;
drop policy if exists "lists_select_own" on public.medication_lists;
drop policy if exists "lists_insert_own" on public.medication_lists;
drop policy if exists "lists_update_own" on public.medication_lists;
drop policy if exists "lists_delete_own" on public.medication_lists;
create policy "lists_select_own" on public.medication_lists for select to authenticated using (auth.uid() = user_id);
create policy "lists_insert_own" on public.medication_lists for insert to authenticated with check (auth.uid() = user_id);
create policy "lists_update_own" on public.medication_lists for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lists_delete_own" on public.medication_lists for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.medication_lists(id) on delete cascade,
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
alter table public.medications add column if not exists list_id uuid references public.medication_lists(id) on delete cascade;
-- Upgrade existing accounts: migrate current medication records into a default list, retaining their IDs/history.
do $$
declare u record; new_list uuid;
begin
  for u in select distinct user_id from public.medications where list_id is null loop
    select id into new_list from public.medication_lists where user_id=u.user_id order by created_at limit 1;
    if new_list is null then
      insert into public.medication_lists(user_id,name) values(u.user_id,'Minha lista') returning id into new_list;
    end if;
    update public.medications set list_id=new_list where user_id=u.user_id and list_id is null;
  end loop;
end $$;
alter table public.medications alter column list_id set not null;


create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  list_id uuid references public.medication_lists(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  purchased_at date not null default current_date,
  price numeric check (price is null or price >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.purchases add column if not exists list_id uuid references public.medication_lists(id) on delete cascade;
update public.purchases p set list_id=m.list_id from public.medications m where p.medication_id=m.id and p.list_id is null;
alter table public.purchases alter column list_id set not null;
create index if not exists medications_user_idx on public.medications(user_id);
create index if not exists medications_list_idx on public.medications(list_id);
create index if not exists purchases_list_idx on public.purchases(list_id,purchased_at desc);
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

drop policy if exists "medications_select_own" on public.medications;
drop policy if exists "medications_insert_own" on public.medications;
drop policy if exists "medications_update_own" on public.medications;
drop policy if exists "medications_delete_own" on public.medications;
drop policy if exists "purchases_select_own" on public.purchases;
drop policy if exists "purchases_insert_own" on public.purchases;
drop policy if exists "purchases_update_own" on public.purchases;
drop policy if exists "purchases_delete_own" on public.purchases;

create policy "medications_select_own" on public.medications for select to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medications.list_id and l.user_id=auth.uid()));
create policy "medications_insert_own" on public.medications for insert to authenticated with check (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medications.list_id and l.user_id=auth.uid()));
create policy "medications_update_own" on public.medications for update to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medications.list_id and l.user_id=auth.uid())) with check (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medications.list_id and l.user_id=auth.uid()));
create policy "medications_delete_own" on public.medications for delete to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medications.list_id and l.user_id=auth.uid()));
create policy "purchases_select_own" on public.purchases for select to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=purchases.list_id and l.user_id=auth.uid()));
create policy "purchases_insert_own" on public.purchases for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = purchases.medication_id and m.user_id = auth.uid() and m.list_id=purchases.list_id) and exists(select 1 from public.medication_lists l where l.id=purchases.list_id and l.user_id=auth.uid()));
create policy "purchases_update_own" on public.purchases for update to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=purchases.list_id and l.user_id=auth.uid())) with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = purchases.medication_id and m.user_id = auth.uid() and m.list_id=purchases.list_id) and exists(select 1 from public.medication_lists l where l.id=purchases.list_id and l.user_id=auth.uid()));
create policy "purchases_delete_own" on public.purchases for delete to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=purchases.list_id and l.user_id=auth.uid()));

-- O front-end deve usar somente a chave anon/public. Nunca exponha service_role.


-- Pendências independentes de receita e compra, repetidas até confirmação no app.
create table if not exists public.medication_reminders (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.medication_lists(id) on delete cascade,
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
alter table public.medication_reminders add column if not exists list_id uuid references public.medication_lists(id) on delete cascade;
update public.medication_reminders r set list_id=m.list_id from public.medications m where r.medication_id=m.id and r.list_id is null;
alter table public.medication_reminders alter column list_id set not null;
alter table public.medication_reminders enable row level security;
drop policy if exists "medication_reminders_select_own" on public.medication_reminders;
drop policy if exists "medication_reminders_insert_own" on public.medication_reminders;
drop policy if exists "medication_reminders_update_own" on public.medication_reminders;
drop policy if exists "medication_reminders_delete_own" on public.medication_reminders;
create policy "medication_reminders_select_own" on public.medication_reminders for select to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medication_reminders.list_id and l.user_id=auth.uid()));
create policy "medication_reminders_insert_own" on public.medication_reminders for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_reminders.medication_id and m.user_id = auth.uid() and m.list_id=medication_reminders.list_id));
create policy "medication_reminders_update_own" on public.medication_reminders for update to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medication_reminders.list_id and l.user_id=auth.uid())) with check (auth.uid() = user_id and exists (select 1 from public.medications m where m.id = medication_reminders.medication_id and m.user_id = auth.uid() and m.list_id=medication_reminders.list_id));
create policy "medication_reminders_delete_own" on public.medication_reminders for delete to authenticated using (auth.uid() = user_id and exists(select 1 from public.medication_lists l where l.id=medication_reminders.list_id and l.user_id=auth.uid()));

-- Histórico de alterações de estoque e ações por lista. Os registros persistem após remover um medicamento.
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references public.medication_lists(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete set null,
  medication_name text not null default '',
  kind text not null check(kind in ('purchase','adjustment','created','removed','prescription_confirmed','other')),
  quantity_delta numeric,
  before_quantity numeric,
  after_quantity numeric,
  notes text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_list_date_idx on public.stock_movements(list_id,occurred_at desc);
alter table public.stock_movements enable row level security;
drop policy if exists "movements_select_own" on public.stock_movements;
drop policy if exists "movements_insert_own" on public.stock_movements;
drop policy if exists "movements_delete_own" on public.stock_movements;
create policy "movements_select_own" on public.stock_movements for select to authenticated using(auth.uid()=user_id and exists(select 1 from public.medication_lists l where l.id=stock_movements.list_id and l.user_id=auth.uid()));
create policy "movements_insert_own" on public.stock_movements for insert to authenticated with check(auth.uid()=user_id and exists(select 1 from public.medication_lists l where l.id=stock_movements.list_id and l.user_id=auth.uid()) and (medication_id is null or exists(select 1 from public.medications m where m.id=medication_id and m.list_id=stock_movements.list_id and m.user_id=auth.uid())));
create policy "movements_delete_own" on public.stock_movements for delete to authenticated using(auth.uid()=user_id and exists(select 1 from public.medication_lists l where l.id=stock_movements.list_id and l.user_id=auth.uid()));

-- Propaga list_id ao comprar; trigger mantém a associação consistente.
create or replace function public.set_purchase_list_id() returns trigger language plpgsql security invoker as $$
begin
  select list_id into new.list_id from public.medications where id=new.medication_id and user_id=new.user_id;
  return new;
end $$;
drop trigger if exists purchases_set_list_id on public.purchases;
create trigger purchases_set_list_id before insert or update of medication_id,user_id on public.purchases for each row execute function public.set_purchase_list_id();

-- O gatilho cria evento de compra mesmo quando a compra vier da confirmação de lembrete/Telegram.
create or replace function public.log_purchase_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare med public.medications;
begin
  select * into med from public.medications where id=new.medication_id;
  insert into public.stock_movements(user_id,list_id,medication_id,medication_name,kind,quantity_delta,notes,occurred_at)
  values(new.user_id,new.list_id,new.medication_id,coalesce(med.name,''),'purchase',new.quantity,new.notes,(new.purchased_at::timestamp at time zone 'UTC'));
  return new;
end $$;
drop trigger if exists purchases_log_movement on public.purchases;
create trigger purchases_log_movement after insert on public.purchases for each row execute function public.log_purchase_movement();
