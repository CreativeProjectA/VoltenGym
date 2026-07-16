// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Puente de hardware (facial AI07F + torniquete ZKTeco)
//  Corre en la PC de recepción de CADA sucursal (Node.js). Hace DOS cosas:
//
//  1. RECIBE los eventos de acceso del dispositivo físico (cara/huella/QR)
//     y los sube a Supabase como entradas/salidas, validando membresía.
//
//  2. SINCRONIZA la lista de usuarios del aparato con las membresías:
//     al que se le VENCE la membresía (o lo suspenden), el puente le manda
//     al aparato la orden de BORRARLO de su memoria → su cara/huella deja
//     de abrir. Cuando RENUEVA, lo vuelve a dar de alta en el aparato
//     (su cara se registra de nuevo una sola vez en el dispositivo).
//     Así nadie sin membresía vigente puede entrar, sin pasos manuales.
//
//  Protocolo: push estándar de ZKTeco (ADMS). El aparato pregunta cada
//  rato "¿tienes órdenes para mí?" (/iclock/getrequest) y ahí se le
//  entregan los comandos pendientes. El torniquete es ZKTeco confirmado;
//  el facial AI07F es genérico — se afina con el equipo en mano.
//
//  CÓMO USARLO (cuando el hardware esté conectado):
//   1. npm install express node-fetch@2
//   2. node bridge.js  (el instalador ya lo deja corriendo solo)
//   3. En la configuración de red del dispositivo, busca "ADMS" /
//      "Cloud Server" / "Push Server" y apunta IP-de-esta-PC : 4370.
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2
const fs = require('fs');
const path = require('path');

const SB_URL = process.env.SB_URL || 'https://mopyslyhjtnmvlksusjr.supabase.co';
const SB_SERVICE_KEY = process.env.SB_SERVICE_KEY || 'PEGA_AQUI_LA_SERVICE_KEY';
// Sucursal donde corre ESTE puente (una PC por sucursal, cada una con su propio BRANCH_ID).
const BRANCH_ID = process.env.BRANCH_ID || 'PEGA_AQUI_EL_ID_DE_LA_SUCURSAL';
// Cada cuánto revisar membresías vencidas/renovadas (60s por defecto).
const SYNC_MS = Number(process.env.SYNC_MS) || 60000;

const H = { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY };
const HJ = Object.assign({}, H, { 'Content-Type': 'application/json' });

const app = express();
app.use(express.text({ type: '*/*', limit: '5mb' })); // ZKTeco manda texto plano, no JSON

// ── GRABADOR de diagnóstico ─────────────────────────────────────────────
// Anota en un archivo TODO lo que llegue al puente, sea cual sea la ruta,
// para ver exactamente qué manda el aparato cuando no logramos identificar
// su protocolo exacto. Se puede borrar este bloque una vez resuelto.
const LOG_FILE = path.join(__dirname, 'log_conexiones.txt');
app.use((req, res, next) => {
  const linea = '\n[' + new Date().toLocaleString('es-MX') + '] ' + req.method + ' ' + req.originalUrl +
    '\n  headers: ' + JSON.stringify(req.headers) +
    '\n  body: ' + JSON.stringify(req.body || '').slice(0, 500) + '\n';
  try { fs.appendFileSync(LOG_FILE, linea); } catch (_) {}
  console.log('LLEGÓ:', req.method, req.originalUrl);
  next();
});

// ── Estado persistente (sobrevive reinicios de la PC) ──────────────────
// borrados: { pin: {status:'pendiente'|'ok', t:fecha} } — a quiénes ya se
//   les mandó borrar del aparato por membresía vencida.
// aparatos: { SN: últimaVezVisto } — los dispositivos que han reportado.
const STATE_FILE = path.join(__dirname, 'estado_sync.json');
let state = { borrados: {}, aparatos: {}, cmdSeq: 1 };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))); } catch (_) {}
function saveState() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (_) {} }

