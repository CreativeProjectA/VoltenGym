-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #10  (correr en Supabase → SQL Editor)
--  Los coaches también pueden crear ejercicios nuevos en el catálogo
--  global (no solo el admin) y subirles video desde su app.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

alter table exercise_catalog enable row level security;

drop policy if exists exercise_catalog_read on exercise_catalog;
create policy exercise_catalog_read on exercise_catalog
  for select using (true);  -- todos los usuarios logueados lo ven (biblioteca global)

drop policy if exists exercise_catalog_staff_write on exercise_catalog;
create policy exercise_catalog_staff_write on exercise_catalog
  for all using (is_staff()) with check (is_staff());  -- admin y coaches crean/editan/suben video
