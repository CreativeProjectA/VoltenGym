# Volten Gym — Reglas del Proyecto

Documento maestro. Todo cambio de diseño, función o base de datos debe respetar lo definido aquí. Si algo no está aquí, se agrega aquí antes de implementarse.

---

## 0. Visión general — 3 pilares del proyecto

El proyecto completo son **tres sistemas conectados a la misma base de datos** (un solo Supabase, no sistemas separados):

1. **App web (miembros + coaches)** — lo que ya estamos construyendo: onboarding, programas, progreso, elegir/contratar entrenador, perfil.
2. **Punto de venta (POS)** — para el staff/recepción del gym: clientes, membresías, cobros, productos de tienda (suplementos, accesorios, día de visita), corte de caja, reportes. Armando ya tiene experiencia previa construyendo un POS (Lavapower), así que reutilizamos esos aprendizajes de UX/flujo de caja donde aplique.
3. **Control de acceso / entradas** — registro de entrada al gym por **QR, huella digital o reconocimiento facial** (este último: confirmado que lo van a implementar). Cada entrada queda guardada con fecha/hora/método, y debe poder bloquear el acceso si la membresía está vencida.

Los tres pilares comparten: usuarios (`profiles`), estado de suscripción, y reportes. Por eso todo vive en el mismo proyecto Supabase con RLS, no en bases de datos separadas.

---

## 0.5 DESIGN MANIFESTO — Ley máxima del proyecto

Esta app NO es un dashboard. Es una experiencia emocional de fitness.

Referencia principal: **Nike Training Club + Apple Fitness+ + WHOOP + Apple Health**.