// Cola de comandos por dispositivo: { SN: [ {id, cmd} ] }
const cmdQueue = {};
function seenDevice(sn) {
  if (!sn) return;
  if (!state.aparatos[sn]) console.log('Dispositivo nuevo conectado:', sn);
  state.aparatos[sn] = new Date().toISOString();
  saveState();
}
function queueForAllDevices(cmd) {
  const sns = Object.keys(state.aparatos);
  if (!sns.length) { console.log('(sin dispositivos conectados aún — el comando se re-intentará solo)'); return false; }
  for (const sn of sns) {
    (cmdQueue[sn] = cmdQueue[sn] || []).push({ id: state.cmdSeq++, cmd });
  }
  saveState();
  return true;
}

// ── Consultas a Supabase ────────────────────────────────────────────────
async function findCustomerByDeviceId(deviceUserId) {
  const r = await fetch(
    SB_URL + '/rest/v1/customers?or=(fingerprint_id.eq.' + deviceUserId + ',face_id.eq.' + deviceUserId + ')&select=id,profile_id,full_name&limit=1',
    { headers: H }
  );
  const rows = await r.json();
  return rows && rows[0];
}

// El torniquete TAMBIÉN trae su propio lector de QR (pasas el teléfono por
// encima). Ese código es el mismo QR que ya usa la app del cliente:
// "volten-gym:member:<uuid-completo>".
const QR_PREFIX = 'volten-gym:member:';
async function findCustomerByQr(raw) {
  let code = String(raw || '').trim();
  if (code.toLowerCase().startsWith(QR_PREFIX)) code = code.slice(QR_PREFIX.length);
  if (!code) return null;
  const r = await fetch(
    SB_URL + '/rest/v1/customers?or=(id.eq.' + code + ',profile_id.eq.' + code + ')&select=id,profile_id,full_name&limit=1',
    { headers: H }
  );
  const rows = await r.json();
  return rows && rows[0];
}

// La base solo acepta method en inglés: qr | fingerprint | face | manual | barcode.
function toDbMethod(kind) {
  return kind === 'rostro' ? 'face' : (kind === 'qr' ? 'qr' : 'fingerprint');
}

// Regresa true si el acceso fue PERMITIDO (o si es una salida) — así los
// aparatos que preguntan en tiempo real ("Ratificar servidor") saben si abrir.
async function registerCheckin(customer, kind) {
  // Mismo comportamiento que el POS: si ya está adentro, esto es su salida.
  const openRes = await fetch(
    SB_URL + '/rest/v1/checkins?customer_id=eq.' + customer.id + '&checked_out_at=is.null&granted=eq.true&order=created_at.desc&limit=1',
    { headers: H }
  );
  const open = await openRes.json();
  if (open && open[0]) {
    await fetch(SB_URL + '/rest/v1/checkins?id=eq.' + open[0].id, {
      method: 'PATCH', headers: HJ,
      body: JSON.stringify({ checked_out_at: new Date().toISOString() }),
    });
    console.log('SALIDA registrada:', customer.full_name);
    return true;
  }
  // El personal (coach/cajera/encargado/admin) SIEMPRE entra — no necesita
  // membresía, es su trabajo, no un cliente pagando. Mismo criterio que ya
  // usa syncUsuarios() para no borrarlos del aparato, pero aquí falta aplicarlo
  // también al acceso en tiempo real (Ratificar servidor pregunta cada vez).
  let esStaff = false;
  if (customer.profile_id) {
    try {
      const pr = await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + customer.profile_id + '&select=role', { headers: H });
      const prRows = await pr.json();
      esStaff = !!(prRows && prRows[0] && prRows[0].role && prRows[0].role !== 'member');
    } catch (_) {}
  }
  let granted = esStaff && !customer.suspended;
  if (!granted && !esStaff) {
    // Validación de membresía (misma regla que el POS: solo vale en ESTA sucursal)
    const subRes = await fetch(
      SB_URL + '/rest/v1/subscriptions?customer_id=eq.' + customer.id + '&branch_id=eq.' + BRANCH_ID + '&status=neq.canceled&order=end_date.desc&limit=1',
      { headers: H }
    );
    const subs = await subRes.json();
    const sub = subs && subs[0];
    granted = !!(sub && new Date(sub.end_date + 'T23:59:59') >= new Date()) && !customer.suspended;
  }
  await fetch(SB_URL + '/rest/v1/checkins', {
    method: 'POST', headers: HJ,
    body: JSON.stringify({
      customer_id: customer.id, member_id: customer.profile_id || null, branch_id: BRANCH_ID,
      method: toDbMethod(kind), granted, created_at: new Date().toISOString(), checked_in_at: new Date().toISOString(),
    }),
  });
  console.log((granted ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO') + ':', customer.full_name);
  return granted;
}

// Cara/huella nueva que nadie ha vinculado — se anota para asignarla con
// un clic desde el POS (Accesos → "Registros nuevos del aparato").
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
  } catch (_) { /* si falta pos_migration12.sql, no rompe el resto */ }
}

