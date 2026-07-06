-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #4  (correr en Supabase → SQL Editor)
--  Solicitudes desde la app, precios por sucursal, huella/facial.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

-- 1) SOLICITUDES DESDE LA APP (membresía o coach → se cobran en recepción)
create table if not exists pos_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('plan','coach')),
  ref_id uuid,                -- plan_id o coach profile_id
  ref_name text,              -- nombre legible (plan o coach)
  price numeric,
  status text not null default 'pendiente',  -- pendiente | cobrada | cancelada
  branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);
alter table pos_requests enable row level security;
drop policy if exists pos_requests_member on pos_requests;
create policy pos_requests_member on pos_requests
  for insert with check (member_id = auth.uid());
drop policy if exists pos_requests_member_read on pos_requests;
create policy pos_requests_member_read on pos_requests
  for select using (member_id = auth.uid());
drop policy if exists pos_requests_staff on pos_requests;
create policy pos_requests_staff on pos_requests
  for all using (is_staff()) with check (is_staff());

-- 2) PRECIOS POR SUCURSAL (plan con branch_id = solo esa sucursal; null = ambas)
alter table plans add column if not exists branch_id uuid references branches(id);

-- 3) HUELLA Y FACIAL por cliente (se llenan cuando llegue el hardware)
alter table customers add column if not exists fingerprint_id text;
alter table customers add column if not exists face_id text;
