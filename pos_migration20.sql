-- La migracion 19 no cerro el bug del todo -- probado en vivo otra vez,
-- un coach SIGUE pudiendo insertar en exercise_catalog. Hay varias
-- politicas viejas con nombres distintos acumuladas de migraciones
-- pasadas y adivinar el nombre exacto ya fallo dos veces. Esta vez se
-- borran TODAS las politicas de esa tabla, sin importar el nombre, y se
-- crean solo las 2 correctas.

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'exercise_catalog' loop
    execute format('drop policy if exists %I on exercise_catalog', pol.policyname);
  end loop;
end $$;

create policy exercise_catalog_read_auth on exercise_catalog
  for select using (auth.role() = 'authenticated');

create policy exercise_catalog_admin_write on exercise_catalog
  for all using (is_admin()) with check (is_admin());