// ── SINCRONIZACIÓN: vencidos fuera del aparato, renovados de vuelta ────
async function syncUsuarios() {
  try {
    // 1. Clientes de ESTA sucursal que tienen cara o huella registrada
    const cRes = await fetch(
      SB_URL + '/rest/v1/customers?branch_id=eq.' + BRANCH_ID + '&or=(face_id.not.is.null,fingerprint_id.not.is.null)&select=id,full_name,profile_id,suspended,face_id,fingerprint_id',
      { headers: H }
    );
    const clientes = await cRes.json();
    if (!Array.isArray(clientes)) return;

    // 2. El personal (coach/cajera/encargado/admin) NUNCA se borra del aparato
    const pids = clientes.map((c) => c.profile_id).filter(Boolean);
    const roles = {};
    if (pids.length) {
      const pRes = await fetch(SB_URL + '/rest/v1/profiles?id=in.(' + pids.join(',') + ')&select=id,role', { headers: H });
      const pRows = await pRes.json();
      if (Array.isArray(pRows)) pRows.forEach((p) => { roles[p.id] = p.role; });
    }

    // 3. Mejor vigencia por cliente en ESTA sucursal
    const sRes = await fetch(
      SB_URL + '/rest/v1/subscriptions?branch_id=eq.' + BRANCH_ID + '&status=neq.canceled&select=customer_id,end_date&order=end_date.desc',
      { headers: H }
    );
    const subs = await sRes.json();
    const mejorFin = {};
    if (Array.isArray(subs)) subs.forEach((s) => { if (!mejorFin[s.customer_id]) mejorFin[s.customer_id] = s.end_date; });

    const ahora = new Date();
    for (const c of clientes) {
      const esStaff = c.profile_id && roles[c.profile_id] && roles[c.profile_id] !== 'member';
      const fin = mejorFin[c.id];
      const activo = esStaff || (!c.suspended && fin && new Date(fin + 'T23:59:59') >= ahora);
      const pins = [...new Set([c.face_id, c.fingerprint_id].filter(Boolean))];

      for (const pin of pins) {
        const b = state.borrados[pin];
        if (!activo) {
          // Vencido/suspendido → fuera del aparato (re-intenta si quedó pendiente >10 min)
          const pendienteViejo = b && b.status === 'pendiente' && (ahora - new Date(b.t)) > 10 * 60000;
          if (!b || pendienteViejo) {
            const enviado = queueForAllDevices('DATA DELETE USERINFO PIN=' + pin);
            state.borrados[pin] = { status: enviado ? 'pendiente' : 'sin-aparato', t: ahora.toISOString() };
            saveState();
            console.log('MEMBRESÍA VENCIDA → borrar del aparato:', c.full_name, '(código ' + pin + ')');
          } else if (b.status === 'sin-aparato' && Object.keys(state.aparatos).length) {
            // ya hay aparato conectado — ahora sí mándalo
            queueForAllDevices('DATA DELETE USERINFO PIN=' + pin);
            state.borrados[pin] = { status: 'pendiente', t: ahora.toISOString() };
            saveState();
          }
        } else if (b) {
          // RENOVÓ → darlo de alta otra vez en el aparato.
          // Ojo: el aparato borró también su plantilla de cara/huella, así
          // que debe REGISTRARLA de nuevo una vez (mismo código de usuario,
          // su ficha no cambia). En el POS saldrá como registro nuevo si el
          // aparato le asigna otro código.
          const nombre = String(c.full_name || 'Cliente').replace(/[\t\n\r]/g, ' ').slice(0, 24);
          queueForAllDevices('DATA UPDATE USERINFO PIN=' + pin + '\tName=' + nombre + '\tPri=0');
          delete state.borrados[pin];
          saveState();
          console.log('RENOVÓ → re-activado en el aparato:', c.full_name, '(código ' + pin + ' — debe registrar su cara/huella de nuevo una vez)');
        }
      }
    }
  } catch (e) { console.error('sync error:', e.message); }
}

