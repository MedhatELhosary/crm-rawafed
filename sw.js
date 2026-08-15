// Service Worker — بيخلي التطبيق يفتح بدون نت، وبياخد التحديثات فورًا لما يكون فيه نت
const CACHE = 'crm-rawafed-v28';

// ملفات التطبيق نفسه — دي بتتحدث كل شوية
const SHELL = [
  './',
  './index.html',
  './app.css',
  './config.js',
  './app.js',
  './manifest.json'
];
// ملفات ثابتة نادرًا بتتغير
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

/** بيجيب من النت وبيحدّث الكاش، وبيستسلم بعد مهلة عشان الشبكة الضعيفة متعطلش التطبيق */
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
  if (req.method !== 'GET') return;                      // طلبات الـ API متتكاشش
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // ملفات التطبيق: النت الأول (عشان التحديث ينزل فورًا) والكاش احتياطي
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

  // الباقي (صور، خرايط): الكاش الأول وأسرع
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) { fromNetwork(req, 8000); return cached; }   // بيتحدث في الخلفية
      return fromNetwork(req, 8000).then(r => r || cached);
    })
  );
});
