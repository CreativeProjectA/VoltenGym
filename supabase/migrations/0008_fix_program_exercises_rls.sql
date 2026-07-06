-- Volten Gym — mismo arreglo que 0007 pero para los ejercicios de cada
-- programa: permite verlos si el programa es genérico (coach_id null).

drop policy if exists "program_exercises_select" on program_exercises;

create policy "program_exercises_select" on program_exercises
  for select using (
    exists (
      select 1 from programs p where p.id = program_id and (
        p.coach_id = auth.uid()
        or p.coach_id is null
        or p.id in (select program_id from program_assignments where member_id = auth.uid())
      )
    )
  );
