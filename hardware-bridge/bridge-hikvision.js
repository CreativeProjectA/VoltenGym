// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Puente de hardware para el Face ID HIKVISION
//  (DS-K1T344EBFWX-E1 o similar de la misma serie)
//
//  Esto es un ARCHIVO SEPARADO de bridge.js (el que ya sirve al AiFace
//  viejo). No toca ni depende de bridge.js — cero riesgo de romper lo
//  que ya funciona en las sucursales mientras se prueba este.
//
//  Diferencia clave con el AiFace: Hikvision es protocolo DOCUMENTADO
//  (ISAPI). El aparato manda sus eventos por HTTP POST (multipart) a
//  una URL que tú le configuras — no hay que adivinar el formato como
//  con el AiFace, viene en el manual del fabricante.
//
//  CÓMO USARLO (cuando el aparato esté en mano):
//   1. npm install express node-fetch@2
//   2. node bridge-hikvision.js
//   3. Conéctate a la IP del aparato desde un navegador, actívalo
//      (te pide poner una contraseña de administrador la primera vez).
//   4. En el aparato o en su página web: Configuración → Red →
//      Notificación de Eventos ("HTTP Listening" / "Event Notification")
//      → pon ahí: IP de ESTA PC, puerto 4372, protocolo HTTP.
//   5. Prueba pasando una cara/tarjeta y revisa hikvision_log.txt para
//      confirmar que sí está llegando el evento (por si el formato
//      exacto de este firmware necesita un ajuste fino).
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2
const fs = require('fs');
const path = require('path');

const SB_URL = process.env.SB_URL || 'https://mopyslyhjtnmvlksusjr.supabase.co';
const SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'PEGA_AQUI_LA_SERVICE_KEY';
const BRANCH_ID = process.env.BRANCH_ID || 'PEGA_AQUI_EL_ID_DE_LA_SUCURSAL';
const PUERTO = Number(process.env.PUERTO_HIKVISION) || 4372;

const H = { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY };
const HJ = Object.assign({}, H, { 'Content-Type': 'application/json' });

// ── GRABADOR de diagnóstico (igual que en bridge.js) ────────────────
const LOG_FILE = path.join(__dirname, 'hikvision_log.txt');
function logSeguro(linea) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) {
      fs.writeFileSync(LOG_FILE, '(log reiniciado por tamano ' + new Date().toLocaleString('es-MX') + ')\n');
    }
    fs.appendFileSync(LOG_FILE, linea);
  } catch (_) {}
}
function log(txt) {
  logSeguro('[' + new Date().toLocaleString('es-MX') + '] ' + txt + '\n');
  console.log(txt);
}

const VERSION_PUENTE = '2026-08-01 primera version (Hikvision ISAPI)';

// ── Consultas a Supabase (mismas reglas que bridge.js) ──────────────
const CUST_SEL = 'id,profile_id,full_name,suspended,face_id,fingerprint_id,courtesy_used_at';

async function findByDeviceCode(deviceUserId) {
  try {
    const er = await fetch(
      SB_URL + '/rest/v1/device_enrollments?branch_id=eq.' + BRANCH_ID +
      '&device_user_id=eq.' + encodeURIComponent(deviceUserId) +
      '&assigned_to=not.is.null&order=first_seen_at.desc&limit=1',
      { headers: H }
    );
    const ers = await er.json();
    if (ers && ers[0] && ers[0].assigned_to) {
      const cr = await fetch(SB_URL + '/rest/v1/customers?id=eq.' + ers[0].assigned_to + '&select=' + CUST_SEL + '&limit=1', { headers: H });
      const crs = await cr.json();
      if (crs && crs[0]) return { customer: crs[0], kind: ers[0].kind === 'huella' ? 'huella' : (ers[0].kind === 'qr' ? 'qr' : 'rostro') };
    }
  } catch (_) {}
  try {
    const r = await fetch(
      SB_URL + '/rest/v1/customers?or=(fingerprint_id.eq.' + deviceUserId + ',face_id.eq.' + deviceUserId + ')&branch_id=eq.' + BRANCH_ID + '&select=' + CUST_SEL + '&limit=1',
      { headers: H }
    );
    const rows = await r.json();
    if (rows && rows[0]) {
      const c = rows[0];
      const kind = (c.face_id != null && String(c.face_id) === String(deviceUserId)) ? 'rostro'
        : ((c.fingerprint_id != null && String(c.fingerprint_id) === String(deviceUserId)) ? 'huella' : 'rostro');
      return { customer: c, kind };
    }
  } catch (_) {}
  return null;
}

function toDbMethod(kind) {
  return kind === 'rostro' ? 'face' : (kind === 'qr' ? 'qr' : 'fingerprint');
}

