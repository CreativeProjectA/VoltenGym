# VOLTEN GYM — Especificación del POS (Punto de Venta)
> Análisis completo. Fecha: 2026-07-03. Referencia visual: POS Lavapower (screenshots) + fotos que enviará Armando.
> Plataforma: **computadora/escritorio** (no teléfono). Mismo link que la app: botón "Solo personal" en la pantalla de bienvenida → login de staff → panel POS.
> Estética: **blanco dominante**, cards grises `#F5F5F5`, acentos naranja `#F97316`, negro puntual `#0A0A0A`, Plus Jakarta Sans. Layout desktop con sidebar (como Lavapower).

---

## 0. Principio rector
Un solo Supabase para TODO: app de miembros + app de coach + POS + control de acceso. Todo registro lleva `branch_id` (sucursal). Lo que pasa en el POS se refleja al instante en la app del cliente y viceversa.

## 1. Acceso y roles
- Entrada: pantalla de bienvenida de la app → link discreto arriba "Solo personal" → login (correo + contraseña creados por el admin, NUNCA auto-registro).
- **Roles** (columna `profiles.role` + tabla `staff_branches` para sucursal):
  | Permiso | Admin | Encargado | Cajera |
  |---|---|---|---|
  | Caja: abrir/cerrar turno, vender | ✓ | ✓ | ✓ |
  | Clientes: alta, vincular app, membresías | ✓ | ✓ | ✓ |
  | Promociones: crear/editar | ✓ | ✓ | ✗ |
  | Inventario: entradas/ajustes | ✓ | ✓ | ✗ |
  | Staff: crear/quitar cajeras y coaches | ✓ | ✗ | ✗ |
  | Precios de planes, config sucursal | ✓ | ✗ | ✗ |
  | Reportes de TODAS las sucursales | ✓ | ✗ (solo la suya) | ✗ |
  | Quitar acceso a un cliente (suspender) | ✓ | ✓ | ✗ |
- El admin da de alta a los **coaches** desde aquí (crea su cuenta con rol coach → aparece automáticamente en "Elige tu entrenador" de la app). Esto cierra el pendiente de que nadie pueda autoregistrarse como coach.

## 2. Multi-sucursal (3 sucursales)
- Tabla `branches` (id, nombre, dirección, teléfono).
- Al iniciar sesión, cajera/encargado quedan fijos a SU sucursal; el admin elige sucursal con un selector arriba (o "Todas" para reportes).
- Inventario, cajas, check-ins y ventas son por sucursal. Los clientes y membresías son GLOBALES (un cliente puede entrar en cualquier sucursal — configurable por plan).

## 3. Clientes (el corazón)
- Ficha: nombre, teléfono/WhatsApp, correo, foto, fecha de alta, sucursal de origen, notas.
- **Vinculación con la app**: botón "Vincular app" → escanea el QR del teléfono del cliente (lector USB o webcam) → une la ficha con su `profile_id` de la app. También búsqueda por correo como plan B.
- Historial completo por cliente: pagos, membresías (todas las que ha tenido), check-ins (entradas/salidas), compras de productos, coach asignado.
- **Familias**: grupo familiar con UN pagador. Se crea la familia, se agregan miembros (cada uno con su ficha/acceso propio), el plan familiar cubre a todos. Descuento configurable (dejar % de prueba editable hasta tener precios reales).

## 4. Membresías y planes
- Catálogo de planes editable por el admin: **Visita**, **Semana**, **2 semanas**, **Mes**, **Año**, **Familiar** (y los que agreguen). Cada plan: nombre, duración en días, precio, si es multi-sucursal, máximo de miembros (familiar).
- Venta de membresía: elegir cliente → plan → método de pago (efectivo/tarjeta/transferencia) → se crea la `subscription` y el cobro entra al turno de caja actual.
- **Acumulación (regla del dueño)**: si el cliente aún tiene días vigentes, la nueva compra NO pisa los días — la nueva vigencia empieza donde termina la actual: `nueva_fecha_fin = max(hoy, fin_actual) + duración_del_plan`. Ejemplo: le quedan 10 días y compra un mes → queda con 40 días.
- Renovación, congelamiento (pausar por viaje/lesión — días se conservan), cancelación.
- Alertas: lista de "por vencer en 7 días" y "vencidas" para seguimiento.
- Registro de **quién vendió cada membresía** (cajera + turno) → reporte de suscripciones vendidas por empleada.

## 5. Caja y turnos (modelo Lavapower, ya probado)
- Abrir turno: fondo inicial + tipo de cambio USD (si aceptan dólares).
- Durante el turno: toda venta (membresía o producto) queda ligada al turno; movimientos "meter/retirar efectivo" con motivo.
- Cerrar turno: arqueo (efectivo contado vs esperado), desglose efectivo/tarjeta/transferencia/dólares, lista de órdenes del turno.
- **Al cerrar: correo automático al dueño** con el resumen del día (ventas, membresías vendidas, entradas de clientes, desglose por método, diferencias de caja).
- Historial de turnos con comparativo por empleado + **exportar a Excel/CSV** (turnos, ventas, todo).

## 6. Ventas de mostrador + Inventario
- Productos: proteínas, barras, aguas, ropa, guantes, etc. Con foto, precio, código de barras, stock **por sucursal**.
- Venta rápida: escanear/buscar producto → carrito → cobrar (entra al turno).
- Inventario: entradas (compras a proveedor), salidas, ajustes, alertas de stock bajo, valor del inventario.
- Los productos también podrán mostrarse en la app del miembro más adelante (catálogo/pedidos).

