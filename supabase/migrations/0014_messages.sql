-- Direct messages between coach and member.
create table messages (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references profiles(id) on delete cascade,
  to_id      uuid not null references profiles(id) on delete cascade,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table messages enable row level security;
create policy "messages_own" on messages
  for all using (from_id = auth.uid() or to_id = auth.uid())
  with check (from_id = auth.uid());

create index messages_conversation_idx on messages (
  least(from_id::text, to_id::text),
  greatest(from_id::text, to_id::text),
  created_at
);
