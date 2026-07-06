create table coach_diets (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references profiles(id) on delete cascade,
  member_id     uuid not null references profiles(id) on delete cascade,
  title         text not null default 'Plan alimenticio',
  content       text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table coach_diets enable row level security;
create policy "coach_diets_read" on coach_diets
  for select using (member_id = auth.uid() or coach_id = auth.uid());
create policy "coach_diets_write_coach" on coach_diets
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
