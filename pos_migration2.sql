-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #2  (correr en Supabase → SQL Editor)
--  Arregla restricciones del esquema viejo que bloquean el POS nuevo
--  y da permisos a cajeras/encargados. Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

-- 1) ROLES NUEVOS: encargado, cajera, limpieza -----------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('member','coach','admin','encargado','cajera','limpieza'));

-- 2) is_staff(): SOLO personal que opera el POS ----------------------
--    (security definer para poder usarse en policies de profiles sin recursión)
create or replace function public.is_staff() returns boolean
language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid()
                 and role in ('admin','encargado','cajera'));
$$;

-- 3) PROFILES: el staff puede ver todos (buscar clientes p/ vincular app),
--    el admin puede editar cualquier perfil (personal, roles)
drop policy if exists profiles_select_staff on profiles;
create policy profiles_select_staff on profiles for select using (is_staff());
drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles
  for update using (current_role_is('admin')) with check (current_role_is('admin'));

-- 4) SALES: soltar register_id (legado) y permisos para staff --------
alter table sales alter column register_id drop not null;
drop policy if exists sales_admin_all on sales;
drop policy if exists sales_staff_all on sales;
create policy sales_staff_all on sales for all using (is_staff()) with check (is_staff());

drop policy if exists sale_items_admin_all on sale_items;
drop policy if exists sale_items_staff_all on sale_items;
create policy sale_items_staff_all on sale_items for all using (is_staff()) with check (is_staff());

drop policy if exists cash_registers_admin_all on cash_registers;
drop policy if exists cash_registers_staff_all on cash_registers;
create policy cash_registers_staff_all on cash_registers for all using (is_staff()) with check (is_staff());

-- 5) PRODUCTS: staff opera, precio/stock por sucursal ya existen -----
alter table products alter column type set default 'store_item';
drop policy if exists products_admin_all on products;
drop policy if exists products_staff_all on products;
create policy products_staff_all on products for all using (is_staff()) with check (is_staff());
-- lectura pública (catálogo en la app del miembro, futuro)
drop policy if exists products_public_read on products;
create policy products_public_read on products for select using (active = true);

-- 6) CHECKINS: clientes sin app + método manual + permisos staff -----
alter table checkins alter column member_id drop not null;
alter table checkins drop constraint if exists checkins_method_check;
alter table checkins add constraint checkins_method_check
  check (method in ('qr','fingerprint','face','manual','barcode'));
drop policy if exists checkins_write_admin on checkins;
drop policy if exists checkins_staff_all on checkins;
create policy checkins_staff_all on checkins for all using (is_staff()) with check (is_staff());

-- 7) SUBSCRIPTIONS: clientes sin app + staff vende -------------------
alter table subscriptions alter column member_id drop not null;
drop policy if exists subscriptions_write_admin on subscriptions;
drop policy if exists subscriptions_staff_all on subscriptions;
create policy subscriptions_staff_all on subscriptions for all using (is_staff()) with check (is_staff());
drop policy if exists subscriptions_select on subscriptions;
create policy subscriptions_select on subscriptions
  for select using (member_id = auth.uid() or is_staff() or current_role_is('admin'));

-- 8) PAYMENTS: staff registra cobros ---------------------------------
drop policy if exists payments_write_admin on payments;
drop policy if exists payments_staff_all on payments;
create policy payments_staff_all on payments for all using (is_staff()) with check (is_staff());

-- 9) ANUNCIOS y PROMOS visibles en la app del miembro ----------------
drop policy if exists announcements_public_read on announcements;
create policy announcements_public_read on announcements for select using (active = true);
drop policy if exists promotions_public_read on promotions;
create policy promotions_public_read on promotions for select using (active = true);

-- 10) CONFIGURACIÓN DEL POS (correo del dueño, aforo, etc.) ----------
create table if not exists pos_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
alter table pos_settings enable row level security;
drop policy if exists pos_settings_staff on pos_settings;
create policy pos_settings_staff on pos_settings for all using (is_staff()) with check (is_staff());

-- 11) Índices útiles --------------------------------------------------
create index if not exists idx_sales_shift on sales(shift_id);
create index if not exists idx_sales_created on sales(created_at);
create index if not exists idx_checkins_created on checkins(created_at);
create index if not exists idx_checkins_customer on checkins(customer_id);
create index if not exists idx_subs_customer on subscriptions(customer_id);
create index if not exists idx_subs_end on subscriptions(end_date);
