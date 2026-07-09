-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #9  (correr en Supabase → SQL Editor)
--  Horario de entrada/salida del personal (coach/encargados/cajeras),
--  para saber cuándo ya se fueron sin que tengan que volver a marcar.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

alter table profiles add column if not exists shift_start time;
alter table profiles add column if not exists shift_end time;
