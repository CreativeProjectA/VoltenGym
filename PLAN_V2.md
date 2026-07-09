# VOLTEN GYM — Plan V2 (post-junta con el dueño)
> Fecha: 2026-07-09. Este archivo es el "cerebro" del trabajo pendiente.
> Regla: NO se rompe nada de lo que ya funciona. Cada fase se prueba antes de pasar a la siguiente.

---

## FASE 1 — Bugs críticos (primero, porque ya están en producción)

1. **Cierre de turno definitivo.** Bug: al cerrar turno y cerrar con la tachita el diálogo de "copiar corte", el turno queda cerrado en el historial pero la sesión sigue viva y puede vender. Fix: en cuanto se confirma el arqueo (se captura el efectivo contado), el cierre es irreversible → se guarda, se muestra el corte y se regresa a la pantalla de "Iniciar turno". Ninguna venta posible con turno cerrado (candado en `finishSale`: si `shift.status!=='open'` en base, bloquear).
2. **Toggle Barras/Círculo no hace nada.** Las mini-gráficas se renderizan en `after_reports` pero el toggle re-llama `go('reports')` y el re-render no vuelve a pintar con datos guardados. Fix: repintar desde `this._miniData` sin recargar datos.
3. **Gráficas con vida.** Paleta por métrica (azules, naranja, verde, morado — sobrio, no arcoíris) + leyendas/etiquetas para que se ENTIENDAN (qué es cada barra, fechas en el eje).
4. **Racha rompió el inicio de la app.** El calendario lunes-domingo empuja el layout y ya no se ven tiempo/minutos entrenados (scroll roto). Fix de layout.
5. **Sucursal del coach mal.** Coach creado en Tres Cantos muestra "Gómez Morín". La app debe LEER la sucursal desde `staff_branches` (coach) / `member_profiles.branch_id` (miembro) — solo lectura, sin "toca para cambiar".
6. **Fotos corrompidas** en anuncios/promos dentro de la app.

## FASE 2 — Reglas de negocio del POS

7. **Sucursales 100% independientes.** Precios de planes POR sucursal (ya existe `branch_id` en plans; falta que el POS lo aplique en todo). Reportes/gráficas/empleados por sucursal (ya filtran — verificar cada pantalla).
8. **Membresía solo vale en SU sucursal.** Acceso en otra sucursal → RECHAZADO con mensaje "Membresía de Gómez Morín — no válida aquí". 
9. **Cambio de sucursal = reset.** Botón en la ficha del cliente (POS): quita membresía activa y coach, cambia branch_id → empieza de cero en la nueva.
10. **Coach por tiempo (semana o mes).** Al cobrar coach se elige duración → `coach_until`. Vencido → desaparece de la app del cliente y de "Mis atletas" del coach. Requiere migración: `member_profiles.coach_until date` + `customers.coach_until date`.
11. **Membresía vencida = no entra** (ya funciona en Accesos; se re-verifica + el facial/torniquete usarán la misma regla).
12. **Cliente nuevo — campos OBLIGATORIOS:** nombre completo (mínimo 1 nombre + 2 apellidos = 3 palabras), teléfono, correo, género (H/M). Opcionales: dirección, fecha de nacimiento (para cumpleaños). Sin eso NO avanza. Venta rápida (solo un agua) sigue sin pedir datos.
13. **Efectivo: capturar "recibido" obligatorio** antes de poder cobrar.
14. **Fondo fijo $400.** Ya no se captura al abrir turno. Al iniciar, la cajera CONFIRMA que hay $400; si no, botón "Reportar faltante" → queda registrado y el admin lo ve (mensaje/alerta en su vista).
15. **Días de cortesía:** requiere datos completos, máximo 1 cortesía por persona (se valida por teléfono/correo), al usarla no puede volver a entrar gratis, y sale marcada en el corte/reporte del turno.
16. **Permisos de cajera:** Inventario solo LECTURA (ve productos, no crea/edita/ajusta stock). Membresías: catálogo de planes solo lectura. (Solo admin/encargado editan.)
17. **Login offline del POS.** Si no hay internet, entrar con la última sesión cacheada (credenciales verificadas localmente con hash) → trabaja con cola offline y sincroniza al volver.
18. **Tarjeta de regalo.** Producto especial con código y saldo; se vende en POS, se redime en otra venta.

## FASE 3 — Cuenta de app automática

19. **Al pagar membresía → cuenta de app automática.** El POS crea la cuenta (correo del cliente + contraseña temporal) y se le envía por correo. Ya NADIE "enlaza app" manualmente → se quita "Enlazar app" de Accesos y de la ficha.
    - Necesita **service key** de Supabase (edge function `create-member`) — la key actual del .env es placeholder.
    - Correo: edge function con **Resend** (gratis 100/día) o mostrar credenciales en pantalla + botón WhatsApp (fase 1 sin API).
