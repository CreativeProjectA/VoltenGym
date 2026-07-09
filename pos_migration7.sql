-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #7  (correr en Supabase → SQL Editor)
--  Coach con vigencia (semana/mes), cortesías, permisos de cajera.
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Coach con vigencia: hasta cuándo tiene coach el cliente
alter table customers add column if not exists coach_until date;
alter table member_profiles add column if not exists coach_until date;

-- 2) Días de cortesía: máximo 1 por persona
alter table customers add column if not exists courtesy_used_at timestamptz;

-- 3) Fondo fijo de caja: si al abrir turno no hay $400, se guarda el reporte
alter table cash_shifts add column if not exists fund_shortage boolean default false;
alter table cash_shifts add column if not exists fund_shortage_note text;

-- 4) Ventas: marcar si fue cortesía (para que salga en el corte del turno)
alter table sales add column if not exists is_courtesy boolean default false;

-- 5) Clientes: género y fecha de nacimiento (obligatorios en el alta, cumpleaños)
alter table customers add column if not exists gender text;
alter table customers add column if not exists birth_date date;
alter table customers add column if not exists address text;
