-- Cancelar coach ya NO corta el acceso al momento (antes cancelCoach ponía
-- coach_id/coach_until en null de inmediato, cortando algo que el cliente
-- ya había pagado). Ahora coach_id/coach_until se quedan intactos y solo se
-- marca coach_cancelled=true para indicar "no se renueva después de esta
-- fecha" — el acceso real se sigue controlando por coach_until como ya
-- hacía la app (member_profiles.coach_until vencido = ya no cuenta).

alter table customers add column if not exists coach_cancelled boolean not null default false;
alter table member_profiles add column if not exists coach_cancelled boolean not null default false;