// ── Protocolo push de ZKTeco (ADMS) — el dispositivo llama esto solo ──
// Handshake inicial del dispositivo
app.get('/iclock/cdata', (req, res) => {
  seenDevice(req.query.SN);
  res.send('GET OPTION FROM: ' + req.query.SN + '\nATTLOGStamp=None\nOPERLOGStamp=9999\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=None');
});

// El dispositivo sube aquí los registros de asistencia reales (texto: userId\ttimestamp\t...)
app.post('/iclock/cdata', async (req, res) => {
  try {
    seenDevice(req.query.SN);
    const lines = String(req.body || '').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const fields = line.split('\t');
      const deviceUserId = fields[0];
      if (!deviceUserId) continue;
      // Campo "Verify" (modo de verificación), casi siempre la 4ª columna:
      // 1=huella, 15=cara, 2=tarjeta/QR. Se confirma con el equipo real.
      const verifyCode = fields[3];
      const kind = verifyCode === '15' ? 'rostro' : (verifyCode === '2' ? 'qr' : 'huella');
      const customer = (await findCustomerByDeviceId(deviceUserId)) || (await findCustomerByQr(deviceUserId));
      if (customer) { await registerCheckin(customer, kind); continue; }
      console.log('Sin cliente vinculado — anotado como pendiente:', deviceUserId, kind);
      await anotarPendiente(deviceUserId, kind);
    }
    res.send('OK');
  } catch (e) { console.error(e); res.status(500).send('error'); }
});

// Heartbeat del dispositivo: aquí se le ENTREGAN los comandos pendientes
// (borrar vencidos / re-activar renovados). Sin comandos → "OK".
app.get('/iclock/getrequest', (req, res) => {
  const sn = req.query.SN;
  seenDevice(sn);
  const q = cmdQueue[sn];
  if (q && q.length) {
    const batch = q.splice(0, 20);
    const body = batch.map((c) => 'C:' + c.id + ':' + c.cmd).join('\n');
    // entregado = lo tomó el aparato; el resultado llega a /iclock/devicecmd
    for (const c of batch) {
      const m = c.cmd.match(/DELETE USERINFO PIN=(\S+)/);
      if (m && state.borrados[m[1]]) { state.borrados[m[1]] = { status: 'ok', t: new Date().toISOString() }; }
    }
    saveState();
    console.log('Comandos entregados a', sn + ':', batch.map((c) => c.cmd).join(' | '));
    return res.send(body);
  }
  res.send('OK');
});

// El dispositivo reporta aquí el resultado de cada comando (Return=0 = bien)
app.post('/iclock/devicecmd', (req, res) => {
  seenDevice(req.query.SN);
  const body = String(req.body || '');
  for (const m of body.matchAll(/ID=(\d+)[^\n]*?Return=(-?\d+)/g)) {
    console.log('Resultado de comando #' + m[1] + ':', m[2] === '0' ? 'OK' : 'ERROR ' + m[2]);
  }
  res.send('OK');
});