20. **App solo con membresía activa.** Sin membresía activa no inicia sesión (mensaje: "Tu membresía venció — renuévala en recepción o desde la app"). El que paga membresía tiene la app gratis. *(Cobrar la app por separado a no-miembros: DECISIÓN PENDIENTE del dueño — precio; recomendación: dejarlo cerrado a miembros por ahora.)*

## FASE 4 — Stripe (pagos desde la app)

21. **Stripe Checkout** para membresía y coach desde la app: edge functions `stripe-checkout` (crea la sesión con el precio de SU sucursal) + `stripe-webhook` (confirma pago → crea/extiende subscription, asigna coach con vigencia, registra la venta con `payment_method:'stripe'` para reportes).
    - Armando: crear cuenta en stripe.com → pasarme **publishable key** y **secret key** (modo test primero), luego verificación de la cuenta con datos del gym para cobrar en vivo (eso tarda 1-2 días de Stripe, no depende de nosotros).

## FASE 5 — App (experiencia)

22. **Racha por días de entrenamiento.** Si tu plan tiene N días/semana (ej. lun-jue-vie = 3), mantienes racha cumpliendo tus N entrenos esa semana — hacerlos otro día NO la rompe (fuiste miércoles en vez de jueves = cuenta). La racha sube por semana cumplida.
23. **Notificaciones.** (a) In-app: campana con diseño Volten (naranja/negro, no genérico) — avisos de: pago recibido, coach asignado, dieta nueva, membresía por vencer, promo nueva. (b) Push reales (pantalla apagada): Web Push con VAPID — funciona en Android instalada; en iPhone requiere PWA instalada (iOS 16.4+). Se implementa con edge function + tabla de suscripciones push.
24. **Biblioteca GLOBAL de ejercicios con video.** Tabla `exercises` + Storage: admin (y coaches) suben ejercicio con foto/video del entrenador haciéndolo. En la rutina del cliente sale botón ▶ video. Los ejercicios del catálogo salen para todos.
25. **Cumpleaños.** Con fecha de nacimiento: el POS avisa "Mañana cumple años X" → botón WhatsApp con imagen predeterminada (el dueño la pasa; se puede cambiar desde el POS).
26. **Ficha del cliente con gráficas:** % de asistencia (visitas vs días de plan), historial de pagos en línea de tiempo, membresías con gráfica.
27. **Más analytics para el dueño:** horas pico (asistencia por hora), hombres vs mujeres (ya con género obligatorio), comparativo entre sucursales, y que el TIPO de gráfica sea seleccionable por cada una (barras/círculo/línea).
28. **Logos reales** de la marca en POS y app (Armando pasa el logo bueno en PNG/SVG alta calidad).

## FASE 6 — Hardware (cuando estén los equipos físicos)

29. **Facial AI07F (WiFi, AI Face Identification)** — 1 por sucursal — y **torniquete ZKTeco**: se hace un **puente local** (programa Node corriendo en la PC de recepción) que recibe los eventos del dispositivo y los sube a `checkins` (entrada Y salida — el facial en la salida resuelve el "¿quién salió?"). ZKTeco tiene SDK/protocolo conocido (push HTTP). Necesito: modelo exacto y manual/hoja técnica de ambos (foto de la caja sirve).
30. **Salida sin hardware (mientras):** auto-checkout al cierre del día + botón "Marcar salida" en Accesos (ya existe checked_out). El coach ve "terminó su entrenamiento" cuando el cliente finaliza sesión en la app.
31. **Báscula FitMe Wise:** ecosistema cerrado (solo su app) — probablemente NO integrable directo. Alternativas: captura manual del peso en la app (ya existe) o báscula Bluetooth abierta compatible. Se investiga con el modelo exacto.

---

## Lo que NECESITO de Armando (en orden de urgencia)
1. **Service key de Supabase** regenerada (Dashboard → Settings → API) — para cuentas automáticas y edge functions. Pásamela y la guardo SOLO en .env (nunca al repo).
2. **Cuenta de Stripe** creada + keys de test (pk_test_… y sk_test_…).
3. **Logo oficial** en buena calidad (PNG o SVG).
4. **Precios reales por sucursal** de cada plan (tabla: plan × sucursal).
5. **Imagen de cumpleaños** (o la suben después).
6. **Modelo exacto + manual** del facial AI07F y del torniquete ZKTeco.
7. **Decisión:** ¿app de paga para no-miembros? (recomendación: por ahora solo miembros).
8. Cuenta en **resend.com** (gratis) para los correos de credenciales — o empezamos con WhatsApp manual.

