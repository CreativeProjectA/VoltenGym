-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #3  (correr en Supabase → SQL Editor)
--  Contador (solo reportes), fotos de personal, sucursal del miembro.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

-- 1) ROL NUEVO: contador (solo puede LEER reportes) ------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('member','coach','admin','encargado','cajera','limpieza','contador'));

-- lectura para el contador en las tablas de reportes
do $$ declare tb text; begin
  foreach tb in array array['sales','sale_items','cash_shifts','cash_movements',
      'checkins','subscriptions','customers','products','stock','stock_moves','promotions','branches'] loop
    execute format('drop policy if exists contador_read on %I', tb);
    execute format('create policy contador_read on %I for select using (current_role_is(''contador''))', tb);
  end loop; end $$;
drop policy if exists profiles_select_contador on profiles;
create policy profiles_select_contador on profiles for select using (current_role_is('contador'));

-- 2) SUCURSAL DEL MIEMBRO (la app filtra coaches por sucursal) -------
alter table member_profiles add column if not exists branch_id uuid references branches(id);

-- los miembros necesitan leer sucursales y a qué sucursal pertenece cada coach
drop policy if exists branches_public_read on branches;
create policy branches_public_read on branches for select using (true);
drop policy if exists staff_branches_public_read on staff_branches;
create policy staff_branches_public_read on staff_branches for select using (true);

-- 3) BÁSCULA: composición corporal del miembro (el coach la ve) ------
alter table member_profiles add column if not exists body_data jsonb default '{}';

-- 4) FOTOS DE PERSONAL (bucket público 'avatars') --------------------
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
on conflict (id) do nothing;
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists avatars_staff_insert on storage.objects;
create policy avatars_staff_insert on storage.objects
  for insert with check (bucket_id = 'avatars' and is_staff());
drop policy if exists avatars_staff_update on storage.objects;
create policy avatars_staff_update on storage.objects
  for update using (bucket_id = 'avatars' and is_staff());
