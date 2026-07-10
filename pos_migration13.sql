create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_staff() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','encargado','cajera','coach'));
$$;

create table if not exists pending_registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  gender text,
  birth_date date,
  address text,
  branch_id uuid references branches(id),
  status text not null default 'pending',
  converted_customer_id uuid references customers(id),
  created_at timestamptz default now(),
  lead_source text,
  lead_campaign text
);

create index if not exists idx_pending_reg_status on pending_registrations(status, created_at);

alter table pending_registrations enable row level security;

drop policy if exists pending_reg_public_insert on pending_registrations;
create policy pending_reg_public_insert on pending_registrations for insert with check (true);

drop policy if exists pending_reg_staff on pending_registrations;
create policy pending_reg_staff on pending_registrations for select using (is_staff());

drop policy if exists pending_reg_staff_upd on pending_registrations;
create policy pending_reg_staff_upd on pending_registrations for update using (is_staff()) with check (is_staff());

drop policy if exists pending_reg_staff_del on pending_registrations;
create policy pending_reg_staff_del on pending_registrations for delete using (is_staff());

create table if not exists gym_policies (
  id text primary key,
  title text not null,
  body text not null default '',
  updated_at timestamptz default now()
);

insert into gym_policies (id, title, body) values ('privacy', 'Aviso de privacidad', 'Aun no se ha capturado el aviso de privacidad.') on conflict (id) do nothing;
insert into gym_policies (id, title, body) values ('rules', 'Reglamento del gimnasio', 'Aun no se han capturado las reglas del gimnasio.') on conflict (id) do nothing;

alter table gym_policies enable row level security;

drop policy if exists gym_policies_read on gym_policies;
create policy gym_policies_read on gym_policies for select using (true);

drop policy if exists gym_policies_admin_write on gym_policies;
create policy gym_policies_admin_write on gym_policies for update using (is_admin()) with check (is_admin());

alter table customers add column if not exists lead_source text;
alter table customers add column if not exists lead_campaign text;
