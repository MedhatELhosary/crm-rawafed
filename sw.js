// Service Worker — بيخلي التطبيق يفتح بدون نت
const CACHE = 'crm-rawafed-v24';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return; // طلبات الـ API متتكاشش
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if (resp.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('unpkg.com'))) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