// Igual anti-rebote que bridge.js: el aparato puede reenviar el mismo
// evento varias veces (reintentos de red).
const ultimoPase = new Map();
const REBOTE_MS = 45000;

async function registerCheckin(customer, kind) {
  const previo = ultimoPase.get(customer.id);
  if (previo && Date.now() - previo.t < REBOTE_MS) {
    log('(rebote ignorado): ' + customer.full_name + ' — misma respuesta: ' + (previo.granted ? 'permitido' : 'denegado'));
    return previo.granted;
  }
  const openRes = await fetch(
    SB_URL + '/rest/v1/checkins?customer_id=eq.' + customer.id + '&branch_id=eq.' + BRANCH_ID + '&checked_out_at=is.null&granted=eq.true&order=created_at.desc&limit=1',
    { headers: H }
  );
  const open = await openRes.json();
  if (open && open[0]) {
    await fetch(SB_URL + '/rest/v1/checkins?id=eq.' + open[0].id, {
      method: 'PATCH', headers: HJ,
      body: JSON.stringify({ checked_out_at: new Date().toISOString() }),
    });
    log('SALIDA registrada: ' + customer.full_name);
    ultimoPase.set(customer.id, { t: Date.now(), granted: true });
    return true;
  }
  const [prRows, subs] = await Promise.all([
    customer.profile_id
      ? fetch(SB_URL + '/rest/v1/profiles?id=eq.' + customer.profile_id + '&select=role', { headers: H }).then((r) => r.json()).catch(() => null)
      : Promise.resolve(null),
    fetch(
      SB_URL + '/rest/v1/subscriptions?customer_id=eq.' + customer.id + '&branch_id=eq.' + BRANCH_ID + '&status=neq.canceled&order=end_date.desc&limit=1',
      { headers: H }
    ).then((r) => r.json()).catch(() => null),
  ]);
  const esStaff = !!(prRows && prRows[0] && prRows[0].role && prRows[0].role !== 'member');
  let granted = esStaff && !customer.suspended;
  if (!granted && !esStaff) {
    const sub = subs && subs[0];
    granted = !!(sub && new Date(sub.end_date + 'T23:59:59') >= new Date()) && !customer.suspended;
  }
  let consumirCortesia = false;
  if (!granted && !customer.suspended && customer.courtesy_used_at && new Date(customer.courtesy_used_at) > new Date()) {
    granted = true;
    consumirCortesia = true;
  }
  await fetch(SB_URL + '/rest/v1/checkins', {
    method: 'POST', headers: HJ,
    body: JSON.stringify({
      customer_id: customer.id, member_id: customer.profile_id || null, branch_id: BRANCH_ID,
      method: toDbMethod(kind), granted, created_at: new Date().toISOString(), checked_in_at: new Date().toISOString(),
    }),
  });
  if (consumirCortesia) {
    try { await fetch(SB_URL + '/rest/v1/customers?id=eq.' + customer.id, { method: 'PATCH', headers: HJ, body: JSON.stringify({ courtesy_used_at: new Date().toISOString() }) }); } catch (_) {}
    log('CORTESÍA usada (1 acceso): ' + customer.full_name);
  }
  log((granted ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO') + ': ' + customer.full_name);
  ultimoPase.set(customer.id, { t: Date.now(), granted });
  return granted;
}

async function anotarPendiente(deviceUserId, kind) {
  try {
    const exists = await fetch(
      SB_URL + '/rest/v1/device_enrollments?device_user_id=eq.' + encodeURIComponent(deviceUserId) + '&branch_id=eq.' + BRANCH_ID + '&assigned_to=is.null&limit=1',
      { headers: H }
    );
    const rows = await exists.json();
    if (!rows || !rows.length) {
      await fetch(SB_URL + '/rest/v1/device_enrollments', {
        method: 'POST', headers: HJ,
        body: JSON.stringify({ branch_id: BRANCH_ID, device_user_id: String(deviceUserId), kind }),
      });
    }
  } catch (_) {}
}

// ── PROTOCOLO ISAPI de Hikvision ─────────────────────────────────────
// El aparato manda el evento como multipart/form-data: una parte trae
// un bloque JSON (normalmente llamado "event_log" o con
// Content-Type: application/json), y a veces otra parte trae la foto
// de la persona (la ignoramos, no la necesitamos).
//
// El formato exacto del JSON varía un poco según el firmware, pero
// según la documentación pública de Hikvision el evento de acceso
// concedido/denegado trae, entre otros, estos campos (algunos anidados
// dentro de "AccessControllerEvent", otros al nivel superior):
//   employeeNoString   -> el "PIN"/código de la persona en el aparato
//   currentVerifyMode  -> "face" | "card" | "fp" | "faceOrFpOrCard" ...
//   cardNo             -> si entró con tarjeta
//   name               -> nombre tal como quedó registrado EN EL APARATO
//
// Buscamos el JSON dentro del cuerpo sin depender de que el multipart
// venga perfecto (a veces el boundary o los saltos de línea varían
// entre firmwares) — se extrae el primer bloque { ... } balanceado.
function extraerJson(texto) {
  const inicio = texto.indexOf('{');
  if (inicio === -1) return null;
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === '{') profundidad++;
    else if (texto[i] === '}') {
      profundidad--;
      if (profundidad === 0) {
        try { return JSON.parse(texto.slice(inicio, i + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

function kindFromVerifyMode(modo) {
  const m = String(modo || '').toLowerCase();
  if (m.includes('face')) return 'rostro';
  if (m.includes('card')) return 'qr';
  if (m.includes('fp') || m.includes('finger')) return 'huella';
  return 'rostro';
}

async function procesarEventoHikvision(msg) {
  if (!msg) return;
  // El evento puede venir plano o anidado bajo "AccessControllerEvent".
  const ev = msg.AccessControllerEvent || msg;
  const pin = ev.employeeNoString != null ? String(ev.employeeNoString) : (ev.employeeNo != null ? String(ev.employeeNo) : '');
  if (!pin || pin === '0') {
    // No dejamos pasar los heartBeat (el aparato los manda solo, cada rato,
    // avisando "sigo vivo" — no traen persona ni hay nada que reconocer, es
    // normal que no tengan employeeNoString). Los que SÍ importan son los de
    // acceso real (huella/cara/tarjeta) — de esos si dumpeamos el JSON
    // completo, para ver exacto cómo acomoda los campos este firmware y
    // poder ajustar el programa sin adivinar.
    const tipo = msg.eventType || ev.currentVerifyMode || ev.majorEventType || '?';
    if (tipo === 'heartBeat') return;
    log('Evento SIN employeeNoString reconocible (tipo: ' + tipo + ') — JSON completo: ' + JSON.stringify(msg));
    return;
  }
  const kind = kindFromVerifyMode(ev.currentVerifyMode);
  const found = await findByDeviceCode(pin);
  if (found) {
    await registerCheckin(found.customer, found.kind);
  } else {
    log('Código sin vincular en el aparato Hikvision: ' + pin + ' (' + kind + ') — anotado para asignar desde el POS.');
    await anotarPendiente(pin, kind);
  }
}

const app = express();
// Cuerpo crudo para TODO: el multipart de Hikvision no es JSON directo,
// así que lo leemos como texto plano y buscamos el JSON adentro.
app.use(express.text({ type: '*/*', limit: '10mb' }));

app.use((req, res, next) => {
  log('LLEGÓ ' + req.method + ' ' + req.originalUrl + ' (Content-Type: ' + (req.headers['content-type'] || '?') + ', ' + String(req.body || '').length + ' bytes)');
  next();
});

app.get('/version', (req, res) => {
  res.json({ puente: 'Volten Gym (Hikvision)', version: VERSION_PUENTE, sucursal: BRANCH_ID });
});

// Ruta comodín: aceptamos CUALQUIER ruta que el aparato use para avisar
// del evento (algunos firmwares mandan a "/", otros a una ruta que tú
// configuras a mano) — así no depende de acertarle a la ruta exacta.
app.post(/.*/, async (req, res) => {
  try {
    const texto = String(req.body || '');
    const msg = extraerJson(texto);
    if (msg) {
      await procesarEventoHikvision(msg);
    } else {
      log('POST recibido pero no se encontró JSON adentro (puede ser solo la foto adjunta, o un formato distinto que hay que revisar en hikvision_log.txt).');
    }
    // El aparato solo necesita un 200 OK para saber que se recibió.
    res.status(200).send('OK');
  } catch (e) {
    log('ERROR procesando evento: ' + e.message);
    res.status(200).send('OK'); // igual contestamos OK para que el aparato no reintente en loop
  }
});
app.get(/.*/, (req, res) => res.status(200).send('OK'));

app.listen(PUERTO, () => {
  console.log('Puente Volten Gym (Hikvision) escuchando en el puerto', PUERTO, '— sucursal', BRANCH_ID);
  console.log('VERSIÓN:', VERSION_PUENTE);
  console.log('Falta: configurar en el aparato "Notificación de Eventos" apuntando a esta PC : ' + PUERTO);
});

module.exports = { extraerJson, kindFromVerifyMode, procesarEventoHikvision };
