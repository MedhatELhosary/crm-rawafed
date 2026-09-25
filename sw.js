// Service Worker â€” ط¨ظٹط®ظ„ظٹ ط§ظ„طھط·ط¨ظٹظ‚ ظٹظپطھط­ ط¨ط¯ظˆظ† ظ†طھطŒ ظˆط¨ظٹط§ط®ط¯ ط§ظ„طھط­ط¯ظٹط«ط§طھ ظپظˆط±ظ‹ط§ ظ„ظ…ط§ ظٹظƒظˆظ† ظپظٹظ‡ ظ†طھ
const CACHE = 'crm-rawafed-v66';

// ظ…ظ„ظپط§طھ ط§ظ„طھط·ط¨ظٹظ‚ ظ†ظپط³ظ‡ â€” ط¯ظٹ ط¨طھطھط­ط¯ط« ظƒظ„ ط´ظˆظٹط©
const SHELL = [
  './',
  './index.html',
  './app.css',
  './config.js',
  './app.js',
  './manifest.json'
];
// app-admin.js مش هنا عن قصد: 226 كيلوبايت مش بينزلها غير الأدمن،
// وكانت بتتنزّل على موبايل كل مندوب مع كل ترقية. بتتخزن لوحدها أول
// ما الأدمن يفتح صفحته (الـ fetch تحت بيخزّن أي ملف بيعدي عليه).
// ظ…ظ„ظپط§طھ ط«ط§ط¨طھط© ظ†ط§ط¯ط±ظ‹ط§ ط¨طھطھط؛ظٹط±
// ملفات ثابتة نادرًا بتتغير — بتتخزن مقدمًا لكن **مش شرط تنجح**.
// مكتبة الخرايط جاية من سيرفر بره (unpkg)، وكانت جوه addAll الذرّية —
// يعني بطء أو عطل لحظي عندهم كان بيفشّل تركيب الـ SW كله.
const STATIC = [
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

/**
 * التركيب.
 *
 * addAll ذرّية: لو **ملف واحد** فشل، التركيب كله بيفشل والـ SW عمره ما
 * بيتفعّل — فالتطبيق بيفضل على النسخة القديمة أو بيروح للشبكة في كل
 * طلب. وعلى شبكة مندوب ضعيفة ده كان بيحصل كتير.
 *
 * دلوقتي: ملفات التطبيق نفسها لازم تنجح، والباقي best-effort —
 * كل ملف لوحده، وفشله ميعطلش حاجة لأن أول طلب ليه بيخزّنه.
 */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(SHELL)
        .then(() => Promise.all(STATIC.map(u => c.add(u).catch(() => {}))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      // ظ„ظˆ ظƒط§ظ† ظپظٹظ‡ ظƒط§ط´ ظ‚ط¯ظٹظ… ط§طھظ…ط³ط­طŒ ظٹط¨ظ‚ظ‰ ط¯ظٹ طھط±ظ‚ظٹط© ظ…ط´ ط£ظˆظ„ طھط±ظƒظٹط¨ â€”
      // ظˆط³ط§ط¹طھظ‡ط§ ط¨ط³ ط¨ظ†ظ‚ظˆظ„ ظ„ظ„ظ…ط³طھط®ط¯ظ… ط¥ظ† ظپظٹ ظ†ط³ط®ط© ط¬ط¯ظٹط¯ط©.
      const old = keys.filter(k => k !== CACHE);
      return Promise.all(old.map(k => caches.delete(k)))
        .then(() => self.clients.claim())
        .then(() => { if (old.length) return tellPages({ type: 'sw-updated', cache: CACHE }); });
    })
  );
});

/** ط¨ظٹط¨ظ„ظ‘ط؛ ظƒظ„ طµظپط­ط§طھ ط§ظ„طھط·ط¨ظٹظ‚ ط§ظ„ظ…ظپطھظˆط­ط© */
function tellPages(msg) {
  return self.clients.matchAll({ type: 'window' })
    .then(list => list.forEach(c => { try { c.postMessage(msg); } catch (e) {} }));
}

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