## 7. Control de acceso (check-ins) — lo que su sistema actual NO hace
- Cada entrada por QR / huella / facial crea un registro `checkins` (cliente, sucursal, hora entrada, hora salida, método).
- **Historial COMPLETO consultable por cualquier fecha/rango** (hoy, ayer, el mes pasado — sin límite), filtrable por cliente y sucursal, exportable a Excel.
- Panel en vivo: "**¿Quiénes están adentro ahora?**" (entraron y no han salido) + contador de aforo.
- Validación en la puerta: el lector consulta la base → membresía activa y no suspendida → abre. Si el admin "quita el acceso" a un cliente, la puerta lo rechaza al instante.

## 8. Promociones y eventos
- Crear promo: nombre, descuento (% o $), planes/productos a los que aplica, vigencia, sucursales.
- Al cobrar, la cajera aplica la promo activa (queda registrada en la venta).
- **Anuncios en la app**: la promo/evento puede publicarse para que TODOS los miembros la vean en su inicio (banner), reutilizando el mecanismo del "consejo del día" pero a nivel gimnasio.

## 9. Reportes y gráficas
- Dashboard con: ingresos del día/semana/mes, membresías vendidas, asistencia (check-ins), clientes nuevos, comparativo entre las 3 sucursales.
- Gráficas: ventas por día (barras), asistencia por hora (para saber horas pico), retención (clientes que renuevan vs no), productos más vendidos.
- Suscripciones vendidas por cajera (para comisiones/metas).
- Todo exportable a Excel/CSV.

## 10. WhatsApp
- Fase 1 (sin costo): botón WhatsApp en cada ficha → abre chat con mensaje pre-escrito (plantillas: bienvenida, "tu membresía vence en 3 días", "te extrañamos, hace 2 semanas que no vienes"). Lista automática de clientes inactivos y por vencer para trabajarlos uno a uno.
- Fase 2 (opcional, tiene costo): mensajes masivos automáticos via WhatsApp Business API (Twilio/Meta) — requiere cuenta verificada de Meta y se cobra por mensaje. Lo dejamos preparado pero se decide después.

## 11. Modo sin internet
- Las operaciones críticas (ventas, check-ins manuales, abrir/cerrar turno) se guardan en una cola local del navegador si no hay conexión.
- Al volver el internet: sincronización automática a Supabase en orden, con marcado de "sincronizado". Indicador visible de estado (verde en línea / ámbar pendientes de sincronizar).

## 12. Tablas nuevas / cambios en Supabase (requieren acceso al panel SQL)
```sql
-- Nuevas
CREATE TABLE branches (id uuid PK, name text, address text, phone text);
CREATE TABLE customers (id uuid PK, branch_id, full_name, phone, email, photo_url, profile_id uuid NULL REFERENCES profiles, family_id uuid NULL, notes, created_at);
CREATE TABLE families (id uuid PK, name text, payer_customer_id uuid, discount_pct numeric);
CREATE TABLE cash_shifts (id, branch_id, staff_id, opened_at, closed_at, opening_cash, expected_cash, counted_cash, fx_rate);
CREATE TABLE cash_movements (id, shift_id, type in/out, amount, reason, created_at);
CREATE TABLE products (id, branch-agnostic info) + stock (branch_id, product_id, qty) + stock_moves;
CREATE TABLE promotions (id, name, discount, applies_to, starts_at, ends_at, branch_ids);
CREATE TABLE announcements (id, title, body, image, active, branch_ids); -- banners en la app
CREATE TABLE messages (...);            -- pendiente de la app (chat futuro)
-- Cambios
ALTER TABLE programs ADD COLUMN training_days text, ADD COLUMN duration_minutes int;
ALTER TABLE coach_diets ADD CONSTRAINT uq UNIQUE (coach_id, member_id);
ALTER TABLE subscriptions ADD COLUMN branch_id, sold_by (staff), plan snapshot price, family_id;
ALTER TABLE checkins ADD COLUMN checked_out_at, method (qr/huella/facial), branch_id;
-- plans: agregar duration_days, is_family, max_members, multi_branch
```
> ⚠️ Para crear esto necesito o el **SQL Editor del panel de Supabase** (Armando lo corre pegando el script que yo le pase) o una **service key**. La anon key no puede crear tablas.

## 13. Fases de construcción propuestas
1. **Base**: entrada "Solo personal", login staff, roles, selector de sucursal, layout desktop con sidebar.
2. **Caja**: turnos (abrir/cerrar/arqueo/movimientos), ventas de mostrador, corte + export Excel + correo al dueño.
3. **Clientes y membresías**: fichas, vincular app por QR, catálogo de planes, venta con acumulación de días, familias.
4. **Accesos**: check-ins con historial completo, panel "quién está adentro", suspensión de acceso.
5. **Inventario** + **Promociones/anuncios**.
6. **Reportes y gráficas** + suscripciones por cajera.
7. **WhatsApp (fase 1)** + **modo offline** + pulido.

## 14. Preguntas abiertas para el dueño
- Precios reales de cada plan (y el % del descuento familiar).
- ¿Dólares se aceptan? (el POS de Lavapower tenía tipo de cambio).
- Marca/modelo de: lector QR de puerta, lector de huella, cámara facial, báscula (para las integraciones).
- Correo del dueño para el reporte diario.
- ¿Las 3 sucursales comparten precios o cada una tiene los suyos?
