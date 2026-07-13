-- Encargada de sucursal como "subadministradora" de SU sucursal:
-- puede crear y editar los planes de su propia sucursal (los planes de
-- "ambas sucursales" siguen siendo solo del admin). Cada cambio queda
-- registrado en audit_log y el admin lo ve en su panel de Inicio.

-- Bitácora de movimientos del personal
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete set null,
  staff_name text,
  branch_id uuid references branches(id) on delete set null,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);
alter table audit_log enable row level security;
create policy audit_log_insert_staff on audit_log
  for insert with check (is_staff());
create policy audit_log_read_admin on audit_log
  for select using (is_admin());

-- security definer: los checks de RLS anidados (profiles/staff_branches
-- tienen sus propias politicas) fallan sin esto — mismo problema que ya
-- nos dio is_staff()/is_admin() en la migracion 15.
create or replace function is_encargado_of(b uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists(
    select 1 from profiles p
    join staff_branches sb on sb.staff_id = p.id
    where p.id = auth.uid() and p.role = 'encargado' and sb.branch_id = b
  );
$$;

drop policy if exists plans_write_encargado on plans;
create policy plans_write_encargado on plans
  for all using (branch_id is not null and is_encargado_of(branch_id))
  with check (branch_id is not null and is_encargado_of(branch_id));
