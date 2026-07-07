-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #5  (correr en Supabase → SQL Editor)
--  Que el POS pueda asignar coach + sucursal al perfil del miembro.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

-- El coach se guarda también en la ficha del cliente (para transferirlo
-- cuando el cliente vincule su app después).
alter table customers add column if not exists coach_id uuid references profiles(id);

-- El staff (recepción) puede asignar coach_id / branch_id al perfil del
-- miembro cuando le cobra un coach. Sin esto, el RLS lo bloqueaba y el
-- entrenador comprado en el POS no aparecía en la app del cliente.
drop policy if exists member_profiles_staff_write on member_profiles;
create policy member_profiles_staff_write on member_profiles
  for all using (is_staff()) with check (is_staff());
