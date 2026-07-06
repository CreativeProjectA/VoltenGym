-- Progress photos: members upload body-composition photos over time.
create table progress_photos (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references profiles(id) on delete cascade,
  photo_url   text not null,
  note        text,
  taken_at    timestamptz not null default now()
);

alter table progress_photos enable row level security;
create policy "progress_photos_own" on progress_photos
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "progress_photos_coach" on progress_photos
  for select using (
    exists (
      select 1 from member_profiles mp
      where mp.profile_id = progress_photos.member_id
        and mp.coach_id = auth.uid()
    )
  );
