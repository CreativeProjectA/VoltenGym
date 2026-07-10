// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Puente de hardware (facial AI07F + torniquete ZKTeco)
//  Corre en la PC de recepción de CADA sucursal (Node.js). Recibe los
//  eventos de acceso del dispositivo físico y los sube a Supabase.
//
//  ESTADO: esqueleto listo para conectar en cuanto el equipo esté
//  físicamente instalado — falta confirmar contra la pantalla de
//  configuración del dispositivo real cuál protocolo usa exactamente
//  (ver notas abajo). El torniquete SÍ es marca ZKTeco confirmada, así
//  que casi seguro usa el protocolo "push" estándar de ZKTeco (ADMS),
//  que es el que está implementado aquí. El facial AI07F es un
//  fabricante genérico — puede que también hable ZKTeco (muy común en
//  esta clase de terminales chinos), o puede tener su propio webhook
//  configurable en su menú de red — eso se confirma con el equipo
//  en mano.
//
//  CÓMO USARLO (cuando el hardware esté conectado):
//   1. npm install express node-fetch
//   2. node bridge.js
//   3. En la configuración de red del dispositivo (facial y/o
//      torniquete), busca "ADMS" / "Cloud Server" / "Push server" y
//      apunta la IP:PUERTO de esta PC (ej. 192.168.1.50:4370).
//   4. Ajusta BRANCH_ID abajo según la sucursal donde está esta PC.
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2

const SB_URL = process.env.SB_URL || 'https://mopyslyhjtnmvlksusjr.supabase.co';
const SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'PEGA_AQUI_LA_SERVICE_KEY';
// Sucursal donde corre ESTE puente (una PC por sucursal, cada una con su propio BRANCH_ID).
const BRANCH_ID = process.env.BRANCH_ID || 'PEGA_AQUI_EL_ID_DE_LA_SUCURSAL';

const app = express();
app.use(express.text({ type: '*/*', limit: '5mb' })); // ZKTeco manda texto plano, no JSON

// Mapa local: número de empleado/huella/rostro del dispositivo → cliente real en Supabase.
// Se llena consultando customers.fingerprint_id / customers.face_id (ya existen esas
// columnas — se le asignan al cliente desde su ficha en el POS).
async function findCustomerByDeviceId(deviceUserId) {
  const r = await fetch(
    SB_URL + '/rest/v1/customers?or=(fingerprint_id.eq.' + deviceUserId + ',face_id.eq.' + deviceUserId + ')&select=id,profile_id,full_name&limit=1',
    { headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY } }
  );
  const rows = await r.json();
  return rows && rows[0];
}

// El torniquete TAMBIÉN trae su propio lector de QR (pasas el teléfono por
// encima). Ese código es el mismo QR que ya usa la app del cliente:
// "volten-gym:member:<uuid-completo>" — el lector manda el texto completo
// que lee de la pantalla, así que se busca por coincidencia exacta.
const QR_PREFIX = 'volten-gym:member:';
async function findCustomerByQr(raw) {
  let code = String(raw || '').trim();
  if (code.toLowerCase().startsWith(QR_PREFIX)) code = code.slice(QR_PREFIX.length);
  if (!code) return null;
  const r = await fetch(
    SB_URL + '/rest/v1/customers?or=(id.eq.' + code + ',profile_id.eq.' + code + ')&select=id,profile_id,full_name&limit=1',
    { headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY } }
  );
  const rows = await r.json();
  return rows && rows[0];
}

