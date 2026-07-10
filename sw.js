// Volten Gym — service worker
// Estrategia: red primero (siempre fresco con internet) y caché de respaldo
// (el POS y la app CARGAN aunque no haya wifi; los datos pendientes los
// sincroniza la cola interna del POS al reconectar).
const CACHE = 'volten-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(['./pos.html', './voltengym.png', './manifest.json', './manifest-pos.json']).catch(() => {})
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Notificaciones push reales (con el celular bloqueado o la app cerrada).
// En iPhone SOLO funcionan si el cliente instaló la app en su pantalla de
// inicio -- limitación de Apple, no de este código.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Volten Gym';
  const body = data.body || '';
  const url = data.url || './app.html';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './voltengym.png',
      badge: './voltengym.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './app.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) { if (c.url.includes('app.html') && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
