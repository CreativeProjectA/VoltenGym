-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #23  (correr en Supabase → SQL Editor)
--  Agrega el rol "tecnico" a la lista de roles permitidos en Personal.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('member','coach','admin','encargado','cajera','limpieza','contador','tecnico'));
