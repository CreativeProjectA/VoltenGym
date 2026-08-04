-- VOLTEN GYM - Migracion 27
-- Correr en Supabase -> SQL Editor -> New query -> pegar todo -> Run.
-- Se puede correr varias veces sin problema.
--
-- Le agrega a los PRODUCTOS DE TIENDA (Powerade, Rice Krispies, etc.) la
-- misma separacion por sucursal que ya tienen los planes de membresia.
-- Hoy los productos son UNA sola ficha compartida entre las dos sucursales
-- -- por eso cuando alguien cambia un precio en una sucursal, se le mueve
-- tambien a la otra sin que nadie lo pida. Con esta columna, cada sucursal
-- va a tener su propia ficha, y una nunca va a poder tocar la de la otra.
--
-- Esto SOLO agrega una columna nueva (nullable, no rompe nada de lo que ya
-- existe). No borra ni mueve ningun dato -- eso lo hace aparte el programa,
-- ya con la columna disponible.

alter table products add column if not exists branch_id uuid references branches(id);

-- Para que las consultas por sucursal sean rapidas
create index if not exists products_branch_id_idx on products (branch_id);
