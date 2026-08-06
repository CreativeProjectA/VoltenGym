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

// ── Datos del APARATO (para poder hablarle de vuelta, no solo escucharlo) ──
// El aparato NO le pregunta al sistema si debe abrir — reconoce localmente
// y abre solo. Para que alguien SIN membresía deje de poder pasar, hay que
// deshabilitarlo directo en la memoria del aparato (no solo en Supabase).
// Necesita el usuario/contraseña de administrador que se creó al activarlo.
const HIK_IP = process.env.HIK_IP || '192.168.1.204';
const HIK_USER = process.env.HIK_USER || 'admin';
const HIK_PASS = process.env.HIK_PASS || 'PEGA_AQUI_LA_CONTRASEÑA_DEL_APARATO';
// Cada cuánto revisar membresías vencidas/renovadas y avisarle al aparato
// (10 min por defecto — no necesita ser instantáneo, es un candado extra).
const SYNC_MS = Number(process.env.SYNC_HIK_MS) || 10 * 60000;

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

// ═══════════ HABLARLE DE VUELTA AL APARATO (deshabilitar/habilitar) ═══════
// El aparato Hikvision NO le pregunta al sistema si debe abrir — reconoce
// localmente y abre solo, y YA DESPUÉS avisa "esto pasó". Por eso alguien
// sin membresía puede seguir entrando aunque Supabase diga "denegado": el
// aparato nunca se enteró de esa decisión.
//
// La única forma de que de VERDAD no lo deje pasar es deshabilitarlo en la
// memoria del propio aparato. Hikvision usa autenticación "Digest" (no
// basta con usuario/contraseña simple) — este bloque hace ese handshake a
// mano, porque Node no lo trae de fábrica.
const crypto = require('crypto');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

async function hikDigestRequest(method, rutaISAPI, cuerpoObj) {
  const url = 'http://' + HIK_IP + rutaISAPI;
  const cuerpo = cuerpoObj ? JSON.stringify(cuerpoObj) : undefined;
  // 1) Primer intento SIN credenciales, solo para que el aparato conteste
  //    con el reto (nonce/realm) que hay que usar.
  const r1 = await fetch(url, { method, body: cuerpo, headers: cuerpo ? { 'Content-Type': 'application/json' } : {} });
  if (r1.status !== 401) return r1; // algunos firmwares aceptan sin digest
  const retoHdr = r1.headers.get('www-authenticate') || '';
  const campo = (nombre) => {
    const m = retoHdr.match(new RegExp(nombre + '="([^"]*)"'));
    return m ? m[1] : '';
  };
  const realm = campo('realm'), nonce = campo('nonce'), qop = campo('qop') || 'auth', opaque = campo('opaque');
  const uri = rutaISAPI;
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(HIK_USER + ':' + realm + ':' + HIK_PASS);
  const ha2 = md5(method + ':' + uri);
  const response = md5(ha1 + ':' + nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + ha2);
  let authHeader = 'Digest username="' + HIK_USER + '", realm="' + realm + '", nonce="' + nonce + '", uri="' + uri +
    '", qop=' + qop + ', nc=' + nc + ', cnonce="' + cnonce + '", response="' + response + '"';
  if (opaque) authHeader += ', opaque="' + opaque + '"';
  const headers2 = { Authorization: authHeader };
  if (cuerpo) headers2['Content-Type'] = 'application/json';
  return fetch(url, { method, body: cuerpo, headers: headers2 });
}

// Prende/apaga el acceso de una persona directo en el aparato. "enable"
// en false = aunque su cara esté guardada, el aparato ya no le abre.
// NOTA: esta parte no se pudo probar contra el aparato real desde aquí —
// si falla, hikvision_log.txt va a decir exactamente qué contestó el
// aparato (código y mensaje), para ajustarlo sin adivinar de nuevo.
async function hikSetValid(employeeNo, enable) {
  try {
    const resp = await hikDigestRequest('PUT', '/ISAPI/AccessControl/UserInfo/Modify?format=json', {
      UserInfo: { employeeNo: String(employeeNo), Valid: { enable: !!enable } },
    });
    const texto = await resp.text();
    if (resp.status >= 200 && resp.status < 300) {
      log('Aparato: ' + (enable ? 'HABILITADO' : 'DESHABILITADO') + ' el código ' + employeeNo + ' — respuesta: ' + texto.slice(0, 200));
      return true;
    }
    log('Aparato: NO se pudo ' + (enable ? 'habilitar' : 'deshabilitar') + ' el código ' + employeeNo + ' — HTTP ' + resp.status + ': ' + texto.slice(0, 300));
    return false;
  } catch (e) {
    log('Aparato: error de conexión al intentar ' + (enable ? 'habilitar' : 'deshabilitar') + ' el código ' + employeeNo + ': ' + e.message);
    return false;
  }
}

// ── SINCRONIZACIÓN: revisa membresías y deshabilita/habilita en el aparato ──
// Cada SYNC_MS revisa, para cada código YA asignado a un cliente en esta
// sucursal, si debería poder entrar (misma regla que registerCheckin: staff
// siempre puede, cliente necesita membresía vigente y no estar suspendido).
// Solo le avisa al aparato cuando el estado CAMBIÓ desde la última vez, para
// no estarlo bombardeando de comandos en cada ciclo.
const STATE_FILE = path.join(__dirname, 'estado_sync_hikvision.json');
let estadoSync = {};
try { estadoSync = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch (_) {}
function guardarEstadoSync() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(estadoSync)); } catch (_) {} }

async function deberiaTenerAcceso(customer) {
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
  if (esStaff) return !customer.suspended;
  const sub = subs && subs[0];
  return !!(sub && new Date(sub.end_date + 'T23:59:59') >= new Date()) && !customer.suspended;
}

async function syncUsuarios() {
  try {
    const r = await fetch(
      SB_URL + '/rest/v1/device_enrollments?branch_id=eq.' + BRANCH_ID + '&assigned_to=not.is.null&select=device_user_id,assigned_to',
      { headers: H }
    );
    const enrollments = await r.json();
    if (!enrollments || !enrollments.length) return;
    for (const e of enrollments) {
      const cr = await fetch(SB_URL + '/rest/v1/customers?id=eq.' + e.assigned_to + '&select=' + CUST_SEL + '&limit=1', { headers: H });
      const crs = await cr.json();
      const customer = crs && crs[0];
      if (!customer) continue;
      const debeEntrar = await deberiaTenerAcceso(customer);
      const previo = estadoSync[e.device_user_id];
      if (previo === debeEntrar) continue; // sin cambios, no molestamos al aparato
      const ok = await hikSetValid(e.device_user_id, debeEntrar);
      if (ok) { estadoSync[e.device_user_id] = debeEntrar; guardarEstadoSync(); }
    }
  } catch (err) {
    log('Error en sincronización de membresías: ' + err.message);
  }
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
// Primer barrido a los 20s (deja que arranque todo primero) y luego cada
// SYNC_MS: a quien se le venza la membresía, el aparato deja de abrirle
// aunque su cara siga guardada; a quien renueve, se le vuelve a habilitar.
setTimeout(syncUsuarios, 20000);
setInterval(syncUsuarios, SYNC_MS);

module.exports = { extraerJson, kindFromVerifyMode, procesarEventoHikvision, hikDigestRequest, hikSetValid, deberiaTenerAcceso };
