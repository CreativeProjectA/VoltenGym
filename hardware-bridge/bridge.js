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
    return;
  }
  // Validación de membresía (misma regla que el POS: solo vale en ESTA sucursal)
  const subRes = await fetch(
    SB_URL + '/rest/v1/subscriptions?customer_id=eq.' + customer.id + '&branch_id=eq.' + BRANCH_ID + '&status=neq.canceled&order=end_date.desc&limit=1',
    { headers: H }
  );
  const subs = await subRes.json();
  const sub = subs && subs[0];
  const granted = !!(sub && new Date(sub.end_date + 'T23:59:59') >= new Date());
  await fetch(SB_URL + '/rest/v1/checkins', {
    method: 'POST', headers: HJ,
    body: JSON.stringify({
      customer_id: customer.id, member_id: customer.profile_id || null, branch_id: BRANCH_ID,
      method: toDbMethod(kind), granted, created_at: new Date().toISOString(), checked_in_at: new Date().toISOString(),
    }),
  });
  console.log((granted ? 'ACCESO PERMITIDO' : 'ACCESO DENEGADO') + ':', customer.full_name);
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
      // Huella/cara nueva sin vincular — se anota para asignarla con un
      // clic desde el POS (Accesos → "Registros nuevos del aparato").
      console.log('Sin cliente vinculado — anotado como pendiente:', deviceUserId, kind);
      try {
        const exists = await fetch(
          SB_URL + '/rest/v1/device_enrollments?device_user_id=eq.' + encodeURIComponent(deviceUserId) + '&branch_id=eq.' + BRANCH_ID + '&assigned_to=is.null&limit=1',
          { headers: H }
        );
        const rows = await exists.json();
        if (!rows || !rows.length) {
          await fetch(SB_URL + '/rest/v1/device_enrollments', {
            method: 'POST', headers: HJ,
            body: JSON.stringify({ branch_id: BRANCH_ID, device_user_id: deviceUserId, kind }),
          });
        }
      } catch (_) { /* si falta pos_migration12.sql, no rompe el resto */ }
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

app.listen(4370, () => {
  console.log('Puente Volten Gym escuchando en el puerto 4370 — sucursal', BRANCH_ID);
  // Barrido inicial a los 10s y luego cada SYNC_MS: vencidos fuera, renovados de vuelta.
  setTimeout(syncUsuarios, 10000);
  setInterval(syncUsuarios, SYNC_MS);
});
