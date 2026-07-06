-- Volten Gym — esquema inicial + RLS
-- Ejecutar en el SQL Editor de Supabase (proyecto mopyslyhjtnmvlksusjr)

-- ──────────────────────────────────────────────
-- EXTENSIONES
-- ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- TABLAS
-- ──────────────────────────────────────────────

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('member','coach','admin')),
  full_name   text,
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table coach_profiles (
  profile_id        uuid primary key references profiles(id) on delete cascade,
  bio               text,
  specialties       text[] default '{}',
  years_experience  int,
  certifications    jsonb default '[]'
);

create table member_profiles (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  goal           text,   -- 'muscle' | 'fat_loss' | 'health' | 'performance'
  level          text,   -- 'beginner' | 'intermediate' | 'advanced'
  training_days  text[] default '{}',
  coach_id       uuid references profiles(id) on delete set null
);

create table categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  icon  text
);

create table programs (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid references profiles(id) on delete set null,
  title            text not null,
  description      text,
  category_id      uuid references categories(id) on delete set null,
  cover_image_url  text,
  level            text,
  duration_weeks   int,
  created_at       timestamptz not null default now()
);

create table program_exercises (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references programs(id) on delete cascade,
  order_index   int not null default 0,
  name          text not null,
  sets          int,
  reps          text,
  rest_seconds  int,
  video_url     text,
  notes         text
);

create table program_assignments (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references programs(id) on delete cascade,
  member_id    uuid not null references profiles(id) on delete cascade,
  assigned_by  uuid references profiles(id) on delete set null,
  status       text not null default 'active', -- active | completed | paused
  started_at   timestamptz not null default now()
);

create table favorites (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references profiles(id) on delete cascade,
  program_id  uuid not null references programs(id) on delete cascade,
  unique (member_id, program_id)
);

create table workout_logs (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references profiles(id) on delete cascade,
  program_id        uuid references programs(id) on delete set null,
  completed_at      timestamptz not null default now(),
  duration_minutes  int
);

create table progress_entries (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references profiles(id) on delete cascade,
  date        date not null default current_date,
  weight_kg   numeric,
  photo_url   text,
  notes       text
);

create table plans (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  price          numeric not null,
  duration_days  int not null,
  features       jsonb default '[]'
);

create table subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references profiles(id) on delete cascade,
  plan_id     uuid not null references plans(id),
  status      text not null default 'active', -- active | expired | canceled
  start_date  date not null default current_date,
  end_date    date not null
);

create table payments (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references subscriptions(id) on delete cascade,
  amount           numeric not null,
  method           text,
  paid_at          timestamptz not null default now(),
  recorded_by      uuid references profiles(id) on delete set null
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  type        text not null,
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- HELPER: rol del usuario actual (evita recursión en policies)
-- ──────────────────────────────────────────────
create or replace function public.current_role_is(target_role text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = target_role
  );
$$;

-- ──────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────
alter table profiles enable row level security;
alter table coach_profiles enable row level security;
alter table member_profiles enable row level security;
alter table categories enable row level security;
alter table programs enable row level security;
alter table program_exercises enable row level security;
alter table program_assignments enable row level security;
alter table favorites enable row level security;
alter table workout_logs enable row level security;
alter table progress_entries enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table notifications enable row level security;

-- profiles: cada quien lee/edita lo suyo; lectura básica pública para mostrar nombre/avatar de coach a sus clientes
create policy "profiles_select_own_or_related" on profiles
  for select using (
    id = auth.uid()
    or current_role_is('admin')
    or id in (select coach_id from member_profiles where profile_id = auth.uid())
    or id in (select profile_id from member_profiles where coach_id = auth.uid())
  );
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

-- coach_profiles
create policy "coach_profiles_select_all_auth" on coach_profiles
  for select using (auth.role() = 'authenticated');
create policy "coach_profiles_write_own" on coach_profiles
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- member_profiles
create policy "member_profiles_select_own_or_coach" on member_profiles
  for select using (
    profile_id = auth.uid()
    or coach_id = auth.uid()
    or current_role_is('admin')
  );
create policy "member_profiles_write_own" on member_profiles
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- categories: lectura pública, escritura solo admin
create policy "categories_select_all" on categories
  for select using (true);
create policy "categories_write_admin" on categories
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- programs: dueño coach CRUD; members con assignment activa o si el programa es público lectura
create policy "programs_select" on programs
  for select using (
    coach_id = auth.uid()
    or coach_id is null and exists (
      select 1 from member_profiles where profile_id = auth.uid()
    )
    or id in (select program_id from program_assignments where member_id = auth.uid())
  );
create policy "programs_write_owner" on programs
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy "programs_insert_member_own" on programs
  for insert with check (coach_id is null and auth.uid() is not null);

-- program_exercises: sigue permisos del programa padre
create policy "program_exercises_select" on program_exercises
  for select using (
    exists (
      select 1 from programs p where p.id = program_id and (
        p.coach_id = auth.uid()
        or p.id in (select program_id from program_assignments where member_id = auth.uid())
      )
    )
  );
create policy "program_exercises_write_owner" on program_exercises
  for all using (
    exists (select 1 from programs p where p.id = program_id and p.coach_id = auth.uid())
  ) with check (
    exists (select 1 from programs p where p.id = program_id and p.coach_id = auth.uid())
  );

-- program_assignments
create policy "program_assignments_select" on program_assignments
  for select using (member_id = auth.uid() or assigned_by = auth.uid());
create policy "program_assignments_write" on program_assignments
  for all using (assigned_by = auth.uid() or member_id = auth.uid())
  with check (assigned_by = auth.uid() or member_id = auth.uid());

-- favorites
create policy "favorites_own" on favorites
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- workout_logs
create policy "workout_logs_select" on workout_logs
  for select using (
    member_id = auth.uid()
    or member_id in (select profile_id from member_profiles where coach_id = auth.uid())
  );
create policy "workout_logs_write_own" on workout_logs
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- progress_entries
create policy "progress_entries_select" on progress_entries
  for select using (
    member_id = auth.uid()
    or member_id in (select profile_id from member_profiles where coach_id = auth.uid())
  );
create policy "progress_entries_write_own" on progress_entries
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- plans: lectura pública, escritura solo admin
create policy "plans_select_all" on plans
  for select using (true);
create policy "plans_write_admin" on plans
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- subscriptions: member lee la suya, admin todo
create policy "subscriptions_select" on subscriptions
  for select using (member_id = auth.uid() or current_role_is('admin'));
create policy "subscriptions_write_admin" on subscriptions
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- payments: solo admin
create policy "payments_select_admin_or_owner" on payments
  for select using (
    current_role_is('admin')
    or subscription_id in (select id from subscriptions where member_id = auth.uid())
  );
create policy "payments_write_admin" on payments
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- notifications
create policy "notifications_select_own" on notifications
  for select using (profile_id = auth.uid());
create policy "notifications_update_own" on notifications
  for update using (profile_id = auth.uid());
create policy "notifications_insert_system" on notifications
  for insert with check (true); -- emitidas por triggers/edge functions con service_role normalmente

-- ──────────────────────────────────────────────
-- TRIGGER: crear profile automáticamente al registrarse
-- ──────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