### Reglas absolutas
- **Colores**: solo Blanco (#FFFFFF), Negro (#0A0A0A), Naranja (#F97316). Sin verde, azul, morado.
- **Fotografía**: es la interfaz. Más importante que iconos y tarjetas. Todo sección importante tiene foto atlética edge-to-edge.
- **Tipografía**: títulos enormes (48–64px), peso 800, espaciado Apple. Nunca labels pequeños y apretados.
- **Espaciado**: todo respira. Menos bordes. Más whitespace. Sensación flotante.
- **Test final antes de publicar**: ¿se vería esto en Nike Training Club? ¿Apple aprobaría este layout?

## 1. Diseño base (NO se puede romper)

Origen: diseño hecho en Claude Design (artifact), archivo base: [Volten Gym App (1).html](Volten%20Gym%20App%20(1).html). Fuente editable: [extracted_template.txt](extracted_template.txt).

### Colores
| Uso | Color |
|---|---|
| Acento / marca (naranja) | `#F97316` (hover/dark: `#EA580C`) |
| Fondo oscuro (onboarding, auth) | `#0D0D0D` |
| Texto / superficie negra | `#0A0A0A` |
| Fondo claro app (home, etc.) | `#F5F5F5` |
| Blanco | `#FFFFFF` |
| Gris texto secundario | `#9CA3AF` |
| Overlays sobre imagen | `rgba(0,0,0,0.1 → 0.92)` gradientes |
| Inputs sobre oscuro | `rgba(255,255,255,0.07)` fondo, borde `rgba(255,255,255,0.1)` |

### Tipografía
- Familia: **Plus Jakarta Sans** (Google Fonts, cargada vía `@font-face` woff2, ya embebida en el bundle — ver `assets/`).
- Pesos usados: 400, 500, 600, 700, 800.
- Títulos grandes: 36–46px, weight 800, `letter-spacing:-0.025em` a `-0.03em`.
- Botones primarios: 15–16px, weight 700.
- Labels/eyebrows: 10–12px, weight 600–700, uppercase, `letter-spacing:0.08–0.12em`.

### Forma / espaciado
- Border-radius estándar: 12px (inputs/botones chicos), 16px (botones grandes/cards), 20px (cards grandes de imagen).
- Botón primario: fondo `#F97316`, texto blanco, sin borde, `box-shadow` naranja translúcido.
- Botón secundario/pill: fondo `rgba(255,255,255,0.1)`, `border-radius:100px`.
- Shell de app: `max-width:1280px`, centrado, `#F5F5F5` de fondo, bottom nav fija de 80px con 5 tabs (Inicio, Programas, Explorar, Progreso, Coach, Perfil — ojo: son 6 íconos en el nav actual).
- Animaciones: `slideUp`, `fadeIn`, `scaleIn` (ya definidas en el `<style>` del template).

### Regla de oro
Cualquier pantalla nueva reutiliza estos mismos valores (no inventar colores, radios ni tipografías nuevas). Si se necesita un color nuevo (ej. estados: éxito, error, advertencia), se agrega a esta tabla primero.

---

## 2. Arquitectura de la app (vistas/roles)

Tres tipos de usuario, **una sola tabla de cuentas**, diferenciados por `role`:

1. **member** (cliente del gym) — app que ya tenemos en onboarding.
2. **coach** (entrenador) — vista distinta, se le pide info extra al registrarse (especialidad, certificaciones, bio, foto).
3. **admin / staff del gym** (dueño/recepción) — usa el **POS** para gestionar membresías, pagos, suscripciones, altas/bajas.

### Flujo de registro
- En el paso "Soy miembro / Soy entrenador" (ya existe en el diseño, pantalla `s1Style`) se define el `role`.
- Si `role = coach`, después del registro se añade un paso adicional de onboarding: especialidad(es), años de experiencia, bio corta, certificaciones (opcional sube PDF/imagen), foto de perfil.
- Login con Google (OAuth) o con correo/contraseña — ambos ya están en el diseño (botón "Continuar con Google" + tabs Crear cuenta/Iniciar sesión).

### Vistas por rol
- **Member**: Home, Programas (explorar/asignados), Mi rutina activa, Progreso (racha, horas, fotos, peso/medidas), Favoritos, Perfil, Estado de suscripción.
- **Coach**: Dashboard de sus clientes, subir/crear programas y rutinas, asignar rutina a un cliente, ver progreso de cada cliente, calendario de sesiones, chat/notas (futuro).
- **Admin (POS)**: gestión de miembros, planes/suscripciones, cobros, check-in, reportes de ingresos, alta de coaches.

---

## 3. Funcionalidades (alcance)

- [ ] Auth: registro/login con email+password y Google OAuth.
- [ ] Perfiles: member y coach con campos distintos, foto de perfil.
- [ ] Programas/rutinas: coach crea programas (con ejercicios, series, reps, descanso, video/imagen); se pueden asignar a uno o varios members.
- [ ] Rutina propia: el member puede crear/editar su propia rutina si no tiene coach asignado.
- [ ] Favoritos: marcar programas/rutinas favoritas.
- [ ] Progreso: registro de entrenamientos completados, racha (streak) de días, horas entrenadas, fotos de progreso, peso/medidas opcionales.
- [ ] Categorías: catálogo de categorías de entrenamiento (fuerza, cardio, HIIT, movilidad, etc.) — ya hay referencias visuales en el diseño (íconos de objetivos: ganar músculo, perder grasa, salud, rendimiento).
- [ ] Notificaciones: recordatorios de entrenamiento, vencimiento de suscripción, mensajes del coach.
- [ ] Suscripciones / membresías: planes, vigencia, estado (activa/vencida/por vencer), bloqueo de funciones si está vencida.
- [ ] POS: cobro de membresías/planes, historial de pagos, altas y bajas, asignación de coach a member.
- [ ] Notificación de vencimiento dentro de la app web (banner / bloqueo parcial cuando la suscripción expira).
- [x] Elegir/contratar entrenador desde la app (pantalla de onboarding, pago en efectivo) — implementado con datos mock + lectura real de coaches registrados.

### Detalle Fase 1 — App de miembro (desglose actualizado)

- [x] Coach oculto en nav bar para cuentas de miembro.
- [x] "Comenzar entrenamiento" → checklist de ejercicios + cámara para grabar + guardar en workout_logs.
- [x] Campo de peso (kg) por ejercicio + botón Descanso + Finalizar ejercicio → guarda en exercise_logs.
- [x] Estadísticas reales (racha, entrenamientos, horas) desde workout_logs — ya no son números fijos.
- [x] Récords personales: tabla personal_records, UI para agregar/ver hasta 5 registros.
- [x] Dots de racha L/M/X/J/V/S/D en Inicio — reflejan días reales con entrenamiento.
- [x] "Entrenamiento de hoy" muestra el título real del programa (DB), ya no texto fijo.
- [x] Tiempo total: ahora se mide el tiempo real de la sesión (inicio→fin), no 45 min fijos.
- [x] Cerrar sesión / login nuevo limpia estadísticas y perfil anteriores (antes se quedaban pegados números de la cuenta previa).
- [x] Onboarding guarda de verdad objetivo/nivel/días en member_profiles (antes solo quedaba en memoria del navegador — esto rompía Perfil y los permisos de ver programas).

- [x] **Onboarding horario**: pregunta de horario (mañana/tarde/noche/flexible) + filtrar coaches por compatibilidad de horario.
- [x] **Peso y altura** en onboarding (opcionales) + "Medidas corporales" en Perfil editable con guardado automático.
- [x] **Mis programas** limpio: solo muestra programas asignados por coach; si no hay ninguno, muestra botones "Explorar" + "Crear el tuyo".
- [x] **Explorar**: categorías (Fuerza, Cardio, Movilidad, Bienestar) clickeables → panel de ejercicios reales de `exercise_catalog` (43 ejercicios sembrados, editables por coaches/admins).
- [x] **Perfil — Notificaciones**: toggles reales para recordatorio de entrenamiento y mensajes del coach.
- [x] **Perfil — Membresía**: conectado a tabla `subscriptions` — muestra plan activo/inactivo y fecha de vencimiento.
- [x] **Tab Programas**: muestra solo programas asignados por coach; sin asignaciones muestra estado vacío con botón Explorar.
- [x] **Actividad semanal genérica**: quitada de Progreso (era fake).
- [x] **Botón "Comenzar entrenamiento"**: checklist + cámara + peso por ejercicio + descanso + Finalizar → guarda en workout_logs/exercise_logs.
- [x] **Crear tu rutina**: editor completo (nombre, días, ejercicios con series/reps, guardar en programs table). Accesible desde "Crear el tuyo" en Mis Programas.

### Pendiente Fase 1 — buildable ahora
- [ ] **Explorar "Programas selectos"**: reemplazar "Glúteos de Acero" y "Full Body Express" hardcodeados con programas reales del catálogo de DB.
- [ ] **Progreso — historial de entrenamientos**: lista de últimas sesiones (fecha, duración, programa) leída de workout_logs.
- [ ] **QR de check-in del miembro**: generar código QR único por member (UUID del profile) visible en Perfil, para que recepción lo escanee al entrar al gym.
- [ ] **Dieta del coach**: pantalla donde el member ve la dieta que le asignó su coach (tabla `coach_diets` pendiente de crear).
- [ ] **Banner membresía vencida**: si subscription está expirada o no existe, mostrar aviso en Inicio.
- [ ] **Báscula inteligente**: conectar cuando el dueño confirme modelo/API del hardware (pendiente info).
- [ ] **Video de ejercicio**: mostrar video_url del ejercicio al abrirlo (campo ya existe en program_exercises, solo falta UI).

### Pendiente Fase 2 — requiere dashboard de coach
- [ ] **Dashboard de coach**: crear/asignar programas a clientes, subir dietas, ver quién está en el gym (check-in QR), progreso de clientes.
- [ ] **"Entrenamiento de hoy" por día de la semana**: el que el coach programó específicamente para hoy.
- [ ] **Coach sube contenido**: rutinas y dietas que el coach manda a sus clientes.
- [ ] **Notificación al coach** cuando tiene cliente nuevo.

### Pendiente Fase 3 — POS y control de acceso
- [ ] POS completo (carrito, cobro, corte de caja, reportes).
- [ ] Control de acceso: QR scan en recepción + integración biométrica/facial.
- [ ] Stripe: pago de membresía con tarjeta dentro de la app.

### POS (punto de venta) — nuevo pilar
- [ ] Catálogo de productos/servicios: membresías, día de visita, productos de tienda (suplementos, accesorios).
- [ ] Carrito de venta, cobro (efectivo/tarjeta), ticket/recibo.
- [ ] Apertura y corte de caja (turno de recepción: monto inicial, ventas del turno, monto final, diferencias).
- [ ] Alta de cliente desde el POS (puede no tener cuenta en la app todavía).
- [ ] Historial de ventas y reportes (por día, por producto, por recepcionista).
- [ ] Vincular venta de membresía → crea/renueva `subscriptions` automáticamente, reflejándose en la app del miembro al instante.

### Control de acceso / entradas
- [ ] Registro de entrada por **QR** (código único por miembro, escaneable en recepción).
- [ ] Registro de entrada por **huella digital** (lector biométrico — integración por definir según el hardware que compren).
- [ ] Registro de entrada por **reconocimiento facial** (confirmado, lo van a implementar — integración por definir según proveedor).
- [ ] Bloqueo de acceso si la membresía está vencida (mensaje claro en el punto de check-in).
- [ ] Historial de entradas por miembro (visible en su progreso: "racha"/asistencia ya tiene un hueco para esto en el diseño).
- [ ] Reporte de aforo / entradas por hora-día para el staff.

---

## 4. Stack técnico (propuesto)

- **Frontend**: el mismo motor de plantillas/runtime del diseño actual (`dc-runtime`, basado en React vía UMD) por ahora para mantener el diseño 1:1; evaluar migrar a React/Vite estándar cuando se necesite routing y estructura de proyecto real (recomendado a mediano plazo, porque el formato bundle no es apto para producción ni control de versiones cómodo).
- **Backend / Base de datos / Auth / Storage: Supabase** (confirmado, el usuario propuso "su post" = Supabase).
  - **Auth**: Supabase Auth (email/password + Google OAuth provider).
  - **DB**: Postgres (Supabase), con **RLS activado desde el día uno** en todas las tablas.
  - **Storage**: Supabase Storage para fotos de perfil, fotos de progreso, imágenes/videos de programas, certificaciones de coach.
- **POS**: módulo dentro del mismo proyecto Supabase (tablas de planes, pagos, suscripciones), no un sistema aparte — todo conectado a la misma DB para que el estado de suscripción se refleje en tiempo real en la app.

---

## 5. Modelo de datos (borrador inicial)

```
profiles
  id (uuid, FK -> auth.users.id, PK)
  role            text  check in ('member','coach','admin')
  full_name       text
  email           text
  avatar_url      text
  created_at      timestamptz

coach_profiles
  profile_id      uuid PK FK -> profiles.id
  bio             text
  specialties     text[]
  years_experience int
  certifications  jsonb        -- urls a storage

member_profiles
  profile_id      uuid PK FK -> profiles.id
  goal            text         -- ganar musculo / perder grasa / salud / rendimiento
  level           text         -- principiante / intermedio / avanzado
  training_days   text[]       -- ['lun','mie','vie']
  coach_id        uuid FK -> profiles.id (nullable)

categories
  id, name, icon

programs
  id
  coach_id        FK -> profiles.id (nullable si lo crea el member)
  title, description, category_id FK, cover_image_url
  level, duration_weeks
  created_at

program_exercises
  id, program_id FK, order_index
  name, sets, reps, rest_seconds, video_url, notes

program_assignments
  id, program_id FK, member_id FK, assigned_by FK, status, started_at

favorites
  id, member_id FK, program_id FK

workout_logs
  id, member_id FK, program_id FK (nullable)
  completed_at, duration_minutes

progress_entries
  id, member_id FK, date
  weight_kg, photo_url, notes

streaks (view o calculado)
  member_id, current_streak, longest_streak

plans                 -- catálogo de membresías
  id, name, price, duration_days, features jsonb

subscriptions
  id, member_id FK, plan_id FK
  status          text  -- active / expired / canceled
  start_date, end_date

payments
  id, subscription_id FK, amount, method, paid_at, recorded_by (admin/staff)

notifications
  id, profile_id FK, type, message, read, created_at

-- ── POS ──
products
  id, name, type           -- 'membership' | 'day_pass' | 'store_item'
  price, stock              -- stock null/ignorado si no es producto físico
  plan_id FK -> plans.id (nullable, solo si type='membership')

cash_registers              -- turnos de caja
  id, opened_by FK -> profiles.id, opened_at, opening_amount
  closed_by FK -> profiles.id (nullable), closed_at, closing_amount, notes

sales
  id, register_id FK -> cash_registers.id
  member_id FK -> profiles.id (nullable, puede ser cliente sin cuenta)
  total, payment_method      -- 'cash' | 'card' | 'transfer'
  sold_by FK -> profiles.id, created_at

sale_items
  id, sale_id FK, product_id FK, quantity, unit_price

-- ── Control de acceso ──
checkins
  id, member_id FK -> profiles.id
  method              text  -- 'qr' | 'fingerprint' | 'face'
  verified_by FK -> profiles.id (nullable, null si fue automático)
  granted             boolean  -- false si se le negó el acceso (membresía vencida)
  created_at
```

---

## 6. Seguridad — Row Level Security (RLS)

Reglas base a aplicar desde el inicio en Supabase:

- **RLS ON en todas las tablas**, sin excepción.
- `profiles`: cada usuario lee/edita solo su propia fila (`auth.uid() = id`); lectura pública limitada (nombre/avatar) opcional vía vista.
- `member_profiles` / `coach_profiles`: solo el dueño (`profile_id = auth.uid()`) puede editar; un coach puede **leer** los `member_profiles` de sus clientes asignados (`coach_id = auth.uid()`).
- `programs`: el coach dueño (`coach_id = auth.uid()`) tiene CRUD completo; members con `program_assignments` activa tienen solo lectura.
- `program_assignments`: visible para el member asignado y el coach que asignó.
- `favorites`, `workout_logs`, `progress_entries`: solo el propio member (`member_id = auth.uid()`); el coach asignado puede leer (no escribir) el progreso de sus clientes.
- `subscriptions`, `payments`, `plans`: solo `admin`/staff tienen INSERT/UPDATE; el member solo puede **leer** su propia suscripción (`member_id = auth.uid()`).
- `notifications`: cada usuario lee solo las suyas.
- Toda escritura sensible (pagos, asignación de coach, cambio de plan) pasa por el rol `admin` o por funciones de servidor (Edge Functions con `service_role`), nunca directo desde el cliente con datos de otros usuarios.
- Storage buckets: políticas equivalentes — fotos de perfil/progreso privadas por usuario; imágenes de programas públicas de solo lectura, escritura solo por el coach dueño.
- `products`, `cash_registers`, `sales`, `sale_items`: solo `admin`/staff tienen acceso (lectura y escritura) — un member nunca debe poder leer la caja o el catálogo interno de venta.
- `checkins`: el propio member puede **leer** su historial de entradas; solo `admin`/staff (o una Edge Function del lector biométrico/QR con `service_role`) puede **insertar**. El dispositivo de check-in nunca debe usar la llave del cliente final para escribir directo — pasa por una función de servidor que valida la membresía antes de marcar `granted`.

---

## 7. DO-LIST — trabajo pendiente (ordenado por impacto/dependencias)

### 🔴 Alta prioridad (base de todo lo demás)

1. **Onboarding: agregar pregunta de horario** — después de elegir días, preguntar en qué horario prefiere entrenar (Mañanas 6-12h / Tardes 12-18h / Noches 18-22h / Flexible). Guardar en `member_profiles.preferred_hours`.

2. **Coach-select: filtrar por horario** — en la pantalla de "Elige tu entrenador", mostrar primero los coaches que coinciden con el horario del member; los que no coinciden también aparecen pero marcados como "Horario distinto".

3. **Onboarding: peso y altura** — agregar paso antes del cuestionario o en Perfil, que pregunte peso (kg) y altura (cm). Guardar en `member_profiles`. Conectar con báscula inteligente en el futuro (pendiente de conocer el hardware/API de la báscula del gym).

4. **Home - Entrenamiento de hoy**: debe ser el programa que el coach asignó para el día de la semana actual (via `program_assignments`), no siempre Fuerza Total genérico.

5. **Home - Mis programas**: mostrar solo los programas del member (program_assignments activos). "Añadir programa" muestra SOLO los que el coach de ese member tiene disponibles en su catálogo.

6. **Dashboard de coach — pantalla nueva** (Fase 2 crítica):
   - Ver lista de clientes con sus datos (objetivo, nivel, peso, altura, horario).
   - Programar entrenamiento por cliente: seleccionar ejercicios, series, reps, peso inicial.
   - Progresión mensual: el coach puede subir el peso sugerido para el siguiente mes.
   - Enviar dieta: el coach sube/escribe la dieta del cliente.
   - Subir programas genéricos (visibles en Explorar para miembros sin entrenador).

7. **Home - Sección Dieta**: si el coach le mandó una dieta, aparece en Inicio debajo de "Entrenamiento de hoy" con un botón para verla completa.

### 🟡 Media prioridad

8. **Explorar: programas con contenido real y diferente** — cada categoría (Fuerza, Cardio, HIIT, Movilidad, Boxeo) con sus propios ejercicios sembrados en la DB reales y diferenciados. Actualmente todos muestran los mismos ejercicios de Fuerza Total.

9. **Explorar: "Crea tu rutina"** — editor para que el member construya su propia rutina: nombre, días, ejercicios con series/reps/peso, portada (fotos de stock del gym O foto que ellos suban).

10. **Explorar: portadas de foto** — repositorio de imágenes base (las que ya tenemos embebidas en el bundle: atletas, gym) que se pueden asignar a un programa propio como portada.

11. **Pantalla Programas (tab)**: mostrar lista de programas asignados/hechos por el member. Para cada uno: nombre, nivel, quién lo envió (coach o "Genérico"), cuántas semanas lleva (calculado desde `program_assignments.started_at`). Quitar texto "Sem 3/8" hardcoded — ✅ ya quitado.

12. **Agregar medidas (Perfil)**: formulario para registrar peso, grasa, medidas manualmente (mientras no llega la integración con la báscula).

13. **Notificaciones**: pantalla de preferencias de notificaciones (on/off por tipo: entrenamiento, racha, coach, membresía).

14. **Membresía (Perfil)**: pantalla que muestra el plan activo, fecha de vencimiento, historial de pagos.

### 🟢 Posterior / Fase 3+

15. **Integración báscula inteligente** — cuando el dueño confirme modelo/fabricante, evaluar si exporta vía Bluetooth, API web o CSV. Mapear: peso, grasa corporal, grasa visceral, agua, músculo → `progress_entries`.

16. **Coach notificado al tener cliente nuevo** — cuando el member selecciona un coach, el coach recibe notificación in-app (y eventualmente email/push) con los datos del member (objetivo, nivel, peso, horario).

17. **Pago con tarjeta en la app** — integración con Stripe para membresías mensuales recurrentes.

18. **POS + Control de acceso** — ya diseñado en schema (migrations 0003), construir UI.

---

## 8. Cronograma / roadmap general

Orden recomendado (cada fase depende de que la anterior esté funcional, no de que esté "perfecta"):

**Fase 1 — App de miembro (en curso)**
- [x] Auth (email + Google), onboarding completo, scroll/responsive estables.
- [x] Elegir entrenador (mock + lectura real).
- [ ] Programas/rutinas reales (que el coach suba, que el member vea asignado).
- [ ] Progreso real (racha, fotos, registro de entrenamientos) conectado a Supabase.

**Fase 2 — App de coach**
- [ ] Registro de coach con precio/horario/especialidad (formulario completo).
- [ ] Dashboard de coach: lista de clientes, subir programa, asignar a cliente.
- [ ] Coach ve progreso de sus clientes.

**Fase 3 — POS**
- [ ] Catálogo de productos + carrito + cobro.
- [ ] Apertura/corte de caja.
- [ ] Alta de cliente y venta de membresía desde POS (conecta con `subscriptions`).
- [ ] Reportes de venta.

**Fase 4 — Control de acceso**
- [ ] Generación de QR por miembro + pantalla de escaneo en recepción.
- [ ] Bloqueo automático por membresía vencida.
- [ ] Integración de huella (según hardware que se compre).
- [ ] Integración de reconocimiento facial (según proveedor que se elija).
- [ ] Historial de entradas visible en la app del miembro.

**Fase 5 — Pulido y lanzamiento**
- [ ] Notificaciones reales (vencimiento, mensajes de coach).
- [ ] Diseño responsive afinado en todas las pantallas (no solo onboarding/perfil).
- [ ] Migrar del bundle de Claude Design a un proyecto React/Vite estándar para producción real (recomendado antes de lanzar, ver sección 4).

---

## 8. Reglas de trabajo (cómo edito esto contigo)

1. Todo cambio visual se hace en [extracted_template.txt](extracted_template.txt) y se reconstruye con `node rebuild.js` → genera `app.html`.
2. Ningún cambio de color/fuente/radio fuera de la tabla de la sección 1 sin antes actualizar este documento.
3. Cambios de base de datos/RLS se documentan aquí (sección 5 y 6) antes o junto con la migración SQL real en Supabase.
4. Este archivo se mantiene actualizado: si agregamos una función nueva, se marca el checkbox en la sección 3.
