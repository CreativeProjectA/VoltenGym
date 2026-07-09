-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #8  (correr en Supabase → SQL Editor)
--  Video de referencia por ejercicio (biblioteca global con video).
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

alter table exercise_catalog add column if not exists video_url text;