/**
 * ط§ظ„ظƒط§ط´ ط§ظ„ط£ظˆظ„ + طھط­ط¯ظٹط« ظپظٹ ط§ظ„ط®ظ„ظپظٹط©.
 *
 * ظ‚ط¨ظ„ ظƒط¯ظ‡ ظƒط§ظ†طھ "ط§ظ„ظ†طھ ط§ظ„ط£ظˆظ„ ط¨ظ…ظ‡ظ„ط© 2.5 ط«ط§ظ†ظٹط©": ظٹط¹ظ†ظٹ ظƒظ„ ظ…ط±ط© ط§ظ„ظ…ظ†ط¯ظˆط¨ ظٹظپطھط­
 * ط§ظ„طھط·ط¨ظٹظ‚ ظٹط³طھظ†ظ‰ ط§ظ„ط´ط¨ظƒط© ظˆظٹط¹ظٹط¯ طھط­ظ…ظٹظ„ ظ…ظ„ظپط§طھ ظ‡ظˆ ظ…ط®ط²ظ‘ظ†ظ‡ط§ ط£طµظ„ظ‹ط§ â€” ظˆط¯ظ‡ ظƒط§ظ†
 * ط¨ظٹط²ط§ط­ظ… ط·ظ„ط¨ ط§ظ„ط¨ظٹط§ظ†ط§طھ ظ†ظپط³ظ‡ ط¹ظ„ظ‰ ط´ط¨ظƒط© ط§ظ„ظ…ظˆط¨ط§ظٹظ„ ط§ظ„ط¶ط¹ظٹظپط©.
 *
 * ط¯ظ„ظˆظ‚طھظٹ ط¨ظٹظپطھط­ ظ…ظ† ط§ظ„ظƒط§ط´ ظپظˆط±ظ‹ط§طŒ ظˆط§ظ„طھط­ط¯ظٹط« ط¨ظٹظ†ط²ظ„ ظپظٹ ط§ظ„ط®ظ„ظپظٹط© ظˆظٹط¸ظ‡ط± ظپظٹ
 * ط§ظ„ظپطھط­ط© ط§ظ„ط¬ط§ظٹط© (ظˆط§ظ„طھط·ط¨ظٹظ‚ ط¨ظٹط¹ط±ظپ ط§ظ„ظ…ط³طھط®ط¯ظ… ط¥ظ† ظپظٹ ظ†ط³ط®ط© ط¬ط¯ظٹط¯ط©).
 */
function cacheFirst(request, timeoutMs) {
  return caches.match(request).then(cached => {
    if (cached) { fromNetwork(request, timeoutMs); return cached; }
    return fromNetwork(request, timeoutMs).then(r => {
      if (r) return r;
      // مفيش نسخة مخزّنة والمهلة خلصت — **مينفعش** نرجّع null هنا:
      // respondWith بـ null بيبوّظ الطلب خالص، فالمتصفح يقول "فشل" على
      // حاجة كانت شغالة بس بطيئة. بنكمّل من غير مهلة.
      return fetch(request).catch(() => Response.error());
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // ط·ظ„ط¨ط§طھ ط§ظ„ظ€ API ظ…طھطھظƒط§ط´ط´
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // ── نداءات السيرفر متعدّيش من هنا خالص ──
  //
  // الكود القديم كان آخره `e.respondWith(cacheFirst(req, 8000))` بلا أي
  // شرط، فكان بيلف على **كل** طلب GET — ومن ضمنهم نداءات Apps Script.
  // ودي عملت مشكلتين:
  //   (١) ردود السيرفر كانت بتتخزن في الكاش، فممكن التطبيق يقرا رد قديم
  //   (٢) أي نداء عدّى 8 ثواني كان بيتحوّل لفشل نهائي (respondWith بـ null)
  //       بدل ما يستنى — والنداء ده كان ناجح أصلًا، بس بطيء
  // إحنا اتأكدنا من ده بالقياس: لقينا 5 ردود سيرفر متخزنة في كاش الـ SW،
  // وفشل بيحصل عند 8013 و8016 جزء من الثانية بالظبط.
  if (!sameOrigin && url.hostname !== 'unpkg.com') return;

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

  // ط§ظ„ط¨ط§ظ‚ظٹ (طµظˆط±طŒ ط®ط±ط§ظٹط·)
  e.respondWith(cacheFirst(req, 8000));
});

// ط§ظ„طھط·ط¨ظٹظ‚ ط¨ظٹظ‚ط¯ط± ظٹط·ظ„ط¨ طھظپط¹ظٹظ„ ط§ظ„ظ†ط³ط®ط© ط§ظ„ط¬ط¯ظٹط¯ط© ط¹ظ„ظ‰ ط·ظˆظ„
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});
