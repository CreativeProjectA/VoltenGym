-- Volten Gym — récords personales (PRs) que el usuario va agregando.

create table personal_records (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references profiles(id) on delete cascade,
  exercise_name text not null,
  value         numeric not null,
  unit          text not null default 'kg',
  achieved_at   date not null default current_date,
  created_at    timestamptz not null default now()
);

alter table personal_records enable row level security;

create policy "personal_records_select_own_or_coach" on personal_records
  for select using (
    member_id = auth.uid()
    or member_id in (select profile_id from member_profiles where coach_id = auth.uid())
    or current_role_is('admin')
  );
create policy "personal_records_write_own" on personal_records
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());
