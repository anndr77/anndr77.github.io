const CACHE_NAME = 'video-lite-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// message to cache arbitrary URL (only for small metadata endpoints)
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'cache-url' && data.url) {
    caches.open(CACHE_NAME).then(cache => {
      fetch(data.url, {mode:'cors'}).then(resp => {
        if (resp && resp.ok) cache.put(data.url, resp.clone());
      }).catch(()=>{/* ignore */});
    });
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // For same-origin assets and cached metadata, return cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        const ct = resp.headers.get('content-type') || '';
        // only cache small JSON/HTML assets automatically
        if (req.method === 'GET' && resp.ok && (ct.includes('application/json') || ct.includes('text/html'))) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return resp;
      }).catch(()=> caches.match('./index.html'));
    })
  );
});