// ── A PRUEBA DE RUTAS ────────────────────────────────────────────────
// GymCloud (mismo fabricante TM-AI) usa una ruta distinta a la estándar
// de ZKTeco (ellos: /ControlAcceso/adms.php). No sabemos con certeza si
// ESTE aparato exige /iclock/cdata exacto o acepta cualquier ruta — por
// eso, cualquier otra ruta que llegue se atiende IGUAL que /iclock/cdata
// y /iclock/getrequest, para no depender de acertarle a la ruta exacta.
app.get(/^(?!\/iclock).*/, (req, res) => {
  seenDevice(req.query.SN);
  const sn = req.query.SN;
  const q = cmdQueue[sn];
  if (q && q.length) {
    const batch = q.splice(0, 20);
    const body = batch.map((c) => 'C:' + c.id + ':' + c.cmd).join('\n');
    for (const c of batch) {
      const m = c.cmd.match(/DELETE USERINFO PIN=(\S+)/);
      if (m && state.borrados[m[1]]) { state.borrados[m[1]] = { status: 'ok', t: new Date().toISOString() }; }
    }
    saveState();
    console.log('(ruta comodín ' + req.path + ') Comandos entregados a', sn + ':', batch.map((c) => c.cmd).join(' | '));
    return res.send(body);
  }
  res.send('GET OPTION FROM: ' + sn + '\nATTLOGStamp=None\nOPERLOGStamp=9999\nATTPHOTOStamp=None\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=None');
});
app.post(/^(?!\/iclock).*/, async (req, res) => {
  try {
    seenDevice(req.query.SN);
    console.log('(ruta comodín ' + req.path + ') POST recibido, largo:', String(req.body || '').length);
    const lines = String(req.body || '').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const fields = line.split('\t');
      const deviceUserId = fields[0];
      if (!deviceUserId || deviceUserId.startsWith('ID=')) continue; // no confundir con devicecmd
      const verifyCode = fields[3];
      const kind = verifyCode === '15' ? 'rostro' : (verifyCode === '2' ? 'qr' : 'huella');
      const customer = (await findCustomerByDeviceId(deviceUserId)) || (await findCustomerByQr(deviceUserId));
      if (customer) { await registerCheckin(customer, kind); continue; }
      await anotarPendiente(deviceUserId, kind);
    }
    res.send('OK');
  } catch (e) { console.error(e); res.status(500).send('error'); }
});

// ═══════════════ PROTOCOLO "AiFace" (WebSocket + JSON) ═══════════════
// El facial TM-AI07F (marca TIMY, firmware ai806) NO habla el protocolo
// HTTP de ZKTeco: se conecta por WEBSOCKET y manda mensajes JSON.
// Con "Ratificar servidor: Sí", el aparato PREGUNTA en cada acceso si
// debe abrir — o sea, validamos la membresía EN TIEMPO REAL: vencido o
// suspendido = el aparato no abre. Mejor aún que borrar usuarios.
const http = require('http');
let wsOk = false;
let WebSocketServer = null;
try { ({ WebSocketServer } = require('ws')); wsOk = true; }
catch (e) { console.log('AVISO: falta el paquete "ws" (protocolo AiFace del facial). Corre INSTALAR.bat de nuevo.'); }

const nowCloud = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};
const wsLog = (txt) => {
  try { fs.appendFileSync(LOG_FILE, '[' + new Date().toLocaleString('es-MX') + '] WS ' + txt + '\n'); } catch (_) {}
  console.log('WS:', String(txt).slice(0, 250));
};
// según lo observado en esta familia de aparatos: modo 0-9 huella, 11 tarjeta, 50+ cara
const kindFromBackup = (n) => { n = Number(n); return n >= 50 ? 'rostro' : (n === 11 ? 'qr' : 'huella'); };

