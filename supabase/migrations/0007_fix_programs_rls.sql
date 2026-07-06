-- Volten Gym — permite ver programas genéricos (coach_id null) a cualquier
-- usuario autenticado, sin depender de que ya exista su member_profiles
-- (antes esto bloqueaba a cuentas que aún no terminaban el onboarding).

drop policy if exists "programs_select" on programs;

create policy "programs_select" on programs
  for select using (
    coach_id = auth.uid()
    or coach_id is null
    or id in (select program_id from program_assignments where member_id = auth.uid())
  );
