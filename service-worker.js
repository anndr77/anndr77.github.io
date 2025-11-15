const CACHE_NAME = 'my-music-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// message handler to cache arbitrary URL (metadata pages only)
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'cache-url' && data.url) {
    // Only cache same-origin or https metadata endpoints.
    caches.open(CACHE_NAME).then(cache => {
      fetch(data.url, {mode:'cors'}).then(resp => {
        if (resp && resp.ok) cache.put(data.url, resp.clone());
      }).catch(()=>{/*ignore*/});
    });
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // For navigation or same-origin assets, respond with cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        // optionally cache HTML/API responses (small)
        const contentType = resp.headers.get('content-type') || '';
        if (req.method === 'GET' && resp.ok && (contentType.includes('application/json') || contentType.includes('text/html'))) {
          const resClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return resp;
      }).catch(()=> {
        // fallback
        return caches.match('/index.html');
      });
    })
  );
});
