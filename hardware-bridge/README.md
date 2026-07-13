# Puente de hardware — Volten Gym

Esto conecta el facial AI07F y el torniquete ZKTeco con el sistema, SIN
necesitar internet en el dispositivo (solo necesita ver esta PC en la
red local del gym).

## Bloqueo automático de vencidos (nuevo)

El puente ya no solo registra accesos: **mantiene la lista de usuarios
del aparato sincronizada con las membresías**. Cada minuto revisa:

- Membresía **vencida** o cliente **suspendido** → le manda al aparato la
  orden de **borrarlo de su memoria** → su cara/huella deja de abrir.
- **Renueva** → lo vuelve a dar de alta en el aparato con el mismo código.
  Ojo: el aparato borró su plantilla de cara/huella, así que el cliente
  debe **registrarla de nuevo una sola vez** en el dispositivo.
- El **personal** (coaches, cajeras, encargadas, admin) nunca se borra.

Probado end-to-end con un dispositivo simulado (protocolo ZKTeco push):
vencido → `DATA DELETE USERINFO`, renovado → `DATA UPDATE USERINFO`,
acceso con cara → registrado. El formato exacto de comandos se confirma
con el aparato físico el día de la instalación (la consola del puente
muestra "Resultado de comando #N: OK/ERROR" para verificarlo en vivo).

El estado de sincronización vive en `estado_sync.json` junto al puente
(sobrevive reinicios de la PC).

## Qué es

Un programa chiquito (`bridge.js`) que corre en la computadora de
recepción de cada sucursal. El dispositivo (facial o torniquete) le
manda sus eventos de acceso a esta PC, y esta PC los sube a la base de
datos — exactamente igual que si alguien lo hubiera tecleado en el POS.

## Qué falta para activarlo (cuando tengan el equipo instalado)

1. **Conectar el dispositivo a la red del gym** (por cable o WiFi,
   según lo que traiga).
2. **Entrar a su configuración** (normalmente desde una pantalla táctil
   en el mismo aparato, o una app/página de configuración que traiga).
   Buscar una opción como "Servidor", "ADMS", "Cloud", "Push Server" —
   ahí se le pone la IP de la PC de recepción y el puerto `4370`.
3. **Vincular cada cliente con su huella/cara** (huella y facial): cuando
   alguien registra su huella o cara en el dispositivo, éste le asigna
   un número interno (ID de usuario). Ese número hay que guardarlo en
   su ficha del POS (ya existen los campos "Huella dactilar" y
   "Reconocimiento facial" en la ficha del cliente — ahí se captura ese
   número).
   **El lector de QR del torniquete NO necesita este paso** — lee
   directo el mismo código QR que ya trae la app del cliente, así que
   funciona solo en cuanto el puente esté corriendo.
4. Correr el puente en esa PC:
   ```
   npm install express node-fetch@2
   set SB_SERVICE_KEY=... (la service key de Supabase)
   set BRANCH_ID=... (el id de esa sucursal en la tabla branches)
   node bridge.js
   ```
   Para que corra siempre (aunque reinicien la PC), se puede dejar
   como tarea programada de Windows o usar `pm2`.

## Nota honesta

El código de `bridge.js` está armado para el protocolo estándar de
ZKTeco ("push"/ADMS) — es el más común en este tipo de dispositivos y
el torniquete SÍ es ZKTeco confirmado. El facial AI07F es de un
fabricante genérico; puede que hable el mismo protocolo (muy probable,
es una plataforma compartida entre muchas marcas chinas) o puede traer
su propio formato. **Esto se termina de ajustar con el equipo físico
en la mano** — en cuanto Armando lo tenga conectado, se prueba en vivo
y se corrige lo que haga falta (no se puede simular sin el hardware
real).

Si el AI07F resulta tener un formato distinto, lo más probable es que
solo haya que cambiar la forma en que se leen los datos en la ruta
`/iclock/cdata` (lo demás — validar membresía, registrar entrada/salida
— no cambia).
