-- VOLTEN GYM - Migracion 26
-- Correr en Supabase -> SQL Editor -> New query -> pegar todo -> Run.
-- Se puede correr varias veces sin problema.
--
-- Agrega lo minimo para tres cosas que hoy no se pueden hacer:
--   1. CANCELAR una venta mal cobrada (hoy no hay forma de corregir).
--   2. CONGELAR una membresia (vacaciones, lesion) sin perder los dias.
--   3. Avisar por notificacion que la membresia esta por vencer, SIN
--      repetirle el aviso al mismo cliente una y otra vez.

-- 1. CANCELAR VENTA -------------------------------------------------
-- No se borra la venta: se marca cancelada y se guarda quien y por que,
-- para que el corte y los reportes puedan descontarla dejando el rastro.
alter table sales add column if not exists cancelled_at   timestamptz;
alter table sales add column if not exists cancelled_by   uuid references profiles(id);
alter table sales add column if not exists cancel_reason  text;

-- 2. CONGELAR MEMBRESIA ---------------------------------------------
-- Al congelar se guarda el dia en que se congelo. Al reactivar, los dias
-- que estuvo congelada se le suman a end_date, asi no pierde lo que pago.
alter table subscriptions add column if not exists frozen_at    timestamptz;
alter table subscriptions add column if not exists frozen_days  integer not null default 0;

-- 3. AVISO DE VENCIMIENTO -------------------------------------------
-- Marca la fecha en que ya se le aviso, para no repetirle la notificacion.
alter table subscriptions add column if not exists expiry_notified_at timestamptz;

-- Para buscar rapido a quien hay que avisarle
create index if not exists subs_end_date_idx on subscriptions (end_date);
