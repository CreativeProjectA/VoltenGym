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
