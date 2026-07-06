-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS  (correr en Supabase → SQL Editor)
--  Crea las tablas que faltan para el punto de venta multi-sucursal.
--  Seguro de correr varias veces (usa IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════

-- 1) SUCURSALES ------------------------------------------------------
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  created_at timestamptz default now()
);

-- Staff ↔ sucursal (a qué sucursal pertenece cada empleado)
create table if not exists staff_branches (
  staff_id uuid references profiles(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  primary key (staff_id, branch_id)
);

-- 2) FAMILIAS y CLIENTES --------------------------------------------
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text,
  payer_customer_id uuid,
  discount_pct numeric default 0,
  created_at timestamptz default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  full_name text not null,
  phone text,
  email text,
  photo_url text,
  profile_id uuid references profiles(id),   -- vincula con la cuenta de la app
  family_id uuid references families(id),
  notes text,
  suspended boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_customers_profile on customers(profile_id);
create index if not exists idx_customers_branch on customers(branch_id);

-- 3) CAJA / TURNOS ---------------------------------------------------
create table if not exists cash_shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  staff_id uuid references profiles(id),
  opened_at timestamptz default now(),
  closed_at timestamptz,
  opening_cash numeric default 0,
  fx_rate numeric default 0,
  expected_cash numeric,
  counted_cash numeric,
  status text default 'open'   -- open | closed
);

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references cash_shifts(id) on delete cascade,
  type text not null,          -- in | out
  amount numeric not null,
  reason text,
  created_at timestamptz default now()
);

-- 4) INVENTARIO ------------------------------------------------------
--   'products' ya existe (vacía). Agregamos columnas y stock por sucursal.
alter table products add column if not exists sku text;
alter table products add column if not exists price numeric default 0;
alter table products add column if not exists cost numeric default 0;
alter table products add column if not exists photo_url text;
alter table products add column if not exists category text;
alter table products add column if not exists active boolean default true;

create table if not exists stock (
  branch_id uuid references branches(id),
  product_id uuid references products(id) on delete cascade,
  qty integer default 0,
  min_qty integer default 0,
  primary key (branch_id, product_id)
);

create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  product_id uuid references products(id),
  delta integer not null,      -- + entrada, - salida
  reason text,
  staff_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- 5) PLANES / MEMBRESÍAS --------------------------------------------
--   'plans' y 'subscriptions' ya existen. Agregamos columnas.
alter table plans add column if not exists duration_days integer;
alter table plans add column if not exists price numeric default 0;
alter table plans add column if not exists is_family boolean default false;
alter table plans add column if not exists max_members integer default 1;
alter table plans add column if not exists multi_branch boolean default true;
alter table plans add column if not exists active boolean default true;

alter table subscriptions add column if not exists branch_id uuid references branches(id);
alter table subscriptions add column if not exists customer_id uuid references customers(id);
alter table subscriptions add column if not exists sold_by uuid references profiles(id);
alter table subscriptions add column if not exists shift_id uuid references cash_shifts(id);
alter table subscriptions add column if not exists price_paid numeric;
alter table subscriptions add column if not exists family_id uuid references families(id);
alter table subscriptions add column if not exists payment_method text;

-- 6) VENTAS ----------------------------------------------------------
--   'sales' y 'sale_items' ya existen. Ligamos a turno/sucursal.
alter table sales add column if not exists branch_id uuid references branches(id);
alter table sales add column if not exists shift_id uuid references cash_shifts(id);
alter table sales add column if not exists customer_id uuid references customers(id);
alter table sales add column if not exists staff_id uuid references profiles(id);
alter table sales add column if not exists payment_method text;
alter table sales add column if not exists total numeric default 0;
alter table sales add column if not exists promo_id uuid;
alter table sales add column if not exists created_at timestamptz default now();

-- 7) CHECK-INS (control de acceso) ----------------------------------
alter table checkins add column if not exists branch_id uuid references branches(id);
alter table checkins add column if not exists customer_id uuid references customers(id);
alter table checkins add column if not exists checked_in_at timestamptz default now();
alter table checkins add column if not exists checked_out_at timestamptz;
alter table checkins add column if not exists method text;   -- qr | huella | facial | manual

-- 8) PROMOCIONES / ANUNCIOS -----------------------------------------
create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_type text default 'percent',  -- percent | amount
  discount_value numeric default 0,
  applies_to text,                        -- plans | products | all
  starts_at date,
  ends_at date,
  branch_ids uuid[],
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  image_url text,
  active boolean default true,
  branch_ids uuid[],
  created_at timestamptz default now()
);

-- 9) COLUMNAS PENDIENTES DE LA APP ----------------------------------
alter table programs add column if not exists training_days text;
alter table programs add column if not exists duration_minutes integer;
alter table workout_logs add column if not exists notes text;
-- coach_diets: constraint único para poder hacer upsert
do $$ begin
  alter table coach_diets add constraint uq_coach_member unique (coach_id, member_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- ═══════════════════════════════════════════════════════════════════
--  RLS — habilitar y políticas para staff
-- ═══════════════════════════════════════════════════════════════════
alter table branches        enable row level security;
alter table staff_branches  enable row level security;
alter table families        enable row level security;
alter table customers       enable row level security;
alter table cash_shifts     enable row level security;
alter table cash_movements  enable row level security;
alter table stock           enable row level security;
alter table stock_moves     enable row level security;
alter table promotions      enable row level security;
alter table announcements   enable row level security;

-- Helper: ¿el usuario actual es staff (admin/coach/cajera)?
create or replace function is_staff() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid()
                 and role in ('admin','encargado','cajera','coach'));
$$;

-- Política amplia para staff (lectura/escritura). Afinar por rol después.
do $$
declare tb text;
begin
  foreach tb in array array['branches','staff_branches','families','customers',
      'cash_shifts','cash_movements','stock','stock_moves','promotions','announcements'] loop
    execute format('drop policy if exists staff_all on %I', tb);
    execute format('create policy staff_all on %I for all using (is_staff()) with check (is_staff())', tb);
  end loop;
end $$;

-- Roles nuevos permitidos en profiles.role: admin, encargado, cajera
-- (member y coach ya existen). No requiere cambio de tipo si role es text.

-- ═══════════════════════════════════════════════════════════════════
--  SEED de ejemplo (opcional — borra si no lo quieres)
-- ═══════════════════════════════════════════════════════════════════
insert into branches (name, address) values
  ('Sucursal 1 — Centro', 'Dirección pendiente'),
  ('Sucursal 2 — Norte',  'Dirección pendiente'),
  ('Sucursal 3 — Sur',    'Dirección pendiente')
on conflict do nothing;

insert into plans (name, duration_days, price, active) values
  ('Visita',   1,   80,  true),
  ('Semana',   7,   250, true),
  ('2 Semanas',14,  450, true),
  ('Mensual',  30,  600, true),
  ('Anual',    365, 6000,true),
  ('Familiar', 30,  1500,true)
on conflict do nothing;
