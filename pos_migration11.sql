-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #11  (correr en Supabase → SQL Editor)
--  Corrige la migración 10: SOLO el admin puede crear/editar ejercicios
--  y subirles video — los coaches ya NO pueden (decisión del dueño,
--  para evitar duplicados/desorden entre varios coaches). Todos
--  (incluidos coaches y miembros) siguen pudiendo VER la biblioteca.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists exercise_catalog_staff_write on exercise_catalog;
drop policy if exists exercise_catalog_admin_write on exercise_catalog;
create policy exercise_catalog_admin_write on exercise_catalog
  for all using (is_admin()) with check (is_admin());