// Le pega el protocolo AiFace (WebSocket+JSON) a un servidor HTTP dado —
// se usa una vez por cada puerto que abrimos, todos con la misma lógica.
function attachWs(srv) {
  const wss = new WebSocketServer({ server: srv });
  wss.on('connection', (ws, req) => {
    wsLog('CONEXIÓN nueva desde ' + (req.socket.remoteAddress || '?') + ' (puerto ' + srv.address().port + ')');
    ws.on('message', async (data) => {
      const raw = data.toString();
      wsLog('LLEGÓ: ' + raw.slice(0, 900));
      let msg = null;
      try { msg = JSON.parse(raw); } catch (_) { return; }
      const reply = (obj) => { try { ws.send(JSON.stringify(obj)); wsLog('RESPONDÍ: ' + JSON.stringify(obj).slice(0, 300)); } catch (_) {} };

      try {
        if (msg.cmd === 'reg') {
          if (msg.sn) seenDevice(msg.sn);
          reply({ ret: 'reg', result: true, cloudtime: nowCloud(), nosenduser: false });

        } else if (msg.cmd === 'sendlog') {
          const records = msg.record || msg.records || [];
          let granted = false;
          for (const r of records) {
            const pin = String(r.enrollid != null ? r.enrollid : (r.userid != null ? r.userid : ''));
            if (!pin) continue;
            const kind = r.mode != null ? kindFromBackup(r.mode) : 'rostro';
            const customer = await findCustomerByDeviceId(pin);
            if (customer) { granted = (await registerCheckin(customer, kind)) || granted; }
            else { console.log('Acceso de código sin vincular:', pin); await anotarPendiente(pin, kind); }
          }
          reply({ ret: 'sendlog', result: true, count: records.length, logindex: msg.logindex != null ? msg.logindex : 0, cloudtime: nowCloud(), access: granted ? 1 : 0 });

        } else if (msg.cmd === 'senduser') {
          const pin = String(msg.enrollid != null ? msg.enrollid : '');
          const kind = kindFromBackup(msg.backupnum);
          if (pin) { console.log('Usuario nuevo registrado en el aparato:', pin, '(' + kind + ')'); await anotarPendiente(pin, kind); }
          reply({ ret: 'senduser', result: true, cloudtime: nowCloud() });

        } else if (msg.cmd) {
          reply({ ret: msg.cmd, result: true, cloudtime: nowCloud() });
        }
      } catch (e) { wsLog('error procesando: ' + e.message); }
    });
    ws.on('close', () => wsLog('conexión cerrada'));
    ws.on('error', (e) => wsLog('error de conexión: ' + e.message));
  });
}

// ── VARIOS PUERTOS A LA VEZ ──────────────────────────────────────────
// El manual de GymCloud (mismo fabricante) NUNCA pide capturar un puerto
// — su dirección es "app.gymcloud.mx/ControlAcceso/adms.php" sin número
// de puerto. Sospecha fuerte: en modo "dominio", este aparato puede estar
// IGNORANDO el campo "Puerto" del menú y usando el 80 (el normal de
// internet) por su cuenta. Por eso el puente ahora escucha en VARIOS
// puertos a la vez — sea cual sea el que el aparato use de verdad, alguien
// va a estar ahí esperándolo. El 4370 sigue siendo el principal/recomendado.
const PUERTOS = [4370, 80, 8090, 8080];
const servidores = [];
for (const puerto of PUERTOS) {
  const srv = http.createServer(app);
  if (wsOk) attachWs(srv);
  // Detector de FONDO: anota CUALQUIER toque, hasta protocolos desconocidos.
  srv.on('connection', (s) => {
    const linea = '[' + new Date().toLocaleString('es-MX') + '] TCP conexión entrante de ' + (s.remoteAddress || '?') + ' (puerto ' + puerto + ')\n';
    try { fs.appendFileSync(LOG_FILE, linea); } catch (_) {}
    console.log('TCP: conexión de', s.remoteAddress || '?', 'en el puerto', puerto);
  });
  srv.on('clientError', (err, socket) => {
    const crudo = err && err.rawPacket ? err.rawPacket.toString('utf8').slice(0, 400) : (err ? err.message : '?');
    try { fs.appendFileSync(LOG_FILE, '[' + new Date().toLocaleString('es-MX') + '] TCP datos NO-HTTP de ' + ((socket && socket.remoteAddress) || '?') + ' (puerto ' + puerto + '): ' + JSON.stringify(crudo) + '\n'); } catch (_) {}
    try { socket.destroy(); } catch (_) {}
  });
  srv.listen(puerto, () => console.log('Puente Volten Gym escuchando en el puerto', puerto, '— sucursal', BRANCH_ID))
    .on('error', (e) => console.log('AVISO: no se pudo abrir el puerto ' + puerto + ' (' + e.message + ') — probablemente ya está en uso por Windows, se ignora y sigue con los demás.'));
  servidores.push(srv);
}
console.log('Protocolos activos: ZKTeco push (HTTP)' + (wsOk ? ' + AiFace (WebSocket JSON)' : ' — AiFace DESACTIVADO, falta paquete ws'));
// Barrido inicial a los 10s y luego cada SYNC_MS: vencidos fuera, renovados de vuelta.
setTimeout(syncUsuarios, 10000);
setInterval(syncUsuarios, SYNC_MS);