async function registerCheckin(customer) {
  // Mismo comportamiento que el POS: si ya está adentro, esto es su salida.
  const openRes = await fetch(
    SB_URL + '/rest/v1/checkins?customer_id=eq.' + customer.id + '&checked_out_at=is.null&granted=eq.true&order=created_at.desc&limit=1',
    { headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY } }
  );
  const open = await openRes.json();
  if (open && open[0]) {
    await fetch(SB_URL + '/rest/v1/checkins?id=eq.' + open[0].id, {
      method: 'PATCH',
      headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked_out_at: new Date().toISOString() }),
    });
    console.log('SALIDA registrada:', customer.full_name);
    return;
  }
  // Validación de membresía (misma regla que el POS: solo vale en ESTA sucursal)
  const subRes = await fetch(
    SB_URL + '/rest/v1/subscriptions?customer_id=eq.' + customer.id + '&branch_id=eq.' + BRANCH_ID + '&status=neq.canceled&order=end_date.desc&limit=1',
    { headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY } }
  );
  const subs = await subRes.json();
  const sub = subs && subs[0];
  const granted = !!(sub && new Date(sub.end_date + 'T23:59:59') >= new Date());
  await fetch(SB_URL + '/rest/v1/checkins', {
    method: 'POST',
    headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: customer.id, member_id: customer.profile_id || null, branch_id: BRANCH_ID,
      method: 'facial', granted, created_at: new Date().toISOString(), checked_in_at: new Date().toISOString(),
    }),
  });
  console.log((granted ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO') + ':', customer.full_name);
}

// ── Protocolo push de ZKTeco (ADMS) — el dispositivo llama esto solo ──
// Handshake inicial del dispositivo
app.get('/iclock/cdata', (req, res) => res.send('GET OPTION FROM: ' + req.query.SN + '\nATTLOGStamp=None\nOPERLOGStamp=9999\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=None'));
// El dispositivo sube aquí los registros de asistencia reales (texto: userId\ttimestamp\t...)
// Un mismo dato (huella, cara, o el QR leído por el lector del torniquete)
// llega en el mismo campo — se prueban los 3 caminos, el que aplique gana.
app.post('/iclock/cdata', async (req, res) => {
  try {
    const lines = String(req.body || '').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const fields = line.split('\t');
      const deviceUserId = fields[0];
      if (!deviceUserId) continue;
      // El protocolo ZKTeco manda un campo "Verify" (modo de verificación)
      // que casi siempre es la 4ª columna: 1=huella, 15=cara, 2=tarjeta/QR.
      // Esto es lo típico de esta familia de protocolos — se confirma y
      // ajusta con el equipo real en mano si el AI07F manda otros números.
      const verifyCode = fields[3];
      const kind = verifyCode === '15' ? 'rostro' : (verifyCode === '2' ? 'qr' : 'huella');
      const customer = (await findCustomerByDeviceId(deviceUserId)) || (await findCustomerByQr(deviceUserId));
      if (customer) { await registerCheckin(customer); continue; }
      // Huella/cara nueva que el aparato detectó pero nadie ha vinculado
      // todavía — se anota para que la encargada la asigne con un clic
      // desde el POS (Accesos → "Registros nuevos del aparato"), sin
      // tener que leer el número en la pantallita del aparato.
      console.log('Sin cliente vinculado — anotado como pendiente:', deviceUserId, kind);
      try {
        const exists = await fetch(
          SB_URL + '/rest/v1/device_enrollments?device_user_id=eq.' + encodeURIComponent(deviceUserId) + '&branch_id=eq.' + BRANCH_ID + '&assigned_to=is.null&limit=1',
          { headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY } }
        );
        const rows = await exists.json();
        if (!rows || !rows.length) {
          await fetch(SB_URL + '/rest/v1/device_enrollments', {
            method: 'POST',
            headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch_id: BRANCH_ID, device_user_id: deviceUserId, kind }),
          });
        }
      } catch (_) { /* si falta pos_migration12.sql, no rompe el resto */ }
    }
    res.send('OK');
  } catch (e) { console.error(e); res.status(500).send('error'); }
});
app.get('/iclock/getrequest', (req, res) => res.send('OK')); // heartbeat del dispositivo

app.listen(4370, () => console.log('Puente Volten Gym escuchando en el puerto 4370 — sucursal', BRANCH_ID));
