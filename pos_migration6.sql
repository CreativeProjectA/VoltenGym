-- ═══════════════════════════════════════════════════════════════════
--  VOLTEN GYM — Migración POS #6  (correr en Supabase → SQL Editor)
--  Guarda QUÉ se vendió en cada venta (para el desglose en reportes).
--  Seguro de correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

alter table sales add column if not exists concept text;
