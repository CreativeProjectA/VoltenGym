-- Volten Gym — POS (punto de venta) + control de acceso (check-ins)

-- ──────────────────────────────────────────────
-- TABLAS — POS
-- ──────────────────────────────────────────────

create table products (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  type    text not null check (type in ('membership','day_pass','store_item')),
  price   numeric not null,
  stock   int,
  plan_id uuid references plans(id)
);

create table cash_registers (
  id              uuid primary key default gen_random_uuid(),
  opened_by       uuid not null references profiles(id),
  opened_at       timestamptz not null default now(),
  opening_amount  numeric not null,
  closed_by       uuid references profiles(id),
  closed_at       timestamptz,
  closing_amount  numeric,
  notes           text
);

create table sales (
  id              uuid primary key default gen_random_uuid(),
  register_id     uuid not null references cash_registers(id),
  member_id       uuid references profiles(id),
  total           numeric not null,
  payment_method  text not null check (payment_method in ('cash','card','transfer')),
  sold_by         uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

create table sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references sales(id) on delete cascade,
  product_id  uuid not null references products(id),
  quantity    int not null default 1,
  unit_price  numeric not null
);

-- ──────────────────────────────────────────────
-- TABLA — control de acceso
-- ──────────────────────────────────────────────

create table checkins (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id),
  method       text not null check (method in ('qr','fingerprint','face')),
  verified_by  uuid references profiles(id),
  granted      boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────
alter table products enable row level security;
alter table cash_registers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table checkins enable row level security;

-- products: solo admin/staff
create policy "products_admin_all" on products
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- cash_registers: solo admin/staff
create policy "cash_registers_admin_all" on cash_registers
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- sales: solo admin/staff (el member NO ve el detalle de venta, solo su subscription)
create policy "sales_admin_all" on sales
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- sale_items: sigue el permiso de la venta padre
create policy "sale_items_admin_all" on sale_items
  for all using (
    exists (select 1 from sales s where s.id = sale_id and current_role_is('admin'))
  ) with check (
    exists (select 1 from sales s where s.id = sale_id and current_role_is('admin'))
  );

-- checkins: el member lee las suyas; solo admin (o una función de servicio) inserta/edita
create policy "checkins_select_own_or_admin" on checkins
  for select using (member_id = auth.uid() or current_role_is('admin'));
create policy "checkins_write_admin" on checkins
  for all using (current_role_is('admin')) with check (current_role_is('admin'));
