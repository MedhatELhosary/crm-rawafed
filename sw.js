// Service Worker â€” ط¨ظٹط®ظ„ظٹ ط§ظ„طھط·ط¨ظٹظ‚ ظٹظپطھط­ ط¨ط¯ظˆظ† ظ†طھطŒ ظˆط¨ظٹط§ط®ط¯ ط§ظ„طھط­ط¯ظٹط«ط§طھ ظپظˆط±ظ‹ط§ ظ„ظ…ط§ ظٹظƒظˆظ† ظپظٹظ‡ ظ†طھ
const CACHE = 'crm-rawafed-v47';

// ظ…ظ„ظپط§طھ ط§ظ„طھط·ط¨ظٹظ‚ ظ†ظپط³ظ‡ â€” ط¯ظٹ ط¨طھطھط­ط¯ط« ظƒظ„ ط´ظˆظٹط©
const SHELL = [
  './',
  './index.html',
  './app.css',
  './config.js',
  './app.js',
  './manifest.json'
];
// ظ…ظ„ظپط§طھ ط«ط§ط¨طھط© ظ†ط§ط¯ط±ظ‹ط§ ط¨طھطھط؛ظٹط±
const STATIC = [
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.concat(STATIC)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** ط¨ظٹط¬ظٹط¨ ظ…ظ† ط§ظ„ظ†طھ ظˆط¨ظٹط­ط¯ظ‘ط« ط§ظ„ظƒط§ط´طŒ ظˆط¨ظٹط³طھط³ظ„ظ… ط¨ط¹ط¯ ظ…ظ‡ظ„ط© ط¹ط´ط§ظ† ط§ظ„ط´ط¨ظƒط© ط§ظ„ط¶ط¹ظٹظپط© ظ…طھط¹ط·ظ„ط´ ط§ظ„طھط·ط¨ظٹظ‚ */
function fromNetwork(request, timeoutMs) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
    fetch(request).then(resp => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (resp && resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
      }
      resolve(resp);
    }).catch(() => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve(null);
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // ط·ظ„ط¨ط§طھ ط§ظ„ظ€ API ظ…طھطھظƒط§ط´ط´
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // ظ…ظ„ظپط§طھ ط§ظ„طھط·ط¨ظٹظ‚: ط§ظ„ظ†طھ ط§ظ„ط£ظˆظ„ (ط¹ط´ط§ظ† ط§ظ„طھط­ط¯ظٹط« ظٹظ†ط²ظ„ ظپظˆط±ظ‹ط§) ظˆط§ظ„ظƒط§ط´ ط§ط­طھظٹط§ط·ظٹ
  const isShell = sameOrigin && (
    req.mode === 'navigate' ||
    /\.(html|js|css|json)$/.test(url.pathname) ||
    url.pathname.endsWith('/')
  );

  if (isShell) {
    e.respondWith(
      fromNetwork(req, 2500).then(resp => resp || caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // ط§ظ„ط¨ط§ظ‚ظٹ (طµظˆط±طŒ ط®ط±ط§ظٹط·): ط§ظ„ظƒط§ط´ ط§ظ„ط£ظˆظ„ ظˆط£ط³ط±ط¹
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) { fromNetwork(req, 8000); return cached; }   // ط¨ظٹطھط­ط¯ط« ظپظٹ ط§ظ„ط®ظ„ظپظٹط©
      return fromNetwork(req, 8000).then(r => r || cached);
    })
  );
});
