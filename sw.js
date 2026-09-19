// Service Worker — بيخلي التطبيق يفتح بدون نت، وبياخد التحديثات فورًا لما يكون فيه نت
const CACHE = 'crm-rawafed-v52';

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
    caches.keys().then(keys => {
      // لو كان فيه كاش قديم اتمسح، يبقى دي ترقية مش أول تركيب —
      // وساعتها بس بنقول للمستخدم إن في نسخة جديدة.
      const old = keys.filter(k => k !== CACHE);
      return Promise.all(old.map(k => caches.delete(k)))
        .then(() => self.clients.claim())
        .then(() => { if (old.length) return tellPages({ type: 'sw-updated', cache: CACHE }); });
    })
  );
});

/** بيبلّغ كل صفحات التطبيق المفتوحة */
function tellPages(msg) {
  return self.clients.matchAll({ type: 'window' })
    .then(list => list.forEach(c => { try { c.postMessage(msg); } catch (e) {} }));
}

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

/**
 * الكاش الأول + تحديث في الخلفية.
 *
 * قبل كده كانت "النت الأول بمهلة 2.5 ثانية": يعني كل مرة المندوب يفتح
 * التطبيق يستنى الشبكة ويعيد تحميل ملفات هو مخزّنها أصلًا — وده كان
 * بيزاحم طلب البيانات نفسه على شبكة الموبايل الضعيفة.
 *
 * دلوقتي بيفتح من الكاش فورًا، والتحديث بينزل في الخلفية ويظهر في
 * الفتحة الجاية (والتطبيق بيعرف المستخدم إن في نسخة جديدة).
 */
function cacheFirst(request, timeoutMs) {
  return caches.match(request).then(cached => {
    if (cached) { fromNetwork(request, timeoutMs); return cached; }
    return fromNetwork(request, timeoutMs).then(r => r || cached);
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // طلبات الـ API متتكاشش
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  const isShell = sameOrigin && (
    req.mode === 'navigate' ||
    /\.(html|js|css|json)$/.test(url.pathname) ||
    url.pathname.endsWith('/')
  );

  if (isShell) {
    e.respondWith(
      cacheFirst(req, 8000).then(resp => resp || caches.match('./index.html'))
    );
    return;
  }

  // الباقي (صور، خرايط)
  e.respondWith(cacheFirst(req, 8000));
});

// التطبيق بيقدر يطلب تفعيل النسخة الجديدة على طول
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});
