-- BUG REAL encontrado: la migracion 11 intento quitarle a los coaches el
-- permiso de escribir en exercise_catalog, pero borro una politica con un
-- nombre que nunca existio ("exercise_catalog_staff_write") en vez de la
-- politica real de la migracion 10 ("exercise_catalog_write_admin_coach").
-- Esa politica vieja seguia viva y dejaba a los coaches insertar/editar
-- ejercicios sin que nadie lo supiera. Se corrige quitandola de verdad.

drop policy if exists exercise_catalog_write_admin_coach on exercise_catalog;
drop policy if exists exercise_catalog_admin_write on exercise_catalog;

create policy exercise_catalog_admin_write on exercise_catalog
  for all using (is_admin()) with check (is_admin());

-- Términos y condiciones: el cliente/coach los confirma UNA vez dentro de
-- la app (checkbox obligatorio) antes de poder usarla.
alter table profiles add column if not exists accepted_terms_at timestamptz;
