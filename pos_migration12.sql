-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #12  (correr en Supabase → SQL Editor)
--  Registros nuevos que detecta el facial/huella, para que la encargada
--  los asigne con un clic desde el POS (sin tener que leer un número
--  chiquito en la pantalla del aparato y teclearlo a mano).
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists device_enrollments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  device_user_id text not null,
  kind text default 'huella',   -- huella | rostro
  first_seen_at timestamptz default now(),
  assigned_to uuid references customers(id),
  created_at timestamptz default now()
);
create index if not exists idx_device_enroll_branch on device_enrollments(branch_id, assigned_to);

alter table device_enrollments enable row level security;
drop policy if exists device_enrollments_staff on device_enrollments;
create policy device_enrollments_staff on device_enrollments
  for all using (is_staff()) with check (is_staff());
