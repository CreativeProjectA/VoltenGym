-- VOLTEN GYM - Migracion POS #14 (correr en Supabase -> SQL Editor)
-- Captacion de clientes: de donde vino cada cliente (anuncio de Meta,
-- recomendado, pasaba por ahi, etc.) para poder ver que canal esta
-- trayendo mas gente. Solo anota el origen, no se conecta con Meta Ads.
-- Segura de correr varias veces.

alter table customers add column if not exists lead_source text;
alter table customers add column if not exists lead_campaign text;

alter table pending_registrations add column if not exists lead_source text;
alter table pending_registrations add column if not exists lead_campaign text;