## Tiempos realistas
- Fases 1–2: **1-2 días** de trabajo.
- Fase 3: **1 día** (con service key en mano).
- Fase 4 (Stripe): **1 día** de código; cobros en vivo dependen de la verificación de Stripe (1-2 días de ellos).
- Fase 5: **1-2 días**.
- Fase 6: cuando estén los equipos en el gym (el puente se escribe en 1-2 días con el manual en mano).
> Total software: ~4-6 días de sesiones. Decirle al dueño "2 semanas" nos da colchón; en 3 días queda el CORE (fases 1-3) si las keys llegan hoy.

## Pendientes que ya quedaron de la sesión anterior (van dentro de Fase 1-2)
- Colores de gráficas + membresía por sucursal + coach con vigencia (quedó a medias cuando se acabaron los tokens).
- Prueba end-to-end: cuenta coach de demo, dieta coach→cliente verificada, ejercicios ★ Míos.

---

## ESTADO REAL AL 2026-07-09 (noche) — qué está hecho y qué falta

### ✅ Terminado y verificado en vivo
- Fase 1 completa (bugs críticos).
- Fase 2 completa (reglas de sucursal exclusiva, coach con vigencia, campos obligatorios, efectivo obligatorio, fondo $400, cortesías, login offline).
- Fase 3 completa y PROBADA end-to-end (cuenta de app automática al pagar, gate de membresía activa).
- Racha por cuota semanal (no por día exacto).
- Biblioteca de ejercicios con video (POS sube, cliente ve botón ▶).
- Notificaciones in-app reales (membresía/dieta/coach/anuncios, no genéricas).
- Sesión de entreno con duo de cards estilo home (tiempo + siguiente ejercicio).
- Gráfica Hombres vs Mujeres en Reportes.
- Cierre automático de accesos al cerrar turno + estimado inteligente de "adentro ahora" (3h genérico, o la hora de salida programada si es personal).
- Horario de entrada/salida programable para coach/encargados (pos_migration9.sql).
- Ficha del cliente con gráficas: asistencia por semana + línea de tiempo de pagos.

### ✅ Fase 4 (Stripe) — HECHA en modo test
- Edge functions stripe-checkout + stripe-webhook desplegadas y probadas (creación de sesión de pago confirmada en vivo).
- Botón "💳 Pagar con tarjeta" en cada plan de membresía y en el selector de coach dentro de la app.
- El webhook acumula días igual que el POS y asigna coach con vigencia igual que el POS.
- FALTA: que el dueño del gym (no Armando) active su cuenta de Stripe con RFC/CLABE reales para pasar a modo live — es un trámite de ellos con Stripe, no depende de código. Cuando lo hagan, solo se cambian las 2 llaves de test por las de producción.

### ⏳ Pendiente — Fase 5 (resto)
- **Push notifications reales** (que lleguen con la app cerrada/pantalla apagada) — requiere VAPID keys + service worker con push listener. Lo que ya existe es el centro de notificaciones DENTRO de la app, no push del sistema operativo.
- **Cumpleaños automático por WhatsApp** — falta: capturar fecha de nacimiento ya se puede (customers.birth_date existe), falta la vista en el POS que avise "mañana cumple X" + botón WhatsApp con imagen.
- **Tarjeta de regalo** — no iniciado.
- **Analíticas de horas pico ya existen**; falta comparativo entre sucursales lado a lado en una sola vista (hoy se ve una sucursal a la vez con el selector).

### ⏳ Pendiente — Fase 6 (Stripe real + Hardware)
- Activar cuenta de Stripe con datos del dueño del gym (no de Armando) — trámite de ellos.
- **Puente de hardware YA ESCRITO** en [hardware-bridge/bridge.js](hardware-bridge/bridge.js) + [README](hardware-bridge/README.md) — implementa el protocolo estándar ZKTeco (push/ADMS), listo para correr en la PC de recepción de cada sucursal. FALTA: probarlo con el equipo físico real conectado (no se puede simular sin el hardware) — el torniquete es ZKTeco confirmado así que debería funcionar directo; el facial AI07F puede necesitar ajustes menores si su protocolo difiere.
- Báscula FitMe Wise: confirmado que es un sistema cerrado, no se integra — se mantiene la captura manual de peso ya existente en la app.

### Otros pendientes menores (no estaban en las 6 fases originales pero salieron en el camino)
- Logos reales de la marca en POS y app (Armando debe pasar el archivo en buena calidad).
- Comprimir más las fotos del bundle de la app si sigue creciendo de tamaño.
- Reporte comparativo entre sucursales en una sola pantalla (hoy es una a la vez).
