-- VOLTEN GYM - Migracion 28
-- Correr en Supabase -> SQL Editor -> New query -> pegar todo -> Run.
-- Requiere que la Migracion 27 (columna branch_id) ya se haya corrido.
--
-- Esto SEPARA los productos de tienda por sucursal, para que un cambio de
-- precio en una sucursal YA NO se refleje en la otra nunca mas.
--
-- Que hace exactamente:
--  1. A los productos que YA son de una sola sucursal, solo les pone la
--     etiqueta de a cual pertenecen.
--  2. A los productos COMPARTIDOS (existen en las dos sucursales): la
--     ficha que ya existe se queda como la de Gomez Morin, se crea una
--     ficha NUEVA (copia exacta de nombre/precio/categoria) para Tres
--     Cantos, y se mueve la fila de stock de Tres Cantos hacia la ficha
--     nueva -- su cantidad actual NO cambia, solo cambia a que ficha
--     pertenece.
--  3. NO se toca sales, sale_items ni stock_moves -- el historial de
--     ventas y reportes pasados se queda exactamente igual.
--
-- Es seguro correrlo una sola vez. Si por algo se corre dos veces, las
-- lineas de "insert" van a fallar por ID repetido (no van a duplicar
-- nada) -- avisame si eso pasa y lo reviso antes de reintentar.

begin;

-- 1) Productos que ya son de una sola sucursal -----------------------
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '7500b0db-d7c8-4bb0-a50c-c423bac6faf1'; -- Jabón artesanal -> Gómez Morín
update products set branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248' where id = '049a7406-9374-461e-aa83-b274386efd6f'; -- Barritas Litfit -> Tres Cantos
update products set branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248' where id = '2a3e0361-1ebd-4ee7-b047-c6d37aff14cb'; -- Energizante -> Tres Cantos
update products set branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248' where id = '14832094-a03d-4d09-91f7-5a0c6d3e3085'; -- Pollo seco -> Tres Cantos
update products set branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248' where id = 'af1353aa-c7f7-4c95-97e5-048b0876b2e0'; -- Prote liquida -> Tres Cantos
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '0b4b0ed0-8291-4e38-8b04-e667df45d99b'; -- NADA (huerfano) -> Gómez Morín

-- 2) Productos compartidos: clonar para Tres Cantos y mover su stock --

-- E pura
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select 'cbb790e3-bd3c-4769-83d4-ede7a23f7f9a', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '032a81b8-8b0b-45fd-9e38-4267e90fdac6';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '032a81b8-8b0b-45fd-9e38-4267e90fdac6';
update stock set product_id = 'cbb790e3-bd3c-4769-83d4-ede7a23f7f9a' where product_id = '032a81b8-8b0b-45fd-9e38-4267e90fdac6' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- NADA (compartido)
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select 'ee0471fc-f83c-4ac6-a722-f9a376b58c87', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '1a6f17f9-2300-4db0-9a9c-9e237b5e8785';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '1a6f17f9-2300-4db0-9a9c-9e237b5e8785';
update stock set product_id = 'ee0471fc-f83c-4ac6-a722-f9a376b58c87' where product_id = '1a6f17f9-2300-4db0-9a9c-9e237b5e8785' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Scoop de proteína
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '97c94ae3-ae71-4b17-89e7-a9f4889b0900', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '26563f52-ad57-4cee-9e13-3f61b60751bc';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '26563f52-ad57-4cee-9e13-3f61b60751bc';
update stock set product_id = '97c94ae3-ae71-4b17-89e7-a9f4889b0900' where product_id = '26563f52-ad57-4cee-9e13-3f61b60751bc' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Monster
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '25dfe98c-7f47-41cb-a755-3311dd0b6d62', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '2e38f88a-d9c9-4b40-9166-6e1cc95aef22';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '2e38f88a-d9c9-4b40-9166-6e1cc95aef22';
update stock set product_id = '25dfe98c-7f47-41cb-a755-3311dd0b6d62' where product_id = '2e38f88a-d9c9-4b40-9166-6e1cc95aef22' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Scoop de pre-entreno
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select 'b22bf684-3e52-400d-b3b0-1ed1db533bd0', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '3b41015e-0215-436f-9ecd-812d89866a4b';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '3b41015e-0215-436f-9ecd-812d89866a4b';
update stock set product_id = 'b22bf684-3e52-400d-b3b0-1ed1db533bd0' where product_id = '3b41015e-0215-436f-9ecd-812d89866a4b' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Barritas proteína Kirkland
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '953172bd-e030-4294-9da9-9be516256325', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '606e9577-878f-4f95-adb6-c19f0ebdd3e2';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '606e9577-878f-4f95-adb6-c19f0ebdd3e2';
update stock set product_id = '953172bd-e030-4294-9da9-9be516256325' where product_id = '606e9577-878f-4f95-adb6-c19f0ebdd3e2' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Susalias
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select 'b857df3a-3d77-41c3-a926-5854a8352704', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '6259db4c-2589-410b-9342-2a844946efa7';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '6259db4c-2589-410b-9342-2a844946efa7';
update stock set product_id = 'b857df3a-3d77-41c3-a926-5854a8352704' where product_id = '6259db4c-2589-410b-9342-2a844946efa7' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Brookies
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '5b07f679-90f3-4477-9f47-86be75fd903c', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = '8a421787-23de-4e52-8c05-0b65eadf71c9';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = '8a421787-23de-4e52-8c05-0b65eadf71c9';
update stock set product_id = '5b07f679-90f3-4477-9f47-86be75fd903c' where product_id = '8a421787-23de-4e52-8c05-0b65eadf71c9' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Rice Krispies
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '241180fd-3b44-4dcd-acf5-29e29945792e', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = 'a6c294f1-84f8-42e8-a6cf-2acf6968af36';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = 'a6c294f1-84f8-42e8-a6cf-2acf6968af36';
update stock set product_id = '241180fd-3b44-4dcd-acf5-29e29945792e' where product_id = 'a6c294f1-84f8-42e8-a6cf-2acf6968af36' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Powerade
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '5a132503-2e38-4a67-ba02-d03dc1520042', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = 'b739cf51-d56c-482e-9f98-a9534e68990e';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = 'b739cf51-d56c-482e-9f98-a9534e68990e';
update stock set product_id = '5a132503-2e38-4a67-ba02-d03dc1520042' where product_id = 'b739cf51-d56c-482e-9f98-a9534e68990e' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

-- Gomitas
insert into products (id, name, type, price, cost, category, sku, active, branch_id)
  select '0396c8ad-af81-4fda-a284-53f2015ae4fc', name, type, price, cost, category, sku, active, '78857b72-1bcb-4ecb-a031-c2d9d7b5b248'
  from products where id = 'f077fd9a-eebe-42d6-9367-92c096b4df5e';
update products set branch_id = 'aa6c7382-7494-434b-a2e7-5fe24349e4f8' where id = 'f077fd9a-eebe-42d6-9367-92c096b4df5e';
update stock set product_id = '0396c8ad-af81-4fda-a284-53f2015ae4fc' where product_id = 'f077fd9a-eebe-42d6-9367-92c096b4df5e' and branch_id = '78857b72-1bcb-4ecb-a031-c2d9d7b5b248';

commit;

-- Verificacion rapida: despues de correr esto, todos los productos de
-- tienda deben tener branch_id (ninguno debe salir en null).
select count(*) as productos_sin_branch_id
from products
where type = 'store_item' and branch_id is null;
