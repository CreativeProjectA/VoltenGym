-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #24  (correr en Supabase → SQL Editor)
--
--  Bug encontrado: coach_profiles solo se podía escribir a sí mismo
--  (profile_id = auth.uid()), así que cuando el admin/encargado crea o
--  edita a OTRA persona como coach desde Personal, Supabase lo rechazaba
--  en silencio (RLS) y NUNCA se creaba su fila en coach_profiles. Por
--  eso ningún coach nuevo aparecía en "Nueva venta" ni en la app, y no
--  se le podía poner precio (no había fila que actualizar).
--
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "coach_profiles_staff_all" on coach_profiles;
create policy "coach_profiles_staff_all" on coach_profiles
  for all using (is_staff()) with check (is_staff());
