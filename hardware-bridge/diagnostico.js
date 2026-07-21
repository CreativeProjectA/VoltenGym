// DIAGNÓSTICO PURO — puerto nuevo (4499) que nadie ha usado antes.
// No depende de nada viejo. Anota TODO lo que le llegue, sea lo que sea.
const http = require('http');
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, 'diagnostico_log.txt');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const linea = '\n[' + new Date().toLocaleString('es-MX') + '] ' + req.method + ' ' + req.url +
      '\n  headers: ' + JSON.stringify(req.headers) + '\n  body: ' + body.slice(0, 500) + '\n';
    fs.appendFileSync(LOG, linea);
    console.log('*** LLEGÓ ALGO ***', req.method, req.url);
    res.end('OK');
  });
});
server.on('connection', (s) => {
  const linea = '[' + new Date().toLocaleString('es-MX') + '] TCP conexión de ' + (s.remoteAddress || '?') + '\n';
  fs.appendFileSync(LOG, linea);
  console.log('*** TCP conexión de', s.remoteAddress, '***');
});
server.on('clientError', (err, socket) => {
  const crudo = err && err.rawPacket ? err.rawPacket.toString('utf8').slice(0, 400) : (err ? err.message : '?');
  fs.appendFileSync(LOG, '[' + new Date().toLocaleString('es-MX') + '] datos NO-HTTP: ' + JSON.stringify(crudo) + '\n');
  console.log('*** datos raros:', JSON.stringify(crudo).slice(0, 200), '***');
  try { socket.destroy(); } catch (_) {}
});

const WebSocket = require('ws');
try {
  const wss = new WebSocket.WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    fs.appendFileSync(LOG, '[' + new Date().toLocaleString('es-MX') + '] WEBSOCKET conexión de ' + (req.socket.remoteAddress || '?') + '\n');
    console.log('*** WEBSOCKET conexión ***');
    ws.on('message', (d) => {
      fs.appendFileSync(LOG, '[' + new Date().toLocaleString('es-MX') + '] WS mensaje: ' + d.toString().slice(0, 500) + '\n');
      console.log('*** WS mensaje:', d.toString().slice(0, 200), '***');
      try { ws.send(JSON.stringify({ ret: 'reg', result: true })); } catch (_) {}
    });
  });
} catch (e) { console.log('(sin soporte websocket en este diagnóstico, no importa)'); }

server.listen(4499, () => {
  console.log('=================================================');
  console.log('  DIAGNÓSTICO escuchando en el puerto 4499');
  console.log('  Deja esta ventana abierta y visible.');
  console.log('=================================================');
});
