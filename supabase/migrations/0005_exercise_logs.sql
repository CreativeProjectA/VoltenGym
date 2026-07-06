-- Volten Gym — registro por ejercicio dentro de una sesión: peso usado,
-- video grabado (para que el coach lo revise), y sugerencia del coach de
-- cuánto peso subir la próxima vez.

create table exercise_logs (
  id                  uuid primary key default gen_random_uuid(),
  workout_log_id      uuid not null references workout_logs(id) on delete cascade,
  member_id           uuid not null references profiles(id) on delete cascade,
  program_exercise_id uuid references program_exercises(id) on delete set null,
  exercise_name       text not null,      -- copia del nombre por si el ejercicio mock no tiene fila real
  weight_kg           numeric,
  video_path          text,               -- path dentro del bucket de Storage "exercise-videos"
  coach_note          text,
  suggested_weight_kg numeric,
  created_at          timestamptz not null default now()
);

alter table exercise_logs enable row level security;

-- el member lee/escribe lo suyo; el coach asignado puede leer y dejar nota/sugerencia
create policy "exercise_logs_select_own_or_coach" on exercise_logs
  for select using (
    member_id = auth.uid()
    or member_id in (select profile_id from member_profiles where coach_id = auth.uid())
    or current_role_is('admin')
  );
create policy "exercise_logs_insert_own" on exercise_logs
  for insert with check (member_id = auth.uid());
create policy "exercise_logs_update_own_or_coach" on exercise_logs
  for update using (
    member_id = auth.uid()
    or member_id in (select profile_id from member_profiles where coach_id = auth.uid())
  );

-- Storage bucket privado para los videos de ejercicio (correr aparte si tu
-- proyecto no permite crear buckets por SQL: Storage → New bucket → "exercise-videos", privado).
insert into storage.buckets (id, name, public)
values ('exercise-videos', 'exercise-videos', false)
on conflict (id) do nothing;

create policy "exercise_videos_owner_rw" on storage.objects
  for all using (
    bucket_id = 'exercise-videos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'exercise-videos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "exercise_videos_coach_read" on storage.objects
  for select using (
    bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1]::uuid in (
      select profile_id from member_profiles where coach_id = auth.uid()
    )
  );
