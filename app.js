'use strict';
/* =====================================================================
   CRM روافد — ملف التطبيق المجمّع (متولّد تلقائيًا — متعدلش فيه)
   عدّل في app/src/*.js وبعدين شغّل build.ps1
   ===================================================================== */

// ==================== [ core.js ] ====================
/* CRM روافد — النواة: الحالة، الاتصال بالسيرفر، أدوات الواجهة، الدخول، والعرض الرئيسي */

/* CRM روافد — التطبيق الرئيسي (مندوب + أدمن) */

// ================== الحالة العامة ==================
const S = {
  token: localStorage.getItem('crm_token') || '',
  user: JSON.parse(localStorage.getItem('crm_user') || 'null'),
  device: localStorage.getItem('crm_device') || '',
  data: JSON.parse(localStorage.getItem('crm_boot') || 'null'),
  queue: JSON.parse(localStorage.getItem('crm_queue') || '[]'),
  liveVisit: JSON.parse(localStorage.getItem('crm_live_visit') || 'null'),
  tab: 'today', adminTab: 'dash',
  custFilter: '', custDay: 'all', leadStage: 'all',
  myPos: null, loading: false
};
const A = {}; // مسجل الأحداث للأزرار
window.A = A;

const DAY_NAMES = ['الجمعة', 'السبت', 'الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس'];
const LEAD_STAGES = ['جديد', 'تم التواصل', 'مهتم', 'اتحول لعميل', 'مش مهتم'];

function todayDayIndex() { // السبت=1 ... الخميس=6، الجمعة=0
  return { 6: 1, 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 0 }[new Date().getDay()];
}
function dayLabel(i) { return ['—', 'السبت', 'الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس'][Number(i)] || '—'; }
/** تاريخ النهارده بتوقيت الجهاز — toISOString بيرجّع توقيت جرينتش فبيقول امبارح بالليل */
function todayISO(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/** الكيبورد العربي بيكتب ٠١٢٣ — بنحولها لأرقام إنجليزية عشان الدخول ميفشلش */
function normDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .trim();
}
/** الهللات بتظهر بس لما تكون موجودة — 285 تفضل 285 و327.75 متتقربش لـ 328 */
function money(n) {
  n = Number(n) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
/** العملة من إعدادات النظام — بتتخزن محليًا عشان تظهر حتى قبل تحميل البيانات */
function cur() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return s.CURRENCY || localStorage.getItem('crm_currency') || 'ر.س';
}
function moneyC(n) { return money(n) + ' ' + cur(); }

// ===== المبلغ بالحروف (لسندات القبض) =====
const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** من 1 لـ 999 */
function arBelow1000(n) {
  const parts = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(AR_HUNDREDS[h]);
  if (r < 20) { if (r) parts.push(AR_ONES[r]); }
  else {
    const u = r % 10, t = Math.floor(r / 10);
    parts.push(u ? AR_ONES[u] + ' و' + AR_TENS[t] : AR_TENS[t]);
  }
  return parts.join(' و');
}
/**
 * صيغة المجموعة حسب آخر جزء من العدد (تمييز العدد):
 * ألف · ألفان · ثلاثة آلاف · أحد عشر ألفًا · مائة ألف · مائتا ألف
 */
function arGroup(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  const words = arBelow1000(n), r = n % 100;
  // مضاعفات المائة بتاخد المفرد مضافًا إليه: «مائة ألف» مش «مائة ألفًا»
  if (r === 0) return words.replace(/مائتان$/, 'مائتا') + ' ' + one;
  if (r >= 3 && r <= 10) return words + ' ' + few;
  return words + ' ' + many;
}
/** رقم صحيح بالحروف العربية */
function arIntWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'صفر';
  if (n > 999999999) return '';           // أكبر من كده مش هيحصل في سند
  const parts = [];
  const mil = Math.floor(n / 1000000);
  const th = Math.floor((n % 1000000) / 1000);
  const rest = n % 1000;
  if (mil) parts.push(arGroup(mil, 'مليون', 'مليونان', 'ملايين', 'مليونًا'));
  if (th) parts.push(arGroup(th, 'ألف', 'ألفان', 'آلاف', 'ألفًا'));
  if (rest) parts.push(arBelow1000(rest));
  return parts.join(' و');
}
/**
 * المبلغ كامل بالحروف زي ما بيتكتب في السندات:
 * "فقط مائة وخمسة عشر ريالاً سعودياً وخمسة وسبعون هللة لا غير"
 */
function amountInWords(amount, unitWord, subWord) {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  const unit = unitWord || s.CURRENCY_WORDS || 'ريالاً سعودياً';
  const sub = subWord || s.SUBUNIT_WORDS || 'هللة';
  const total = Math.round((Number(amount) || 0) * 100);
  const whole = Math.floor(total / 100), cents = total % 100;
  if (!whole && !cents) return 'فقط صفر ' + unit + ' لا غير';
  const bits = [];
  if (whole) bits.push(arIntWords(whole) + ' ' + unit);
  if (cents) bits.push(arIntWords(cents) + ' ' + sub);
  return 'فقط ' + bits.join(' و') + ' لا غير';
}
/** اللوجو بيتخزن على الجهاز — السيرفر بيبعت بصمته بس مع كل تحديث */
function logoSrc() { return localStorage.getItem('crm_logo') || ''; }
async function syncLogo() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  const hash = s.COMPANY_LOGO_HASH;
  if (hash === undefined) return;
  if (!hash) {
    if (localStorage.getItem('crm_logo')) {
      localStorage.removeItem('crm_logo'); localStorage.removeItem('crm_logo_hash'); render();
    }
    return;
  }
  if (localStorage.getItem('crm_logo_hash') === hash && localStorage.getItem('crm_logo')) return;
  try {
    const r = await api('getLogo', {});
    if (r.logo) {
      localStorage.setItem('crm_logo', r.logo);
      localStorage.setItem('crm_logo_hash', r.hash || hash);
      render();
    }
  } catch (e) { /* هنجيبه المرة الجاية */ }
}
function companyName() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return s.COMPANY_NAME || localStorage.getItem('crm_company') || 'CRM روافد';
}
/** بيرسم اللوجو لو مترفع، وإلا بيرجع دايرة فيها أول حرف من اسم الشركة */
function logoHtml(size, cls) {
  const src = logoSrc();
  if (src) return `<img class="logo-img ${cls || ''}" style="width:${size}px;height:${size}px" src="${src}" alt="">`;
  return `<div class="logo-circle ${cls || ''}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px;border-radius:${Math.round(size * 0.3)}px">${esc(companyName()[0] || 'ر')}</div>`;
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
/** وصف مختصر للجهاز — بيظهر للأدمن في قايمة الأجهزة المسجلة */
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'أندرويد' : /iPhone|iPad|iPod/i.test(ua) ? 'آيفون' :
             /Windows/i.test(ua) ? 'ويندوز' : /Mac/i.test(ua) ? 'ماك' : 'جهاز';
  const br = /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : '';
  return (os + (br ? ' — ' + br : '')).slice(0, 60);
}

// ================== الاتصال بالسيرفر ==================
async function api(action, payload, opts) {
  if (!API_URL || API_URL.indexOf('http') !== 0) throw { fatal: 'لسه محددتش لينك السيرفر في ملف config.js' };
  let res;
  try {
    const resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, token: S.token }, payload || {})) });
    res = await resp.json();
  } catch (e) {
    throw { offline: true };
  }
  // الجلسة انتهت — نجددها بتوكن الجهاز (مش بالرقم السري)، ولو فشل نرجّعه لشاشة الدخول
  if (res.error === 'AUTH' && !(opts && opts.noRetry)) {
    if (S.device) {
      try {
        const r = await api('renew', { device: S.device }, { noRetry: true });
        S.token = r.token;
        S.user = r.user;
        localStorage.setItem('crm_token', S.token);
        save('crm_user', S.user);
        return api(action, payload, { noRetry: true });
      } catch (e) { /* الجهاز اتلغى أو انتهت صلاحيته */ }
    }
    doLogout();
    toast('انتهت الجلسة — سجل دخول تاني', 'err');
    throw { fatal: 'انتهت الجلسة، سجل دخول تاني' };
  }
  if (!res.ok) throw { msg: res.error || res.message || 'حصل خطأ' };
  return res;
}

/**
 * بيحط العملية في طابور الأوفلاين. بيرجّع false لو مساحة الجهاز خلصت —
 * السندات بقت جواها صورة، فلازم المندوب يعرف إن الحفظ فشل مش يفتكره اتحفظ.
 */
function qpush(action, payload) {
  S.queue.push({ action, payload, ts: Date.now() });
  try {
    save('crm_queue', S.queue);
  } catch (e) {
    S.queue.pop();
    toast('📵 مساحة الجهاز خلصت — السند مااتحفظش. اتصل بالنت وحاول تاني', 'err');
    return false;
  }
  render();
  return true;
}

async function qflush() {
  if (!S.queue.length || !navigator.onLine) return;
  const batch = S.queue.slice();
  try {
    await api('syncOffline', { queue: batch });
    S.queue = S.queue.slice(batch.length);
    save('crm_queue', S.queue);
    toast('✅ اترفعت ' + batch.length + ' عملية كانت متخزنة أوفلاين', 'ok');
    refresh(true);
  } catch (e) { /* هنحاول تاني بعدين */ }
}

async function refresh(silent) {
  if (!S.token) return;
  if (!silent) S.loading = true, render();
  try {
    const action = S.user && S.user.role === 'admin' ? 'adminData' : 'bootstrap';
    // التحديث الجزئي: بنبعت بصمات اللي عندنا والسيرفر بيبعت المتغير بس
    const res = await api(action, { hashes: (S.data && S.data.hashes) || null });
    if (res.unchanged && res.unchanged.length && S.data) {
      res.unchanged.forEach(k => { if (S.data[k] !== undefined) res[k] = S.data[k]; });
    }
    S.data = res;
    save('crm_boot', res);
    // تخزين هوية الشركة محليًا عشان تظهر في شاشة الدخول قبل تحميل البيانات
    const st = res.settings || res.allSettings || {};
    if (st.CURRENCY) localStorage.setItem('crm_currency', st.CURRENCY);
    if (st.COMPANY_NAME) localStorage.setItem('crm_company', st.COMPANY_NAME);
    syncLogo();       // اللوجو بيتحمّل مرة واحدة بس لو اتغير
    syncProducts();   // وكذلك كتالوج الأصناف
  } catch (e) {
    if (!silent && !e.offline) toast(e.msg || e.fatal || 'مشكلة في التحديث', 'err');
    if (e.offline && !silent) toast('📴 مفيش نت — شغال بآخر بيانات محفوظة');
  }
  S.loading = false;
  render();
}

// ================== أدوات الواجهة ==================
function $(sel) { return document.querySelector(sel); }
function toast(msg, cls) {
  const el = document.createElement('div');
  el.className = 'toast ' + (cls || '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}
let modalCleanup = null;
function openModal(html, onOpen, wide) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)A.closeModal()">' +
    '<div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>';
  if (onOpen) modalCleanup = onOpen() || null;
}
function closeModal() {
  if (modalCleanup) { try { modalCleanup(); } catch (e) {} modalCleanup = null; }
  $('#modal-root').innerHTML = '';
}
A.closeModal = closeModal;

function getPosition(timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('الجهاز مش بيدعم تحديد المواقع'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }),
      err => reject(new Error('مقدرتش أجيب اللوكيشن — فعّل الـ GPS واسمح للتطبيق بالوصول للموقع')),
      { enableHighAccuracy: true, timeout: timeoutMs || 15000, maximumAge: 30000 }
    );
  });
}
function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
function mapsLink(lat, lng) { return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng; }

// اختيار لوكيشن على الخريطة
function openMapPicker(lat, lng, cb) {
  const startLat = Number(lat) || 30.0444, startLng = Number(lng) || 31.2357;
  openModal(`
    <h2>حدد اللوكيشن على الخريطة</h2>
    <p class="modal-sub">حرّك الدبوس أو دوس على المكان الصح</p>
    <button class="btn ghost sm" onclick="A.mapUseMyPos()">📍 استخدم موقعي الحالي</button>
    <div id="map-pick"></div>
    <div class="modal-actions">
      <button class="btn" onclick="A.mapConfirm()">تأكيد اللوكيشن ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`, () => {
    const map = L.map('map-pick').setView([startLat, startLng], (lat ? 16 : 12));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
    map.on('click', e => marker.setLatLng(e.latlng));
    A._map = map; A._marker = marker; A._mapCb = cb;
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); A._map = A._marker = A._mapCb = null; };
  });
}
A.mapUseMyPos = async () => {
  try {
    const p = await getPosition();
    A._marker.setLatLng([p.lat, p.lng]);
    A._map.setView([p.lat, p.lng], 17);
  } catch (e) { toast(e.message, 'err'); }
};
A.mapConfirm = () => {
  const ll = A._marker.getLatLng();
  const cb = A._mapCb;
  closeModal();
  cb({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
};

// ================== الدخول والخروج ==================
function doLogout() {
  stopTracking(true);
  ['crm_token', 'crm_user', 'crm_creds', 'crm_device', 'crm_boot', 'crm_live_visit'].forEach(k => localStorage.removeItem(k));
  S.token = ''; S.user = null; S.data = null; S.liveVisit = null; S.device = '';
  render();
}
A.logout = async () => {
  if (!confirm('متأكد إنك عاوز تسجل خروج؟')) return;
  const dev = S.device;
  if (dev) { try { await api('logoutDevice', { device: dev }); } catch (e) {} }
  doLogout();
};

A.login = async () => {
  const username = normDigits($('#login-user').value).toLowerCase();
  const pin = normDigits($('#login-pin').value);
  if (!username || !pin) return toast('اكتب اسم المستخدم والرقم السري', 'err');
  const btn = $('#login-btn'); btn.disabled = true; btn.textContent = 'ثواني...';
  try {
    const res = await api('login', { username, pin, device: deviceLabel() }, { noRetry: true });
    S.token = res.token; S.user = res.user; S.device = res.device || '';
    localStorage.setItem('crm_token', S.token);
    localStorage.setItem('crm_device', S.device);
    localStorage.removeItem('crm_creds');   // مبقيناش نخزّن الرقم السري على الجهاز
    save('crm_user', S.user);
    S.tab = 'today'; S.adminTab = 'dash';
    render();
    await refresh();
    if (S.user.role === 'rep') await checkGpsPermission();
    ensureTracking(true);
  } catch (e) {
    toast(e.msg || e.fatal || (e.offline ? 'مفيش نت — جرب تاني' : 'حصل خطأ'), 'err');
    btn.disabled = false; btn.textContent = 'دخول';
  }
};

// ================== العرض الرئيسي ==================
function render() {
  const app = $('#app');
  document.body.classList.toggle('is-offline', !navigator.onLine);
  if (!S.token || !S.user) { app.innerHTML = viewLogin(); return; }
  document.body.classList.toggle('admin', S.user.role === 'admin');
  if (gpsBlocked()) { app.innerHTML = viewGpsGate(); return; }
  app.innerHTML = S.user.role === 'admin' ? viewAdmin() : viewRep();
}

function viewLogin() {
  return `<div class="login-wrap">
    ${logoHtml(86)}
    <div class="login-card">
      <h1>${esc(companyName())}</h1>
      <p class="sub">نظام إدارة الزيارات والعملاء والتحصيلات</p>
      <label>اسم المستخدم</label>
      <input id="login-user" autocomplete="username" placeholder="مثال: ahmed">
      <label>الرقم السري</label>
      <input id="login-pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••" onkeydown="if(event.key==='Enter')A.login()">
      <button id="login-btn" class="btn full mt" onclick="A.login()">دخول</button>
    </div>
  </div>`;
}

/** شاشة إجبارية: التطبيق مبيشتغلش من غير إذن الموقع */
function viewGpsGate() {
  const noSupport = !navigator.geolocation;
  return `<div class="gate">
    <div class="gate-icon">📍</div>
    <h1>${noSupport ? 'الجهاز مش بيدعم تحديد الموقع' : 'لازم تفعّل الوصول للموقع'}</h1>
    <p>التطبيق مش هيشتغل من غير اللوكيشن، لأن تسجيل الزيارات وخط السير بيعتمدوا عليه.</p>
    ${noSupport ? '' : `
    <div class="gate-steps">
      <b>على أندرويد (Chrome):</b>
      <ol>
        <li>افتح <b>إعدادات الموبايل</b> ← <b>الموقع (Location)</b> وشغّله</li>
        <li>ارجع للتطبيق واضغط على 🔒 أو ⓘ جنب العنوان فوق</li>
        <li>اختار <b>أذونات الموقع</b> ← <b>السماح</b></li>
        <li>اقفل التطبيق وافتحه تاني</li>
      </ol>
      <b>على آيفون (Safari):</b>
      <ol>
        <li><b>الإعدادات</b> ← <b>الخصوصية</b> ← <b>خدمات الموقع</b> ← شغّلها</li>
        <li>انزل لـ <b>Safari</b> واختار <b>أثناء استخدام التطبيق</b></li>
      </ol>
    </div>`}
    <button class="btn full" onclick="A.recheckGps()">🔄 فعّلته — افحص تاني</button>
    <button class="btn outline full mt" onclick="A.logout()">تسجيل خروج</button>
    <p class="gate-note">لو المشكلة مستمرة كلم الإدارة.</p>
  </div>`;
}

function topbar(subtitle) {
  return `<div class="topbar">
    <div class="flex" style="flex:1;gap:10px">
      ${logoHtml(36, 'topbar-logo')}
      <div style="flex:1"><div class="title">${esc(companyName())}</div><div class="sub">${esc(subtitle)}</div></div>
    </div>
    <div class="flex" style="flex:none">
      ${(S.user && S.user.role === 'rep' && TRK.watchId !== null) ? '<span class="track-dot" title="تتبع خط السير شغال">🟢</span>' : ''}
      ${S.queue.length ? '<span class="pending-badge">⏳ ' + S.queue.length + ' معلقة</span>' : ''}
      <span class="offline-badge">أوفلاين</span>
      <button class="btn sm ghost" onclick="A.doRefresh()" ${S.loading ? 'disabled' : ''}>${S.loading ? '⏳' : '🔄'}</button>
      ${S.user && S.user.role === 'admin' ? '<button class="btn sm ghost" onclick="A.logout()" title="تسجيل خروج">🚪 خروج</button>' : ''}
    </div>
  </div>`;
}
A.doRefresh = () => { qflush(); flushTrack(); ensureTracking(true); refresh(); };

// ==================== [ rep.js ] ====================
/* CRM روافد — واجهة المندوب: اليوم، المتابعات، العملاء، سجلي، حسابي */

// ================== واجهة المندوب ==================
function viewRep() {
  const unread = ((S.data || {}).notifications || []).length;
  const fuCount = S.fu ? (S.fu.late.length + S.fu.today.length) : 0;
  const tabs = [
    ['today', '📅', 'اليوم'], ['followups', '📌', 'متابعات'], ['customers', '👥', 'العملاء'],
    ['mine', '📒', 'سجلي'], ['leads', '🎯', 'ليدز'], ['notifs', '🔔', 'تنبيهات'],
    ['me', '👤', 'حسابي']
  ];
  let body = '';
  if (TRK.failCount > 0 && TRK.failCount < 3) body += `<div class="card" style="border-right:4px solid var(--amber)">
    <b>⚠️ مش قادر أقرا موقعك</b>
    <p class="muted">اتأكد إن الـ GPS مفتوح وإنك مش في مكان مغلق. لو فضل كده التطبيق هيقف.</p></div>`;
  if (!S.data) body += '<div class="empty"><div class="big">⏳</div>بيحمل البيانات...<br><button class="btn mt" onclick="A.doRefresh()">حاول تاني</button></div>';
  else if (S.tab === 'today') body += viewToday();
  else if (S.tab === 'followups') body = viewFollowups();
  else if (S.tab === 'customers') body = viewCustomers();
  else if (S.tab === 'mine') body = viewMine();
  else if (S.tab === 'leads') body = viewLeads();
  else if (S.tab === 'notifs') body = viewNotifs();
  else if (S.tab === 'me') body = viewMe();

  return topbar(S.user.name) + '<div class="page">' + body + '</div>' +
    '<div class="bottomnav">' + tabs.map(t =>
      `<button class="${S.tab === t[0] ? 'active' : ''}" onclick="A.tab('${t[0]}')">
        <span class="ico">${t[1]}</span>${t[2]}
        ${t[0] === 'followups' && fuCount ? '<span class="dot">' + fuCount + '</span>' : ''}
        ${t[0] === 'notifs' && unread ? '<span class="dot">' + unread + '</span>' : ''}
      </button>`).join('') + '</div>';
}
A.tab = t => { S.tab = t; render(); window.scrollTo(0, 0); };

function myCustomers() { return (S.data.customers || []).filter(c => String(c.status) !== 'موقوف'); }
function custById(id) { return (S.data.customers || []).find(c => String(c.id) === String(id)); }

function priorityBadge(c) {
  const p = Number(c.priority_score) || 0;
  if (p >= 70) return '<span class="badge hot">🔥 أولوية عالية ' + p + '</span>';
  if (p >= 40) return '<span class="badge warm">⚡ أولوية متوسطة ' + p + '</span>';
  return '<span class="badge cool">✓ منتظم</span>';
}

function custCard(c, showDay) {
  const dist = (S.myPos && c.lat && c.lng) ? distMeters(S.myPos.lat, S.myPos.lng, Number(c.lat), Number(c.lng)) : null;
  return `<div class="cust-card">
    <div class="cust-head">
      <div>
        <div class="cust-name">${esc(c.name)}</div>
        <div class="cust-meta">${esc(c.address || '')}${showDay ? ' • يوم ' + dayLabel(c.visit_day) : ''}
          ${dist != null ? ' • على بعد ' + (dist < 1000 ? dist + ' م' : (dist / 1000).toFixed(1) + ' كم') : ''}</div>
      </div>
      ${priorityBadge(c)}
    </div>
    ${Number(c.overdue) > 0 ? '<div class="mt"><span class="badge hot">💰 متأخرات ' + moneyC(c.overdue) + '</span></div>' : ''}
    <div class="cust-actions">
      <button class="btn sm green" onclick="A.checkin('${c.id}')">✔ تسجيل وصول</button>
      <button class="btn sm ghost" onclick="A.custDetails('${c.id}')">التفاصيل</button>
      ${c.phone ? '<a class="btn sm outline" href="tel:' + esc(c.phone) + '">📞</a>' : ''}
      ${c.lat ? '<a class="btn sm outline" target="_blank" href="' + mapsLink(c.lat, c.lng) + '">🧭 وديني</a>' : ''}
    </div>
  </div>`;
}

// ----- تبويب اليوم -----
function viewToday() {
  const dayIdx = todayDayIndex();
  let html = '';
  // زيارة جارية
  if (S.liveVisit) {
    const c = custById(S.liveVisit.customer_id);
    html += `<div class="visit-live">
      <b>🟢 زيارة جارية: ${esc(c ? c.name : '')}</b>
      <div style="font-size:13px;opacity:.9">بدأت ${esc(S.liveVisit.checkin_time)}${S.liveVisit.inRange === false ? ' — ⚠️ بعيد عن لوكيشن العميل' : ''}</div>
      <button class="btn" onclick="A.checkoutForm()">إنهاء الزيارة وكتابة التقرير ←</button>
    </div>`;
  }
  // المتابعات المستحقة بتظهر فوق خالص — أول حاجة يشوفها المندوب
  if (!S.fu) A.loadFollowups();
  const due = S.fu ? S.fu.late.concat(S.fu.today) : [];
  if (due.length) {
    html += `<div class="card" style="border-right:4px solid ${S.fu.late.length ? 'var(--red)' : 'var(--amber)'}">
      <b>📌 عندك ${due.length} متابعة مستحقة${S.fu.late.length ? ' (منهم ' + S.fu.late.length + ' متأخرة)' : ''}</b>
      <div class="muted">${due.slice(0, 3).map(x =>
        esc(x.customer_name) + (x.amount ? ' — ' + moneyC(x.amount) : '')).join(' • ')}${due.length > 3 ? ' ...' : ''}</div>
      <button class="btn sm amber mt" onclick="A.tab('followups')">افتح المتابعات ←</button>
    </div>`;
  }
  const k = S.data.kpis || {};
  html += `<div class="kpi-grid">
    <div class="kpi"><div class="num">${k.visitsToday || 0}</div><div class="lbl">زيارات اليوم</div></div>
    <div class="kpi"><div class="num">${k.visitsMonth || 0}${k.visitsTarget ? ' / ' + k.visitsTarget : ''}</div><div class="lbl">زيارات الشهر</div>
      ${k.visitsTarget ? '<div class="bar"><i style="width:' + Math.min(100, k.visitsMonth / k.visitsTarget * 100) + '%"></i></div>' : ''}</div>
  </div>`;

  if (dayIdx === 0) {
    html += '<div class="empty"><div class="big">🌿</div>النهارده جمعة — أجازة سعيدة!<br>تقدر تشوف عملاءك من تبويب العملاء.</div>';
    return html;
  }
  const list = myCustomers().filter(c => Number(c.visit_day) === dayIdx);
  const sorted = (S.routeOrder && S.routeOrder.length)
    ? S.routeOrder.map(id => list.find(c => String(c.id) === String(id))).filter(Boolean)
        .concat(list.filter(c => S.routeOrder.indexOf(String(c.id)) === -1))
    : sortByPriorityAndDistance(list);
  html += `<div class="section-title"><span>خط سير ${dayLabel(dayIdx)} (${list.length} عميل)</span></div>
    <div class="flex" style="margin-bottom:10px">
      <button class="btn sm ghost" onclick="A.sortNearMe()">📍 رتب بالأقرب ليا</button>
      <button class="btn sm amber" onclick="A.optimizeRoute()">🚗 أقصر طريق</button>
    </div>
    ${S.routeInfo ? `<div class="card" style="border-right:4px solid var(--amber)">
      <b>🚗 خط سير محسوب:</b> ${S.routeInfo.stops} محطة — حوالي ${S.routeInfo.km} كم
      <div class="flex mt">
        <a class="btn sm" target="_blank" href="${S.routeInfo.mapsUrl}">🗺️ افتح المسار في خرايط جوجل</a>
        <button class="btn sm outline" onclick="A.clearRoute()">إلغاء الترتيب</button>
      </div>
      ${S.routeInfo.trimmed ? '<div class="muted mt">خرايط جوجل بتقبل 10 محطات بس — المسار فيها لأول 10.</div>' : ''}
    </div>` : ''}`;
  if (!list.length) html += '<div class="empty"><div class="big">🗺️</div>مفيش عملاء متحددين لليوم ده.<br>الأدمن بيقسم خط السير من الداشبورد.</div>';
  else html += sorted.map(c => custCard(c, false)).join('');

  // أولويات خارج خط سير اليوم
  const urgent = myCustomers().filter(c => Number(c.visit_day) !== dayIdx && Number(c.priority_score) >= 70)
    .sort((a, b) => Number(b.priority_score) - Number(a.priority_score)).slice(0, 5);
  if (urgent.length) {
    html += '<div class="section-title"><span>🔥 عملاء أولوية عالية خارج خط سير اليوم</span></div>';
    html += urgent.map(c => custCard(c, true)).join('');
  }
  return html;
}

function sortByPriorityAndDistance(list) {
  return list.slice().sort((a, b) => {
    if (S.myPos && a.lat && b.lat) {
      const da = distMeters(S.myPos.lat, S.myPos.lng, Number(a.lat), Number(a.lng));
      const db = distMeters(S.myPos.lat, S.myPos.lng, Number(b.lat), Number(b.lng));
      // مزيج: الأقرب + الأولوية (كل 100 نقطة أولوية = كأنه أقرب 2 كم)
      return (da - Number(a.priority_score) * 20) - (db - Number(b.priority_score) * 20);
    }
    return (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0);
  });
}
A.sortNearMe = async () => {
  try {
    toast('📍 بجيب موقعك...');
    S.myPos = await getPosition();
    S.routeOrder = null; S.routeInfo = null;
    render();
    toast('اترتبوا بالأقرب ليك ✅', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};
A.clearRoute = () => { S.routeOrder = null; S.routeInfo = null; render(); };

/**
 * أقصر طريق (خوارزمية الأقرب-فالأقرب): بيبدأ من مكانك ويروح لأقرب عميل،
 * ومنه لأقرب عميل بعده... لحد ما يخلص كل عملاء اليوم.
 */
A.optimizeRoute = async () => {
  const dayIdx = todayDayIndex();
  const all = myCustomers().filter(c => Number(c.visit_day) === dayIdx);
  const located = all.filter(c => c.lat && c.lng);
  if (located.length < 2) return toast('محتاج عميلين على الأقل بلوكيشن محدد', 'err');
  try {
    toast('📍 بجيب موقعك...');
    S.myPos = await getPosition();
  } catch (e) { return toast(e.message, 'err'); }

  // العملاء اللي اتزاروا النهارده بيتشالوا من المسار
  const today = new Date().toISOString().slice(0, 10);
  const doneIds = {};
  (S.data.visits || []).forEach(v => {
    if (String(v.date).slice(0, 10) === today && v.status === 'تمت') doneIds[String(v.customer_id)] = true;
  });
  const pending = located.filter(c => !doneIds[String(c.id)]);
  if (!pending.length) return toast('خلصت كل عملاء النهارده 👏', 'ok');

  const remaining = pending.slice();
  const order = [];
  let cur = { lat: S.myPos.lat, lng: S.myPos.lng };
  let total = 0;
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    remaining.forEach((c, i) => {
      const d = distMeters(cur.lat, cur.lng, Number(c.lat), Number(c.lng));
      if (d < bd) { bd = d; bi = i; }
    });
    const next = remaining.splice(bi, 1)[0];
    total += bd;
    order.push(next);
    cur = { lat: Number(next.lat), lng: Number(next.lng) };
  }

  // رابط خرايط جوجل (بتقبل 10 محطات كحد أقصى)
  const stops = order.slice(0, 10);
  const dest = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1).map(c => c.lat + ',' + c.lng).join('|');
  const mapsUrl = 'https://www.google.com/maps/dir/?api=1' +
    '&origin=' + S.myPos.lat + ',' + S.myPos.lng +
    '&destination=' + dest.lat + ',' + dest.lng +
    (waypoints ? '&waypoints=' + encodeURIComponent(waypoints) : '') +
    '&travelmode=driving';

  S.routeOrder = order.map(c => String(c.id));
  S.routeInfo = {
    stops: order.length, km: Math.round(total / 100) / 10,
    mapsUrl: mapsUrl, trimmed: order.length > 10
  };
  render();
  toast('🚗 المسار اتحسب: ' + order.length + ' محطة — ' + S.routeInfo.km + ' كم', 'ok');
};

// ----- تسجيل الوصول -----
A.checkin = async (custId) => {
  if (S.liveVisit) return toast('عندك زيارة جارية — اقفلها الأول', 'err');
  const c = custById(custId);
  if (!c) return;
  let pos = null;
  try { toast('📍 بجيب موقعك...'); pos = await getPosition(); } catch (e) { toast(e.message, 'err'); }

  // لو العميل ملوش لوكيشن والمندوب واقف عنده — نحفظ اللوكيشن
  if (pos && (!c.lat || !c.lng)) {
    openModal(`
      <h2>العميل ده لسه ملوش لوكيشن</h2>
      <p class="modal-sub">إنت واقف قدام ${esc(c.name)} دلوقتي؟</p>
      <div class="modal-actions" style="flex-direction:column">
        <button class="btn green" onclick="A.saveLocAndCheckin('${c.id}', true)">✔ أيوه — احفظ موقعي الحالي كلوكيشن العميل</button>
        <button class="btn ghost" onclick="A.pickLocForCustomer('${c.id}', true)">🗺️ لأ — هحدد لوكيشنه يدوي على الخريطة</button>
        <button class="btn outline" onclick="A.saveLocAndCheckin('${c.id}', false)">كمّل تسجيل الوصول من غير حفظ لوكيشن</button>
      </div>`);
    A._pendingPos = pos;
    return;
  }
  await doCheckin(c, pos);
};

A.saveLocAndCheckin = async (custId, saveLoc) => {
  closeModal();
  const c = custById(custId);
  const pos = A._pendingPos;
  if (saveLoc && pos) {
    c.lat = pos.lat; c.lng = pos.lng; c.location_source = 'GPS من الموقع';
    try { await api('setCustomerLocation', { customer_id: custId, lat: pos.lat, lng: pos.lng, source: 'gps' }); toast('📍 اتحفظ لوكيشن العميل', 'ok'); }
    catch (e) { if (e.offline) qpush('setCustomerLocation', { customer_id: custId, lat: pos.lat, lng: pos.lng, source: 'gps' }); }
  }
  await doCheckin(c, pos);
};

A.pickLocForCustomer = (custId, thenCheckin) => {
  const c = custById(custId);
  openMapPicker(c.lat, c.lng, async (ll) => {
    c.lat = ll.lat; c.lng = ll.lng; c.location_source = 'تحديد يدوي على الخريطة';
    try { await api('setCustomerLocation', { customer_id: custId, lat: ll.lat, lng: ll.lng, source: 'manual' }); toast('📍 اتحفظ لوكيشن العميل', 'ok'); }
    catch (e) { if (e.offline) { qpush('setCustomerLocation', { customer_id: custId, lat: ll.lat, lng: ll.lng, source: 'manual' }); toast('اتحفظ محليًا وهيترفع لما النت يرجع'); } else toast(e.msg || 'خطأ', 'err'); }
    if (thenCheckin) await doCheckin(c, A._pendingPos);
    else render();
  });
};

async function doCheckin(c, pos) {
  const nowTime = new Date().toTimeString().slice(0, 5);
  if (pos) pushTrackPoint(pos.lat, pos.lng, pos.acc, 'وصول: ' + c.name);
  const payload = { customer_id: c.id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '' };
  try {
    const res = await api('checkin', payload);
    S.liveVisit = { visit_id: res.visit_id, customer_id: c.id, checkin_time: nowTime, lat: payload.lat, lng: payload.lng, distance_m: res.distance_m, inRange: res.inRange, local: false };
    if (res.inRange === false) toast('⚠️ إنت على بعد ' + res.distance_m + ' م من لوكيشن العميل المسجل', 'err');
    else toast('✅ اتسجل وصولك عند ' + c.name, 'ok');
  } catch (e) {
    if (e.offline) {
      const dm = (pos && c.lat) ? distMeters(pos.lat, pos.lng, Number(c.lat), Number(c.lng)) : '';
      S.liveVisit = { visit_id: '', customer_id: c.id, checkin_time: nowTime, lat: payload.lat, lng: payload.lng, distance_m: dm, inRange: null, local: true };
      toast('📴 مفيش نت — الزيارة اتسجلت محليًا وهتترفع تلقائي', 'ok');
    } else { toast(e.msg || 'خطأ', 'err'); return; }
  }
  save('crm_live_visit', S.liveVisit);
  S.tab = 'today';
  render();
}

// ----- إنهاء الزيارة -----
A.checkoutForm = () => {
  const c = custById(S.liveVisit.customer_id);
  A._visitPhotos = [];
  openModal(`
    <h2>تقرير زيارة: ${esc(c ? c.name : '')}</h2>
    <label>نتيجة الزيارة</label>
    <select id="v-status">
      <option value="تمت">تمت الزيارة ✔</option>
      <option value="العميل مقفول">المحل/العميل مقفول</option>
      <option value="مؤجلة">اتأجلت بطلب العميل</option>
    </select>
    <label>حصل إيه في الزيارة؟</label>
    <select id="v-outcome">
      <option value="">— اختار —</option>
      <option>طلبية جديدة</option><option>تحصيل دفعة</option><option>طلبية + تحصيل</option>
      <option>عرض أصناف جديدة</option><option>حل شكوى</option><option>متابعة عادية</option><option>مفيش نتيجة</option>
    </select>
    <label>تفاصيل التقرير</label>
    <textarea id="v-report" rows="3" placeholder="اكتب اللي حصل: الطلبية، الملاحظات، وعود الدفع..."></textarea>
    ${micButton('v-report')}
    <label>صور الزيارة (اختياري)</label>
    <input type="file" id="v-photo" accept="image/*" capture="environment" style="display:none" onchange="A.visitPhotoPick(this)">
    <button type="button" class="btn sm ghost" onclick="document.getElementById('v-photo').click()">📷 صوّر / ارفع صورة</button>
    <div id="v-photos" class="thumb-row"></div>
    <div class="card" style="border-right:4px solid var(--green)">
      <b>💰 وعد بالدفع (لو العميل وعد)</b>
      <div class="grid2">
        <div><label>المبلغ (${esc(cur())})</label><input id="v-promise-amount" type="text" inputmode="decimal" placeholder="0"></div>
        <div><label>تاريخ الوعد</label><input id="v-promise-date" type="date"></div>
      </div>
      <p class="muted">هيفضل يفكّرك بيه لحد ما تقفله — ومش هيضيع.</p>
    </div>
    <label>الخطوة الجاية (اختياري)</label>
    <input id="v-next" placeholder="مثال: يراجع المخزن ويرد">
    <label>تاريخها</label>
    <input id="v-next-date" type="date">
    <div class="modal-actions">
      <button class="btn green" onclick="A.checkoutSave()">حفظ وإنهاء ✔</button>
      <button class="btn outline" onclick="A.closeModal()">رجوع</button>
    </div>`);
};

/** الصور بتتخزن مؤقتًا في الذاكرة وبترفع بعد ما الزيارة تتسجل */
A.visitPhotoPick = async (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = '';
  const max = Number(((S.data && S.data.settings) || {}).MAX_VISIT_PHOTOS) || 3;
  A._visitPhotos = A._visitPhotos || [];
  if (A._visitPhotos.length >= max) return toast('أقصى عدد صور ' + max, 'err');
  try {
    const data = await shrinkImage(file, 1200, 0.7);
    A._visitPhotos.push(data);
    const box = document.getElementById('v-photos');
    box.innerHTML = A._visitPhotos.map((d, i) =>
      `<div class="thumb"><img src="${d}"><button type="button" onclick="A.visitPhotoDel(${i})">✕</button></div>`).join('');
    toast('📷 الصورة جاهزة — هترفع مع الزيارة', 'ok');
  } catch (e) { toast(e.message || 'مشكلة في الصورة', 'err'); }
};
A.visitPhotoDel = (i) => {
  A._visitPhotos.splice(i, 1);
  document.getElementById('v-photos').innerHTML = A._visitPhotos.map((d, k) =>
    `<div class="thumb"><img src="${d}"><button type="button" onclick="A.visitPhotoDel(${k})">✕</button></div>`).join('');
};

A.checkoutSave = async () => {
  stopMic();
  const lv = S.liveVisit;
  const c = custById(lv.customer_id);
  const form = {
    status: $('#v-status').value, outcome: $('#v-outcome').value,
    report: $('#v-report').value.trim(), next_action: $('#v-next').value.trim(),
    next_action_date: $('#v-next-date').value,
    promise_amount: normDigits(($('#v-promise-amount') || {}).value || ''),
    promise_date: ($('#v-promise-date') || {}).value || ''
  };
  if (Number(form.promise_amount) > 0 && !form.promise_date) {
    return toast('حدد تاريخ وعد الدفع', 'err');
  }
  const photos = (A._visitPhotos || []).slice();
  const outTime = new Date().toTimeString().slice(0, 5);
  if (S.myPos) pushTrackPoint(S.myPos.lat, S.myPos.lng, S.myPos.acc, 'انصراف: ' + (c ? c.name : ''));
  closeModal();
  try {
    if (lv.local || !lv.visit_id) throw { offline: true };
    await api('checkout', Object.assign({ visit_id: lv.visit_id }, form));
    toast('✅ الزيارة اتسجلت بنجاح', 'ok');
    // رفع الصور بعد ما الزيارة اتسجلت
    for (let i = 0; i < photos.length; i++) {
      try {
        toast('⏳ برفع صورة ' + (i + 1) + ' من ' + photos.length);
        await uploadAttachment('visit', lv.visit_id, 'photo', photos[i]);
      } catch (e) { toast('صورة ' + (i + 1) + ' مترفعتش: ' + (e.msg || ''), 'err'); }
    }
    if (photos.length) toast('📷 الصور اترفعت', 'ok');
  } catch (e) {
    if (e.offline) {
      const [h1, m1] = lv.checkin_time.split(':').map(Number);
      const [h2, m2] = outTime.split(':').map(Number);
      qpush('quickVisit', Object.assign({
        customer_id: lv.customer_id, date: new Date().toISOString().slice(0, 10),
        checkin_time: lv.checkin_time, checkout_time: outTime,
        duration_min: Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1)),
        lat: lv.lat, lng: lv.lng, distance_m: lv.distance_m, visit_type: 'ميدانية'
      }, form));
      toast('📴 التقرير اتحفظ محليًا وهيترفع تلقائي', 'ok');
    } else toast(e.msg || 'خطأ', 'err');
  }
  if (c && form.status === 'تمت') c.last_visit_date = new Date().toISOString().slice(0, 10);
  S.liveVisit = null;
  localStorage.removeItem('crm_live_visit');
  render();
  qflush();
  refresh(true);
}

// ----- تبويب المتابعات ووعود الدفع -----
function viewFollowups() {
  if (!S.fu) { A.loadFollowups(); return '<div class="empty"><div class="big">⏳</div>بيحمل متابعاتك...</div>'; }
  const f = S.fu;
  const card = (x, late) => `
    <div class="cust-card" style="border-right:4px solid ${late ? 'var(--red)' : x.type === 'وعد دفع' ? 'var(--green)' : 'var(--blue)'}">
      <div class="cust-head">
        <div>
          <div class="cust-name">${esc(x.customer_name)}</div>
          <div class="cust-meta">${x.type === 'وعد دفع' ? '💰 وعد دفع' : '📌 متابعة'} • ${esc(x.due_date)}
            ${late ? '<span class="badge hot">متأخرة ' + x.lateDays + ' يوم</span>' : ''}</div>
        </div>
        ${x.amount ? '<b class="pos">' + moneyC(x.amount) + '</b>' : ''}
      </div>
      ${x.note ? '<div class="muted mt">' + esc(x.note) + '</div>' : ''}
      <div class="cust-actions">
        <button class="btn sm green" onclick="A.fuClose('${x.id}')">✔ تم</button>
        <button class="btn sm amber" onclick="A.fuPostpone('${x.id}')">📅 أجّل</button>
        <button class="btn sm ghost" onclick="A.custDetails('${x.customer_id}')">العميل</button>
        <button class="btn sm outline" onclick="A.fuCancel('${x.id}')">إلغاء</button>
      </div>
    </div>`;
  return `
    ${f.late.length ? '<div class="section-title"><span style="color:var(--red)">⚠️ متأخرة عن ميعادها (' + f.late.length + ')</span></div>' + f.late.map(x => card(x, true)).join('') : ''}
    <div class="section-title"><span>📌 مستحقة النهارده (${f.today.length})</span></div>
    ${f.today.length ? f.today.map(x => card(x, false)).join('') : '<div class="empty">مفيش متابعات النهارده 👍</div>'}
    ${f.upcoming.length ? '<div class="section-title"><span>الجاية (' + f.upcoming.length + ')</span></div>' +
      f.upcoming.map(x => `<div class="cust-card" style="padding:10px 12px">
        <div class="cust-head"><div><div class="cust-name" style="font-size:14px">${esc(x.customer_name)}</div>
        <div class="cust-meta">${x.type === 'وعد دفع' ? '💰' : '📌'} ${esc(x.due_date)} ${x.note ? '— ' + esc(x.note) : ''}</div></div>
        ${x.amount ? '<b>' + moneyC(x.amount) + '</b>' : ''}</div></div>`).join('') : ''}
    ${f.done.length ? '<div class="section-title"><span>اتقفلت مؤخرًا</span></div>' +
      f.done.slice(0, 10).map(x => `<div class="stat-line"><span>${esc(x.customer_name)} — ${esc(x.type)}</span>
        <b class="${x.status === 'تم' ? 'pos' : 'muted'}">${esc(x.status)}</b></div>`).join('') : ''}`;
}

A.loadFollowups = async () => {
  if (A._fuLoading) return;
  A._fuLoading = true;
  try { S.fu = await api('followups', {}); render(); }
  catch (e) { if (!e.offline) toast(e.msg || 'خطأ', 'err'); }
  finally { A._fuLoading = false; }
};
A.fuClose = async (id) => {
  const note = prompt('ملاحظة على الإقفال (اختياري):', '');
  if (note === null) return;
  try { const r = await api('closeFollowup', { id: id, note: note }); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.fuCancel = async (id) => {
  if (!confirm('إلغاء المتابعة دي؟')) return;
  try { const r = await api('closeFollowup', { id: id, cancel: true }); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.fuPostpone = (id) => {
  const d = new Date(); d.setDate(d.getDate() + 3);
  openModal(`
    <h2>📅 تأجيل المتابعة</h2>
    <label>التاريخ الجديد</label>
    <input id="fu-date" type="date" value="${d.toISOString().slice(0, 10)}">
    <label>السبب (اختياري)</label><input id="fu-note" placeholder="العميل طلب أسبوع كمان">
    <div class="modal-actions">
      <button class="btn amber" onclick="A.fuPostponeSave('${id}')">تأجيل ✔</button>
      <button class="btn outline" onclick="A.closeModal()">رجوع</button>
    </div>`);
};
A.fuPostponeSave = async (id) => {
  const payload = { id: id, postpone: true, due_date: $('#fu-date').value, note: $('#fu-note').value.trim() };
  closeModal();
  try { const r = await api('closeFollowup', payload); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.fuAdd = (custId) => {
  const c = custById(custId);
  const d = new Date(); d.setDate(d.getDate() + 7);
  openModal(`
    <h2>📌 متابعة جديدة: ${esc(c.name)}</h2>
    <label>النوع</label>
    <select id="fu-type"><option>متابعة</option><option>وعد دفع</option></select>
    <label>التاريخ</label><input id="fu-due" type="date" value="${d.toISOString().slice(0, 10)}">
    <label>المبلغ (لو وعد دفع)</label><input id="fu-amount" type="text" inputmode="decimal" placeholder="0">
    <label>الملاحظة</label><input id="fu-note2" placeholder="مثال: هيسدد نص المبلغ">
    <div class="modal-actions">
      <button class="btn green" onclick="A.fuAddSave('${custId}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.fuAddSave = async (custId) => {
  const payload = {
    customer_id: custId, type: $('#fu-type').value, due_date: $('#fu-due').value,
    amount: normDigits($('#fu-amount').value), note: $('#fu-note2').value.trim()
  };
  if (!payload.due_date) return toast('حدد التاريخ', 'err');
  closeModal();
  try { const r = await api('saveFollowup', payload); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- سجل المندوب: طلباته وتحصيلاته -----
function viewMine() {
  if (!S.sales) { A.loadSales(); return '<div class="empty"><div class="big">⏳</div>بيحمل سجلك...</div>'; }
  const d = S.sales;
  const sub = S.mineTab || 'collections';
  const orders = (d.orders || []).slice().reverse();
  const cols = (d.collections || []).slice().reverse();
  const month = new Date().toISOString().slice(0, 7);
  const monthCols = cols.filter(c => String(c.date).slice(0, 7) === month);
  const monthOrders = orders.filter(o => String(o.date).slice(0, 7) === month);
  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="num" style="color:var(--green)">${money(monthCols.reduce((s, c) => s + (Number(c.amount) || 0), 0))}</div>
        <div class="lbl">تحصيلاتك الشهر (${esc(d.currency)})</div></div>
      <div class="kpi"><div class="num">${money(monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0))}</div>
        <div class="lbl">طلباتك الشهر</div></div>
    </div>
    <div class="pill-row">
      <button class="pill ${sub === 'collections' ? 'active' : ''}" onclick="A.mineTab('collections')">💵 تحصيلاتي (${cols.length})</button>
      <button class="pill ${sub === 'orders' ? 'active' : ''}" onclick="A.mineTab('orders')">🛒 طلباتي (${orders.length})</button>
    </div>
    ${sub === 'collections'
      ? (cols.length ? cols.map(c => `<div class="cust-card" style="padding:11px 13px">
          <div class="cust-head">
            <div><div class="cust-name" style="font-size:14.5px">${esc(c.customer_name)}</div>
              <div class="cust-meta">${c.voucher ? 'سند ' + esc(c.voucher) + ' • ' : ''}${esc(String(c.date).slice(0, 10))} ${esc(c.time || '')} • ${esc(c.method)}
                ${c.reference ? '• ' + esc(c.reference) : ''}</div></div>
            <div style="text-align:left"><b class="pos">${money(c.amount)}</b>
              <div>${c.status === 'مرسل' ? '<span class="badge cool">اتسجل</span>'
                : c.status === 'بانتظار البنك' ? '<span class="badge warm">🏦 مستني البنك</span>'
                : c.status === 'مطابق' ? '<span class="badge info">🏦 وصل البنك</span>'
                : '<span class="badge warm">مستني</span>'}</div></div>
          </div>
          ${c.receipt ? `<button class="btn sm ghost mt" onclick="A.myReceipt('${c.id}')">📄 اعرض السند</button>` : ''}
          </div>`).join('') : '<div class="empty"><div class="big">💵</div>لسه مسجلتش تحصيلات</div>')
      : (orders.length ? orders.map(o => `<div class="cust-card" style="padding:11px 13px">
          <div class="cust-head">
            <div><div class="cust-name" style="font-size:14.5px">${esc(o.customer_name)}</div>
              <div class="cust-meta">${esc(String(o.date).slice(0, 10))} • ${o.items_count} صنف</div></div>
            <div style="text-align:left"><b>${money(o.total)}</b>
              <div>${o.status === 'مرسل' ? '<span class="badge cool">اتبعت</span>' : o.status === 'فشل' ? '<span class="badge hot">فشل</span>' : '<span class="badge warm">مستني</span>'}</div></div>
          </div></div>`).join('') : '<div class="empty"><div class="big">🛒</div>لسه مسجلتش طلبات</div>')}`;
}
A.mineTab = (t) => { S.mineTab = t; render(); };
/** المندوب يعرض سند قبض سجّله — يوريه للعميل لو حصل خلاف */
A.myReceipt = async (id) => {
  const c = ((S.sales && S.sales.collections) || []).find(x => String(x.id) === String(id));
  if (!c || !c.receipt) return toast('السند ده مفيهوش صورة', 'err');
  toast('⏳ بجيب السند...');
  try {
    const r = await api('getAttachment', { url: c.receipt });
    openModal(`
      <h2>📄 سند قبض رقم ${esc(c.voucher || '—')}</h2>
      <p class="modal-sub">${esc(c.customer_name)} — ${esc(String(c.date).slice(0, 10))}</p>
      <div style="background:#fff;border-radius:10px;padding:6px;text-align:center">
        <img src="${r.data}" alt="سند قبض" style="max-width:100%;border-radius:6px">
      </div>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  } catch (e) { toast(e.msg || (e.offline ? 'عرض السند محتاج نت' : 'خطأ'), 'err'); }
};

// ----- تبويب العملاء -----
function viewCustomers() {
  const days = [['all', 'الكل'], [1, 'السبت'], [2, 'الحد'], [3, 'الاتنين'], [4, 'التلات'], [5, 'الأربع'], [6, 'الخميس']];
  let list = myCustomers();
  if (S.custDay !== 'all') list = list.filter(c => String(c.visit_day) === String(S.custDay));
  if (S.custFilter) {
    const f = S.custFilter.toLowerCase();
    list = list.filter(c => String(c.name).toLowerCase().includes(f) || String(c.address).toLowerCase().includes(f) || String(c.phone).includes(f));
  }
  list.sort((a, b) => (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0));
  return `
    <input placeholder="🔍 دور بالاسم أو العنوان أو التليفون" value="${esc(S.custFilter)}"
      oninput="A.custSearch(this.value)" style="margin-bottom:10px">
    <div class="pill-row">${days.map(d =>
      `<button class="pill ${String(S.custDay) === String(d[0]) ? 'active' : ''}" onclick="A.custDayF('${d[0]}')">${d[1]}</button>`).join('')}
    </div>
    ${list.length ? list.map(c => custCard(c, true)).join('') : '<div class="empty"><div class="big">🔍</div>مفيش نتايج</div>'}`;
}
A.custSearch = v => { S.custFilter = v; renderKeepFocus(); };
A.custDayF = v => { S.custDay = v; render(); };
function renderKeepFocus() {
  const el = document.activeElement;
  const pos = el && el.selectionStart;
  render();
  const input = $('.page input');
  if (input) { input.focus(); try { input.setSelectionRange(pos, pos); } catch (e) {} }
}

// ----- تفاصيل عميل -----
A.custDetails = (id) => {
  const c = custById(id);
  if (!c) return;
  const visits = (S.data.visits || []).filter(v => String(v.customer_id) === String(id)).slice(-10).reverse();
  openModal(`
    <h2>${esc(c.name)}</h2>
    <p class="modal-sub">${esc(c.address || '')} ${c.phone ? '• ' + esc(c.phone) : ''} • يوم ${dayLabel(c.visit_day)}</p>
    ${priorityBadge(c)} ${c.priority_reasons ? '<div class="muted mt">' + esc(c.priority_reasons) + '</div>' : ''}
    <div class="card mt">
      <h3>💼 كشف الحساب (من قيود)</h3>
      <div class="stat-line"><span>الرصيد الحالي</span><b class="${Number(c.balance) > 0 ? 'neg' : 'pos'}">${moneyC(c.balance)}</b></div>
      <div class="stat-line"><span>متأخرات مستحقة</span><b class="${Number(c.overdue) > 0 ? 'neg' : 'pos'}">${moneyC(c.overdue)}</b></div>
      ${Number(c.overdue) > 0 ? `<div class="aging-row">
        ${[['aging_30', '1-30 يوم', 'warm'], ['aging_60', '31-60', 'warm'], ['aging_90', '61-90', 'hot'], ['aging_90p', '+90 يوم', 'hot']]
          .filter(a => Number(c[a[0]]) > 0)
          .map(a => `<div class="aging-cell ${a[2]}"><b>${money(c[a[0]])}</b><span>${a[1]}</span></div>`).join('')
          || '<div class="muted">التفاصيل هتظهر بعد أول مزامنة</div>'}
      </div>` : ''}
      <div class="stat-line"><span>مبيعات آخر 90 يوم</span><b>${moneyC(c.sales_90d)}</b></div>
      <div class="stat-line"><span>مرتجعات آخر 90 يوم</span><b>${moneyC(c.returns_90d)}</b></div>
      <div class="stat-line"><span>مدة الاستحقاق</span><b>${termsOf(c)} يوم</b></div>
      <div class="stat-line"><span>آخر دفعة</span><b>${esc(c.last_payment_date || '—')}</b></div>
      <div class="stat-line"><span>آخر زيارة</span><b>${esc(c.last_visit_date || 'لم يُزر')}</b></div>
    </div>
    <div class="flex mt">
      ${featureOn('ORDER_ENABLED') ? `<button class="btn sm" onclick="A.orderForm('${c.id}')">🛒 طلب جديد</button>` : ''}
      ${featureOn('COLLECT_ENABLED') ? `<button class="btn sm green" onclick="A.collectForm('${c.id}')">💵 سند قبض</button>` : ''}
    </div>
    <div class="flex mt">
      <button class="btn sm green" onclick="A.closeModal();A.checkin('${c.id}')">✔ تسجيل وصول</button>
      <button class="btn sm amber" onclick="A.quickCall('${c.id}')">📞 زيارة هاتفية</button>
      <button class="btn sm ghost" onclick="A.pickLocForCustomer('${c.id}', false)">📍 ${c.lat ? 'عدّل' : 'حدد'} اللوكيشن</button>
    </div>
    <div class="flex mt">
      <button class="btn sm outline" onclick="A.statement('${c.id}')">📄 كشف حساب (PDF)</button>
      <button class="btn sm ghost" onclick="A.fuAdd('${c.id}')">📌 متابعة جديدة</button>
    </div>
    ${visits.length ? '<div class="section-title"><span>آخر الزيارات</span></div>' + visits.map(v => `
      <div class="card" style="padding:11px 13px">
        <b>${esc(v.date)}</b> — <span class="badge ${v.status === 'تمت' ? 'cool' : 'gray'}">${esc(v.status)}</span>
        ${v.outcome ? ' <span class="badge info">' + esc(v.outcome) + '</span>' : ''}
        ${v.report ? '<div class="muted">' + esc(v.report) + '</div>' : ''}
      </div>`).join('') : ''}
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
};

// زيارة هاتفية سريعة
A.quickCall = (custId) => {
  const c = custById(custId);
  openModal(`
    <h2>زيارة هاتفية: ${esc(c.name)}</h2>
    <label>النتيجة</label>
    <select id="v-outcome">
      <option>متابعة تحصيل</option><option>طلبية جديدة</option><option>متابعة عادية</option><option>مش بيرد</option>
    </select>
    <label>التقرير</label>
    <textarea id="v-report" rows="3" placeholder="اتفقنا على إيه؟"></textarea>
    ${micButton('v-report')}
    <div class="modal-actions">
      <button class="btn green" onclick="A.quickCallSave('${c.id}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.quickCallSave = async (custId) => {
  const payload = {
    customer_id: custId, visit_type: 'هاتفية', status: 'تمت',
    outcome: $('#v-outcome').value, report: $('#v-report').value.trim(),
    date: new Date().toISOString().slice(0, 10)
  };
  closeModal();
  try { await api('quickVisit', payload); toast('✅ اتسجلت', 'ok'); refresh(true); }
  catch (e) {
    if (e.offline) { qpush('quickVisit', payload); toast('📴 اتحفظت محليًا', 'ok'); }
    else toast(e.msg || 'خطأ', 'err');
  }
};

// ----- الليدز -----
function viewLeads() {
  const stages = [['all', 'الكل']].concat(LEAD_STAGES.map(s => [s, s]));
  let list = (S.data.leads || []).slice().reverse();
  if (S.leadStage !== 'all') list = list.filter(l => l.stage === S.leadStage);
  return `
    <button class="btn full" onclick="A.leadForm()">➕ إضافة ليد جديد</button>
    <div class="pill-row mt">${stages.map(s =>
      `<button class="pill ${S.leadStage === s[0] ? 'active' : ''}" onclick="A.leadStageF('${s[0]}')">${s[1]}</button>`).join('')}</div>
    ${list.length ? list.map(l => `
      <div class="cust-card">
        <div class="cust-head">
          <div><div class="cust-name">${esc(l.name)}</div>
          <div class="cust-meta">${esc(l.address || '')} ${l.source ? '• المصدر: ' + esc(l.source) : ''}</div></div>
          <span class="badge ${l.stage === 'اتحول لعميل' ? 'cool' : l.stage === 'مش مهتم' ? 'gray' : 'info'}">${esc(l.stage)}</span>
        </div>
        ${l.notes ? '<div class="muted mt">' + esc(l.notes) + '</div>' : ''}
        <div class="cust-actions">
          <button class="btn sm ghost" onclick="A.leadStageForm('${l.id}')">تحديث المرحلة</button>
          ${l.phone ? '<a class="btn sm outline" href="tel:' + esc(l.phone) + '">📞</a>' : ''}
          ${l.lat ? '<a class="btn sm outline" target="_blank" href="' + mapsLink(l.lat, l.lng) + '">🧭</a>' : ''}
        </div>
      </div>`).join('') : '<div class="empty"><div class="big">🎯</div>مفيش ليدز هنا</div>'}`;
}
A.leadStageF = v => { S.leadStage = v; render(); };

A.leadForm = () => {
  openModal(`
    <h2>ليد جديد</h2>
    <label>الاسم *</label><input id="l-name">
    <label>التليفون</label><input id="l-phone" inputmode="tel">
    <label>العنوان</label><input id="l-address">
    <label>المصدر</label>
    <select id="l-source"><option>زيارة ميدانية</option><option>ترشيح عميل</option><option>اتصال وارد</option><option>سوشيال ميديا</option><option>معرض</option><option>أخرى</option></select>
    <label>ملاحظات</label><textarea id="l-notes" rows="2"></textarea>
    <button class="btn ghost sm mt" onclick="A.leadPickLoc()">📍 حدد لوكيشنه (اختياري)</button>
    <span id="l-loc-txt" class="muted"></span>
    <div class="modal-actions">
      <button class="btn green" onclick="A.leadSave()">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
  A._leadLoc = null;
};
A.leadPickLoc = () => {
  const saved = { name: $('#l-name').value, phone: $('#l-phone').value, address: $('#l-address').value, source: $('#l-source').value, notes: $('#l-notes').value };
  openMapPicker(null, null, ll => {
    A._leadLoc = ll;
    A.leadForm();
    $('#l-name').value = saved.name; $('#l-phone').value = saved.phone; $('#l-address').value = saved.address;
    $('#l-source').value = saved.source; $('#l-notes').value = saved.notes;
    $('#l-loc-txt').textContent = ' ✅ اللوكيشن اتحدد';
    A._leadLoc = ll;
  });
};
A.leadSave = async () => {
  const payload = {
    name: $('#l-name').value.trim(), phone: $('#l-phone').value.trim(), address: $('#l-address').value.trim(),
    source: $('#l-source').value, notes: $('#l-notes').value.trim(),
    lat: A._leadLoc ? A._leadLoc.lat : '', lng: A._leadLoc ? A._leadLoc.lng : ''
  };
  if (!payload.name) return toast('اكتب اسم الليد', 'err');
  closeModal();
  try { await api('addLead', payload); toast('✅ الليد اتضاف', 'ok'); refresh(true); }
  catch (e) {
    if (e.offline) { qpush('addLead', payload); toast('📴 اتحفظ محليًا', 'ok'); }
    else toast(e.msg || 'خطأ', 'err');
  }
};

A.leadStageForm = (id) => {
  const l = (S.data.leads || []).find(x => String(x.id) === String(id));
  openModal(`
    <h2>تحديث: ${esc(l.name)}</h2>
    <label>المرحلة</label>
    <select id="l-stage">${LEAD_STAGES.map(s => '<option ' + (l.stage === s ? 'selected' : '') + '>' + s + '</option>').join('')}</select>
    <label>ملاحظات</label><textarea id="l-notes" rows="2">${esc(l.notes || '')}</textarea>
    <div class="modal-actions">
      <button class="btn green" onclick="A.leadStageSave('${l.id}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.leadStageSave = async (id) => {
  const payload = { id: id, stage: $('#l-stage').value, notes: $('#l-notes').value.trim() };
  closeModal();
  try {
    await api('updateLead', payload);
    toast(payload.stage === 'اتحول لعميل' ? '🎉 مبروك — الليد بقى عميل!' : '✅ اتحدث', 'ok');
    refresh(true);
  } catch (e) {
    if (e.offline) { qpush('updateLead', payload); toast('📴 اتحفظ محليًا', 'ok'); }
    else toast(e.msg || 'خطأ', 'err');
  }
};

// ----- التنبيهات -----
function viewNotifs() {
  const list = (S.data.notifications || []).slice().reverse();
  if (!list.length) return '<div class="empty"><div class="big">🔕</div>مفيش تنبيهات جديدة</div>';
  return `<button class="btn ghost full" onclick="A.readAll()">اعتبرها كلها مقروءة ✔</button><div class="mt"></div>` +
    list.map(n => `
      <div class="card notif-card ${esc(n.type)}">
        <div class="notif-title">${esc(n.title)}</div>
        <div style="font-size:13.5px">${esc(n.message)}</div>
        <div class="notif-date">${esc(n.date)}</div>
      </div>`).join('');
}
A.readAll = async () => {
  const ids = (S.data.notifications || []).map(n => n.id);
  S.data.notifications = [];
  render();
  try { await api('markNotifRead', { ids }); } catch (e) {}
};

// ----- حسابي -----
function viewMe() {
  const k = S.data.kpis || {};
  const region = (S.data.regions || []).find(r => String(r.id) === String(S.user.region_id));
  return `
    <div class="card" style="text-align:center">
      <div class="logo-circle" style="margin:0 auto 10px;width:64px;height:64px;font-size:28px">${esc(S.user.name[0] || 'م')}</div>
      <h3>${esc(S.user.name)}</h3>
      <span class="badge info">${region ? 'منطقة ' + esc(region.name) : 'مندوب'}</span>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="num">${k.visitsMonth || 0}${k.visitsTarget ? ' / ' + k.visitsTarget : ''}</div><div class="lbl">زيارات الشهر</div>
        ${k.visitsTarget ? '<div class="bar"><i style="width:' + Math.min(100, k.visitsMonth / k.visitsTarget * 100) + '%"></i></div>' : ''}</div>
      <div class="kpi"><div class="num">${money(k.collectedMonth)}</div><div class="lbl">تحصيل منطقتك الشهر (${esc(cur())})</div>
        ${k.collectionTarget ? '<div class="bar"><i style="width:' + Math.min(100, k.collectedMonth / k.collectionTarget * 100) + '%"></i></div>' : ''}</div>
    </div>
    <div class="card">
      <h3>🏆 ترتيبك بين المناديب</h3>
      <p class="muted">شوف مركزك في الزيارات والتغطية والتحصيل.</p>
      <button class="btn sm amber mt" onclick="A.leaderboard('week')">اعرض الترتيب</button>
    </div>
    <div class="card">
      <h3>💰 عهدتك</h3>
      <p class="muted">التحصيلات الكاش اللي لسه متوردتش للإدارة.</p>
      <button class="btn sm green mt" onclick="A.myCash()">اعرض عهدتي</button>
    </div>
    <div class="card">
      <h3>📍 تتبع خط السير</h3>
      <div class="stat-line"><span>الحالة</span>
        <b>${TRK.denied ? '<span style="color:var(--red)">⚠️ إذن الموقع مرفوض</span>'
          : TRK.watchId !== null ? '<span style="color:var(--green)">🟢 شغال</span>'
          : '<span style="color:var(--muted)">بيشتغل أول ما تتحرك</span>'}</b></div>
      ${TRK.buf.length ? '<div class="stat-line"><span>نقاط مستنية الرفع</span><b>' + TRK.buf.length + '</b></div>' : ''}
      <p class="muted mt">خط سيرك بيتسجل تلقائيًا أثناء استخدامك للتطبيق عشان تتحسب مسافاتك وتغطيتك في تقرير اليوم.</p>
    </div>
    <div class="card">
      <h3>📲 بوت تليجرام</h3>
      <p class="muted">عشان توصلك خطة يومك كل صبح: افتح البوت وابعتله<br><b>/start ${esc(S.user.username || '')}</b></p>
    </div>
    ${S.queue.length ? '<div class="card"><h3>⏳ عمليات مستنية النت (' + S.queue.length + ')</h3><button class="btn sm ghost" onclick="A.doRefresh()">حاول ترفعها دلوقتي</button></div>' : ''}
    <button class="btn red full mt" onclick="A.logout()">تسجيل خروج</button>
    <p class="muted mt" style="text-align:center">CRM روافد — آخر تحديث بيانات: ${esc((S.data.serverTime || ''))}</p>`;
}

// ==================== [ admin.js ] ====================
/* CRM روافد — لوحة الأدمن: اللوحة، التقرير اليومي، المبيعات، العملاء، الفريق، الإعدادات */

// ================== واجهة الأدمن ==================
function viewAdmin() {
  const tabs = [
    ['dash', '📊 اللوحة'], ['daily', '📍 التقرير اليومي'], ['sales', '🛒 الطلبات والتحصيلات'],
    ['customers', '👥 العملاء'], ['team', '🧑‍💼 المناديب والمناطق'], ['leads', '🎯 الليدز'],
    ['entries', '📒 القيود اليومية'], ['targets', '🏁 الأهداف'], ['reports', '📄 التقارير'],
    ['settings', '⚙️ الإعدادات']
  ];
  let body = '';
  if (!S.data) body = '<div class="empty"><div class="big">⏳</div>بيحمل البيانات...<br><button class="btn mt" onclick="A.doRefresh()">حاول تاني</button></div>';
  else body = {
    dash: adDash, daily: adDaily, sales: adSales, customers: adCustomers, team: adTeam, leads: adLeads,
    entries: adEntries, targets: adTargets, reports: adReports, settings: adSettings
  }[S.adminTab]();
  return topbar('لوحة تحكم الأدمن') +
    '<div class="admin-tabs">' + tabs.map(t =>
      `<button class="${S.adminTab === t[0] ? 'active' : ''}" onclick="A.adminTab('${t[0]}')">${t[1]}</button>`).join('') + '</div>' +
    '<div class="page">' + body + '</div>';
}
A.adminTab = t => { S.adminTab = t; render(); window.scrollTo(0, 0); };

function defaultTerms() {
  const s = (S.data && (S.data.allSettings || S.data.settings)) || {};
  return Number(s.PAYMENT_TERMS_DAYS) || 30;
}
function termsOf(c) { return Number(c.payment_terms) > 0 ? Number(c.payment_terms) : defaultTerms(); }

function regionName(id) {
  const r = (S.data.regions || []).find(x => String(x.id) === String(id));
  return r ? r.name : '—';
}
function repName(id) {
  const u = (S.data.users || []).find(x => String(x.id) === String(id));
  return u ? u.name : '—';
}

// ----- لوحة المتابعة -----
function adDash() {
  const customers = S.data.customers || [];
  const visits = S.data.visits || [];
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  const visitsToday = visits.filter(v => String(v.date).slice(0, 10) === today && v.status === 'تمت');
  const visitsMonth = visits.filter(v => String(v.date).slice(0, 7) === month && v.status === 'تمت');
  const totalOverdue = customers.reduce((s, c) => s + (Number(c.overdue) || 0), 0);
  const collectedMonth = (S.data.receipts || []).filter(r => String(r.date).slice(0, 7) === month).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const visited = customers.filter(c => c.last_visit_date && (new Date() - new Date(c.last_visit_date)) / 86400000 <= 30).length;
  const coverage = customers.length ? Math.round(visited / customers.length * 100) : 0;
  const noLoc = customers.filter(c => !c.lat).length;
  const noRegion = customers.filter(c => !c.region_id).length;

  const topOverdue = customers.filter(c => Number(c.overdue) > 0)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue)).slice(0, 8);

  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="num">${visitsToday.length}</div><div class="lbl">زيارات اليوم</div></div>
      <div class="kpi"><div class="num">${visitsMonth.length}</div><div class="lbl">زيارات الشهر</div></div>
      <div class="kpi"><div class="num">${coverage}%</div><div class="lbl">تغطية العملاء (30 يوم)</div>
        <div class="bar"><i style="width:${coverage}%"></i></div></div>
      <div class="kpi"><div class="num" style="color:var(--red)">${money(totalOverdue)}</div><div class="lbl">إجمالي المتأخرات (${esc(cur())})</div></div>
      <div class="kpi"><div class="num" style="color:var(--green)">${money(collectedMonth)}</div><div class="lbl">تحصيلات الشهر (${esc(cur())})</div></div>
      <div class="kpi"><div class="num">${customers.length}</div><div class="lbl">إجمالي العملاء</div></div>
    </div>
    ${(noLoc || noRegion) ? `<div class="card" style="border-right:4px solid var(--amber)">
      ⚠️ <b>محتاج انتباهك:</b> ${noRegion ? noRegion + ' عميل من غير منطقة' : ''}${noLoc && noRegion ? ' و ' : ''}${noLoc ? noLoc + ' عميل من غير لوكيشن' : ''} — كمّل بياناتهم من صفحة العملاء عشان خط السير والأولويات يشتغلوا صح.
    </div>` : ''}
    <div class="section-title"><span>أداء المناديب</span></div>
    <div class="table-wrap"><table>
      <tr><th>المندوب</th><th>المنطقة</th><th>زيارات اليوم</th><th>زيارات الشهر</th><th>تليجرام</th></tr>
      ${reps.map(r => `<tr>
        <td><b>${esc(r.name)}</b></td><td>${esc(regionName(r.region_id))}</td>
        <td>${visitsToday.filter(v => String(v.rep_id) === String(r.id)).length}</td>
        <td>${visitsMonth.filter(v => String(v.rep_id) === String(r.id)).length}</td>
        <td>${r.telegram_chat_id ? esc(r.telegram_chat_id) : '<span class="muted">غير متصل</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">ضيف مناديب من صفحة المناديب والمناطق</td></tr>'}
    </table></div>
    <div class="section-title"><span>💰 أعمار الديون</span>
      <button class="btn sm amber" onclick="A.followupsAdmin()">📌 متابعات المناديب</button></div>
    <div class="kpi-grid">
      ${[['aging_30', '1-30 يوم'], ['aging_60', '31-60 يوم'], ['aging_90', '61-90 يوم'], ['aging_90p', 'أكتر من 90 يوم']]
        .map((a, i) => {
          const sum = customers.reduce((s, c) => s + (Number(c[a[0]]) || 0), 0);
          const pct = totalOverdue ? Math.round(sum / totalOverdue * 100) : 0;
          return `<div class="kpi"><div class="num" style="color:${i >= 2 ? 'var(--red)' : 'var(--amber)'}">${money(sum)}</div>
            <div class="lbl">${a[1]} (${pct}%)</div></div>`;
        }).join('')}
    </div>
    <div class="section-title"><span>💰 أعلى متأخرات</span></div>
    <div class="table-wrap"><table>
      <tr><th>العميل</th><th>المنطقة</th><th>المتأخر</th><th>1-30</th><th>31-60</th><th>61-90</th><th>+90</th><th>آخر دفعة</th></tr>
      ${topOverdue.map(c => `<tr>
        <td><b>${esc(c.name)}</b></td><td>${esc(regionName(c.region_id))}</td>
        <td style="color:var(--red);font-weight:700">${money(c.overdue)}</td>
        <td>${Number(c.aging_30) ? money(c.aging_30) : '—'}</td>
        <td>${Number(c.aging_60) ? money(c.aging_60) : '—'}</td>
        <td class="neg">${Number(c.aging_90) ? money(c.aging_90) : '—'}</td>
        <td class="neg"><b>${Number(c.aging_90p) ? money(c.aging_90p) : '—'}</b></td>
        <td>${esc(c.last_payment_date || '—')}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">مفيش متأخرات — أو المزامنة مع قيود لسه</td></tr>'}
    </table></div>
    <div class="section-title"><span>آخر الزيارات</span></div>
    <div class="table-wrap"><table>
      <tr><th>التاريخ</th><th>المندوب</th><th>العميل</th><th>الحالة</th><th>النتيجة</th><th>المدة</th><th>مرفقات</th></tr>
      ${visits.slice(-15).reverse().map(v => `<tr>
        <td>${esc(String(v.date).slice(0, 10))}</td><td>${esc(v.rep_name)}</td><td>${esc(v.customer_name)}</td>
        <td><span class="badge ${v.status === 'تمت' ? 'cool' : 'gray'}">${esc(v.status)}</span></td>
        <td>${esc(v.outcome || '—')}</td><td>${v.duration_min ? v.duration_min + ' د' : '—'}</td>
        <td>${attachLinks(v)}</td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">لسه مفيش زيارات</td></tr>'}
    </table></div>`;
}

// ----- التقرير اليومي وخطوط السير -----
function adDaily() {
  const date = S.dailyDate || new Date().toISOString().slice(0, 10);
  const rep = S.daily;
  return `
    <div class="card">
      <div class="flex">
        <div><label>تاريخ التقرير</label><input type="date" id="dr-date" value="${esc(date)}" max="${new Date().toISOString().slice(0, 10)}"></div>
        <div style="flex:none;align-self:flex-end"><button class="btn" onclick="A.loadDaily()">عرض التقرير</button></div>
        <div style="flex:none;align-self:flex-end"><button class="btn ghost" onclick="A.loadDaily(-1)">← اليوم اللي فات</button></div>
      </div>
    </div>
    ${!rep ? '<div class="empty"><div class="big">📍</div>اختار التاريخ واضغط "عرض التقرير"</div>' : `
      ${rep.trackingEnabled ? '' : '<div class="card" style="border-right:4px solid var(--amber)">⚠️ تتبع خطوط السير مقفول من الإعدادات — الزيارات بتتسجل عادي بس المسافات مش هتظهر.</div>'}
      <div class="section-title"><span>ملخص يوم ${esc(rep.dayName)} — ${esc(rep.date)}</span></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="num">${rep.totals.visitsDone}</div><div class="lbl">زيارة منفذة</div></div>
        <div class="kpi"><div class="num">${rep.totals.plannedDone}/${rep.totals.plannedCount}</div><div class="lbl">تغطية خط السير</div>
          ${rep.totals.plannedCount ? '<div class="bar"><i style="width:' + Math.round(rep.totals.plannedDone / rep.totals.plannedCount * 100) + '%"></i></div>' : ''}</div>
        <div class="kpi"><div class="num" style="color:var(--green)">${money(rep.totals.collected)}</div><div class="lbl">تحصيلات اليوم (${esc(rep.currency || cur())})</div></div>
        <div class="kpi"><div class="num">${money(rep.totals.netSales)}</div><div class="lbl">صافي مبيعات اليوم</div></div>
        <div class="kpi"><div class="num">${rep.totals.distanceKm}</div><div class="lbl">كم مقطوعة</div></div>
        <div class="kpi"><div class="num">${rep.totals.activeReps}/${rep.totals.totalReps}</div><div class="lbl">مندوب نشط</div></div>
      </div>
      <div class="flex" style="margin-bottom:10px">
        <button class="btn ghost sm" onclick="A.sendSummaryNow()">📲 ابعتلي التقرير على تليجرام دلوقتي</button>
        <button class="btn amber sm" onclick="A.leaderboard('week')">🏆 ترتيب المناديب</button>
      </div>
      <div class="table-wrap"><table>
        <tr><th>المندوب</th><th>المنطقة</th><th>الزيارات</th><th>التغطية</th><th>التحصيلات</th><th>صافي المبيعات</th><th>خارج الخطة</th><th>المسافة</th><th>أول تحرك</th><th>آخر تحرك</th><th>ساعات</th><th>متوسط الزيارة</th><th></th></tr>
        ${rep.reps.map(r => `<tr>
          <td><b>${esc(r.rep_name)}</b></td>
          <td>${esc(r.regionName || '—')}</td>
          <td>${r.visitsDone}${r.visits > r.visitsDone ? ' <span class="muted">(+' + (r.visits - r.visitsDone) + ' مش تمت)</span>' : ''}</td>
          <td>${r.coverage === null ? '—' : '<span class="badge ' + (r.coverage >= 80 ? 'cool' : r.coverage >= 50 ? 'warm' : 'hot') + '">' + r.coverage + '%</span>'}
            <div class="muted" style="font-size:11.5px">${r.plannedDone} من ${r.plannedCount}</div></td>
          <td style="color:var(--green);font-weight:700">${r.collected ? money(r.collected) : '—'}</td>
          <td style="font-weight:700">${r.netSales ? money(r.netSales) : '—'}${r.returns ? '<div class="muted" style="font-size:11.5px">مرتجع ' + money(r.returns) + '</div>' : ''}</td>
          <td>${r.offPlan || '—'}</td>
          <td>${r.distanceKm ? r.distanceKm + ' كم' : (r.visitsDone && !r.points ? '<span class="badge warm">مفيش تتبع</span>' : '<span class="muted">—</span>')}</td>
          <td>${esc(r.firstTime || '—')}</td>
          <td>${esc(r.lastTime || '—')}</td>
          <td>${r.workMins ? Math.floor(r.workMins / 60) + ':' + String(r.workMins % 60).padStart(2, '0') : '—'}</td>
          <td>${r.avgVisitMin ? r.avgVisitMin + ' د' : '—'}</td>
          <td>${(r.trail.length || r.visitMarkers.length) ? `<button class="btn sm ghost" onclick="A.showTrail('${r.rep_id}')">🗺️ خط سيره</button>` : '<span class="muted">مفيش تتبع</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="13" class="muted">مفيش مناديب</td></tr>'}
      </table></div>
      ${rep.reps.filter(r => r.missed.length).map(r => `
        <div class="card">
          <h3>⚠️ عملاء ${esc(r.rep_name)} اللي متزاروش (${r.missed.length})</h3>
          <div class="muted">${r.missed.map(esc).join(' • ')}</div>
        </div>`).join('')}
      <button class="btn ghost full" onclick="A.exportDaily()">⬇️ تنزيل التقرير Excel</button>
    `}`;
}

A.loadDaily = async (offset) => {
  let date = ($('#dr-date') || {}).value || new Date().toISOString().slice(0, 10);
  if (offset) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    date = d.toISOString().slice(0, 10);
  }
  S.dailyDate = date;
  toast('⏳ بجهز تقرير ' + date);
  try {
    const res = await api('dailyReport', { date: date });
    S.daily = res.report;
    render();
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.showTrail = (repId) => {
  const r = (S.daily.reps || []).find(x => String(x.rep_id) === String(repId));
  if (!r) return;
  openModal(`
    <h2>🗺️ خط سير ${esc(r.rep_name)}</h2>
    <p class="modal-sub">${esc(S.daily.date)} — ${r.distanceKm} كم، ${r.visitsDone} زيارة، ${r.points} نقطة تتبع</p>
    <div id="map-pick"></div>
    <div class="muted mt">— خط أزرق متصل: تحرك متتبع • - - خط رمادي متقطع: فجوة (التطبيق كان مقفول) • 🟢 بداية اليوم • 🔴 آخر نقطة • 📍 زيارات</div>
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`, () => {
    const map = L.map('map-pick');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    const pts = r.trail.map(p => [p[0], p[1]]);
    const bounds = [];
    const mins = t => { const p = String(t || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
    if (pts.length > 1) {
      // المسار المتصل بيتقسم: خط متصل للتحرك المتتبع، ومتقطع للفجوات (التطبيق كان مقفول)
      for (let i = 1; i < r.trail.length; i++) {
        const gap = mins(r.trail[i][2]) - mins(r.trail[i - 1][2]);
        const seg = [pts[i - 1], pts[i]];
        if (gap > 25) {
          L.polyline(seg, { color: '#94a3b8', weight: 3, opacity: .8, dashArray: '7,7' }).addTo(map)
            .bindPopup('فجوة ' + gap + ' دقيقة — التطبيق كان مقفول');
        } else {
          L.polyline(seg, { color: '#2f6fed', weight: 4, opacity: .8 }).addTo(map);
        }
      }
      L.circleMarker(pts[0], { radius: 7, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1 })
        .addTo(map).bindPopup('البداية ' + esc(r.trail[0][2]));
      L.circleMarker(pts[pts.length - 1], { radius: 7, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 })
        .addTo(map).bindPopup('آخر نقطة ' + esc(r.trail[r.trail.length - 1][2]));
    }
    // نقاط التتبع نفسها
    r.trail.forEach((p, i) => {
      if (i === 0 || i === r.trail.length - 1) return;
      L.circleMarker([p[0], p[1]], { radius: 3, color: '#2f6fed', fillColor: '#2f6fed', fillOpacity: .9, weight: 1 })
        .addTo(map).bindPopup(esc(p[2]));
    });
    pts.forEach(p => bounds.push(p));
    r.visitMarkers.forEach(v => {
      const color = v.status === 'تمت' ? '#16a34a' : '#dc2626';
      L.marker([v.lat, v.lng]).addTo(map)
        .bindPopup('<b>' + esc(v.name) + '</b><br>' + esc(v.time || '') + ' — ' + esc(v.status) +
          (v.distance_m !== '' && v.distance_m != null ? '<br>على بعد ' + v.distance_m + ' م من العميل' : ''));
      L.circleMarker([v.lat, v.lng], { radius: 10, color: color, fill: false, weight: 3 }).addTo(map);
      bounds.push([v.lat, v.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [25, 25] });
    else map.setView([24.7136, 46.6753], 11);
    setTimeout(() => map.invalidateSize(), 250);
    return () => map.remove();
  });
};

A.followupsAdmin = async () => {
  toast('⏳ بجيب المتابعات...');
  try {
    const r = await api('followupsAdmin', {});
    openModal(`
      <h2>📌 متابعات المناديب</h2>
      <p class="modal-sub">وعود الدفع والمتابعات المفتوحة — والمتأخرة عن ميعادها.</p>
      <div class="table-wrap"><table>
        <tr><th>المندوب</th><th>مفتوحة</th><th>متأخرة</th><th>وعود دفع</th><th>مبلغ متأخر</th></tr>
        ${r.reps.map(x => `<tr>
          <td><b>${esc(x.rep_name)}</b></td><td>${x.open}</td>
          <td>${x.late ? '<span class="badge hot">' + x.late + '</span>' : '—'}</td>
          <td class="pos">${money(x.promised)}</td>
          <td class="neg">${x.lateAmount ? money(x.lateAmount) : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted">مفيش متابعات مفتوحة</td></tr>'}
      </table></div>
      ${r.late.length ? `<div class="section-title"><span style="color:var(--red)">⚠️ متأخرة عن ميعادها (${r.late.length})</span></div>
        <div class="table-wrap"><table>
          <tr><th>العميل</th><th>المندوب</th><th>النوع</th><th>الميعاد</th><th>متأخرة</th><th>المبلغ</th><th>الملاحظة</th></tr>
          ${r.late.map(f => `<tr>
            <td><b>${esc(f.customer_name)}</b></td><td>${esc(f.rep_name)}</td>
            <td>${f.type === 'وعد دفع' ? '💰 وعد دفع' : '📌 متابعة'}</td>
            <td>${esc(f.due_date)}</td>
            <td><span class="badge hot">${f.lateDays} يوم</span></td>
            <td>${f.amount ? money(f.amount) : '—'}</td>
            <td class="muted">${esc(f.note || '')}</td>
          </tr>`).join('')}
        </table></div>` : '<div class="card" style="border-right:4px solid var(--green)">✅ مفيش متابعات متأخرة</div>'}
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.sendSummaryNow = async () => {
  toast('⏳ بجهز التقرير وببعته...');
  try { const r = await api('sendDailySummary', {}); toast(r.message, 'ok'); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.exportDaily = () => {
  const rows = (S.daily.reps || []).map(r => ({
    'التاريخ': S.daily.date, 'المندوب': r.rep_name, 'المنطقة': r.regionName || '',
    'زيارات منفذة': r.visitsDone, 'التحصيلات': r.collected, 'صافي المبيعات': r.netSales, 'المرتجعات': r.returns,
    'إجمالي الزيارات': r.visits, 'عملاء الخطة': r.plannedCount, 'اتزاروا من الخطة': r.plannedDone,
    'نسبة التغطية %': r.coverage === null ? '' : r.coverage, 'زيارات خارج الخطة': r.offPlan,
    'المسافة كم': r.distanceKm, 'أول تحرك': r.firstTime, 'آخر تحرك': r.lastTime,
    'دقائق العمل': r.workMins, 'متوسط الزيارة دقيقة': r.avgVisitMin,
    'عملاء متزاروش': r.missed.join(' | ')
  }));
  downloadCsv('التقرير_اليومي_' + S.daily.date, rows);
};

// ----- الطلبات والتحصيلات (أدمن) -----
function adSales() {
  const d = S.sales;
  if (!d) {
    A.loadSales();
    return '<div class="empty"><div class="big">⏳</div>بيحمل الطلبات والتحصيلات...</div>';
  }
  const orders = (d.orders || []).slice().reverse();
  const cols = (d.collections || []).slice().reverse();
  const pending = orders.filter(o => o.status !== 'مرسل').length + cols.filter(c => c.status !== 'مرسل').length;
  const totalOrders = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalCols = cols.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const sub = S.salesTab || 'orders';

  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="num">${orders.length}</div><div class="lbl">طلب مسجل</div></div>
      <div class="kpi"><div class="num">${money(totalOrders)}</div><div class="lbl">قيمة الطلبات (${esc(d.currency)})</div></div>
      <div class="kpi"><div class="num" style="color:var(--green)">${money(totalCols)}</div><div class="lbl">إجمالي التحصيلات</div></div>
      <div class="kpi"><div class="num" style="color:${pending ? 'var(--amber)' : 'var(--green)'}">${pending}</div><div class="lbl">مستني الإرسال لقيود</div></div>
    </div>
    ${pending ? `<button class="btn amber full" onclick="A.pushPending()">📤 ابعت كل المعلق لقيود (${pending})</button><div class="mt"></div>` : ''}
    <div class="pill-row">
      <button class="pill ${sub === 'orders' ? 'active' : ''}" onclick="A.salesTab('orders')">🛒 الطلبات</button>
      <button class="pill ${sub === 'collections' ? 'active' : ''}" onclick="A.salesTab('collections')">💵 التحصيلات</button>
      <button class="pill ${sub === 'cash' ? 'active' : ''}" onclick="A.salesTab('cash')">💰 عهد المناديب</button>
      <button class="pill ${sub === 'expenses' ? 'active' : ''}" onclick="A.salesTab('expenses')">🧾 المصروفات</button>
      <button class="pill ${sub === 'journal' ? 'active' : ''}" onclick="A.salesTab('journal')">📒 ترحيل المصروفات لقيود</button>
      <button class="pill ${sub === 'bank' ? 'active' : ''}" onclick="A.salesTab('bank')">🏦 مطابقة البنك</button>
    </div>
    ${sub === 'bank' ? adBank() : sub === 'journal' ? adExpJournal() : sub === 'expenses' ? adExpenses() : sub === 'orders' ? `
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>العميل</th><th>المندوب</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th></th></tr>
        ${orders.map(o => `<tr>
          <td>${esc(String(o.date).slice(0, 10))} <span class="muted">${esc(o.time || '')}</span></td>
          <td><b>${esc(o.customer_name)}</b></td>
          <td>${esc(o.rep_name)}</td>
          <td>${o.items_count}</td>
          <td><b>${money(o.total)}</b></td>
          <td>${statusBadge(o.status, o.error)}</td>
          <td style="white-space:nowrap">
            <button class="btn sm ghost" onclick="A.orderView('${o.id}')">تفاصيل</button>
            ${o.status !== 'مرسل' ? `<button class="btn sm" onclick="A.pushOrder('${o.id}')">📤 ابعت</button>` : ''}
          </td></tr>`).join('') || '<tr><td colspan="7" class="muted">مفيش طلبات لسه</td></tr>'}
      </table></div>`
    : sub === 'collections' ? `
      ${(d.byMethod || []).length ? `<div class="kpi-grid">
        ${d.byMethod.map(m => `<div class="kpi">
          <div class="num" style="color:${m.custody ? 'var(--amber)' : 'var(--green)'}">${money(m.total)}</div>
          <div class="lbl">${esc(m.method)} (${m.count})${m.custody ? ' — عهدة' : ''}</div>
          ${m.pushed < m.total ? '<div class="muted" style="font-size:11px">في قيود: ' + money(m.pushed) + '</div>' : ''}
        </div>`).join('')}
      </div>` : ''}
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>سند رقم</th><th>العميل</th><th>المندوب</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الحالة</th><th>العهدة</th><th></th></tr>
        ${cols.map(c => `<tr>
          <td>${esc(String(c.date).slice(0, 10))} <span class="muted">${esc(c.time || '')}</span></td>
          <td><b>${esc(c.voucher || '—')}</b></td>
          <td><b>${esc(c.customer_name)}</b></td>
          <td>${esc(c.rep_name)}</td>
          <td><b style="color:var(--green)">${money(c.amount)}</b></td>
          <td>${esc(c.method)}</td>
          <td>${esc(c.reference || '—')}</td>
          <td>${c.status === 'بانتظار البنك' ? '<span class="badge warm">🏦 مستني البنك</span>'
              : c.status === 'مطابق' ? '<span class="badge info">🏦 اتطابق</span>'
              : statusBadge(c.status, c.error)}
            ${c.bank_name ? '<div class="muted" style="font-size:11px">' + esc(c.bank_name) + '</div>' : ''}</td>
          <td>${c.settlement_id ? '<span class="badge cool">اتورد</span>' : (c.method === 'كاش' ? '<span class="badge warm">في العهدة</span>' : '—')}</td>
          <td style="white-space:nowrap">
            ${c.receipt ? `<button class="btn sm ghost" onclick="A.viewReceipt('${c.id}')">📄 السند</button>`
              : c.signature ? attachLinks({ signature: c.signature })
              : '<span class="muted" style="font-size:11px">مفيش سند</span>'}
            ${c.status !== 'مرسل' ? `<button class="btn sm" onclick="A.pushCollection('${c.id}')">📤 ابعت</button>` : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="10" class="muted">مفيش تحصيلات لسه</td></tr>'}
      </table></div>`
    : `
      <div class="table-wrap"><table>
        <tr><th>المندوب</th><th>رصيد بداية</th><th>+ تحصيلات</th><th>− مصروفات</th><th>= اللي معاه</th><th>الصرف</th><th></th></tr>
        ${(d.repCash || []).map(r => `<tr>
          <td><b>${esc(r.rep_name)}</b></td>
          <td>${money(r.opening)}${r.openingDate ? '<div class="muted" style="font-size:11px">' + esc(r.openingDate) + '</div>' : ''}</td>
          <td class="pos">${money(r.collections)}</td>
          <td class="neg">${money(r.expenses)}</td>
          <td><b style="color:${r.cash ? 'var(--amber)' : 'inherit'}">${money(r.cash)} ${esc(d.currency)}</b></td>
          <td>${r.canSpend ? '<span class="badge warm">مسموح</span>' : '<span class="badge gray">ممنوع</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn sm ghost" onclick="A.openingForm('${r.rep_id}','${esc(r.rep_name)}',${r.opening})">رصيد بداية</button>
            ${(r.cash || r.count) ? `<button class="btn sm green" onclick="A.settleForm('${r.rep_id}','${esc(r.rep_name)}',${r.cash})">✔ استلام</button>` : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">مفيش مناديب</td></tr>'}
      </table></div>
      <div class="section-title"><span>المصروفات (${(d.expenses || []).length})</span></div>
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>المندوب</th><th>النوع</th><th>المبلغ</th><th>البيان</th><th>الحالة</th><th></th></tr>
        ${(d.expenses || []).slice().reverse().slice(0, 60).map(e => `<tr>
          <td>${esc(String(e.date).slice(0, 10))}</td><td>${esc(e.rep_name)}</td>
          <td><span class="badge info">${esc(e.category)}</span></td>
          <td><b class="neg">${money(e.amount)}</b></td>
          <td>${esc(e.description || '')}</td>
          <td>${e.settlement_id ? '<span class="badge cool">اتقفل</span>' : '<span class="badge warm">مفتوح</span>'}</td>
          <td>${e.settlement_id ? '' : `<button class="btn sm red" onclick="A.deleteExpense('${e.id}')">حذف</button>`}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">مفيش مصروفات</td></tr>'}
      </table></div>
      <div class="section-title"><span>سجل التوريدات</span></div>
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>المندوب</th><th>رصيد بداية</th><th>تحصيلات</th><th>مصروفات</th><th>المستحق</th><th>المستلم</th><th>الباقي</th><th>استلمها</th></tr>
        ${(d.settlements || []).slice().reverse().map(s => `<tr>
          <td>${esc(String(s.date).slice(0, 10))}</td><td>${esc(s.rep_name)}</td>
          <td>${money(s.opening)}</td><td class="pos">${money(s.collections_total)}</td>
          <td class="neg">${money(s.expenses_total)}</td><td>${money(s.balance)}</td>
          <td><b>${money(s.amount)}</b></td>
          <td>${Number(s.carried) ? '<span class="badge warm">' + money(s.carried) + '</span>' : '—'}</td>
          <td>${esc(s.admin_name || '')}</td>
        </tr>`).join('') || '<tr><td colspan="9" class="muted">مفيش توريدات</td></tr>'}
      </table></div>`}`;
}

// ----- تقرير المصروفات (بأي فترة، حتى القديمة والمؤرشفة) -----
function adExpenses() {
  const r = S.exp;
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const cats = (r && r.categories) || [];
  return `
    <div class="card">
      <h3>🧾 تقرير المصروفات</h3>
      <div class="grid2">
        <div><label>من تاريخ</label><input type="date" id="ex-from" value="${esc((r && r.from) || monthStart)}"></div>
        <div><label>إلى تاريخ</label><input type="date" id="ex-to" value="${esc((r && r.to) || today)}"></div>
      </div>
      <div class="grid2">
        <div><label>المندوب</label>
          <select id="ex-rep"><option value="">كل المناديب</option>
            ${reps.map(u => `<option value="${esc(u.id)}" ${S.expRep === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
          </select></div>
        <div><label>نوع المصروف</label>
          <select id="ex-cat"><option value="">كل الأنواع</option>
            ${cats.map(c => `<option ${S.expCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select></div>
      </div>
      <label><input type="checkbox" id="ex-arch" ${S.expArch ? 'checked' : ''} style="width:auto"> ضم المصروفات المؤرشفة (الأقدم من سنة)</label>
      <div class="flex mt">
        <button class="btn" onclick="A.loadExpenses()">عرض التقرير</button>
        <button class="btn ghost" onclick="A.quickExp('month')">الشهر ده</button>
        <button class="btn ghost" onclick="A.quickExp('year')">من أول السنة</button>
        <button class="btn ghost" onclick="A.quickExp('all')">من البداية</button>
      </div>
    </div>
    ${!r ? '<div class="empty"><div class="big">🧾</div>حدد الفترة واضغط "عرض التقرير"</div>' : `
      <div class="kpi-grid">
        <div class="kpi"><div class="num" style="color:var(--red)">${money(r.total)}</div>
          <div class="lbl">إجمالي المصروفات (${esc(r.currency)})</div></div>
        <div class="kpi"><div class="num">${r.count}</div><div class="lbl">عدد الحركات</div></div>
        ${r.byRep.slice(0, 2).map(x => `<div class="kpi"><div class="num">${money(x.total)}</div>
          <div class="lbl">${esc(x.name)}</div></div>`).join('')}
      </div>
      ${r.byCategory.length ? `<div class="section-title"><span>حسب النوع</span></div>
        <div class="table-wrap"><table>
          <tr><th>النوع</th><th>الإجمالي</th><th>النسبة</th></tr>
          ${r.byCategory.map(c => `<tr><td><span class="badge info">${esc(c.name)}</span></td>
            <td><b>${money(c.total)}</b></td>
            <td>${r.total ? Math.round(c.total / r.total * 100) : 0}%</td></tr>`).join('')}
        </table></div>` : ''}
      ${r.byRep.length > 1 ? `<div class="section-title"><span>حسب المندوب</span></div>
        <div class="table-wrap"><table>
          <tr><th>المندوب</th><th>الإجمالي</th><th>النسبة</th></tr>
          ${r.byRep.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${money(x.total)}</td>
            <td>${r.total ? Math.round(x.total / r.total * 100) : 0}%</td></tr>`).join('')}
        </table></div>` : ''}
      <div class="section-title"><span>التفاصيل (${r.rows.length}${r.truncated ? ' من ' + r.count : ''})</span>
        <button class="btn sm ghost" onclick="A.exportExpenses()">⬇️ تنزيل Excel</button></div>
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>سند رقم</th><th>المندوب</th><th>النوع</th><th>المبلغ</th><th>البيان</th>
            <th>قيود</th><th>التوريد</th></tr>
        ${r.rows.map(e => `<tr>
          <td>${esc(e.date)} <span class="muted">${esc(e.time || '')}</span></td>
          <td><b>${esc(e.voucher || '—')}</b></td>
          <td>${esc(e.rep_name)}</td>
          <td><span class="badge info">${esc(e.category)}</span></td>
          <td><b class="neg">${money(e.amount)}</b></td>
          <td>${esc(e.description || '')}</td>
          <td>${e.pushStatus === 'مرحّل' ? '<span class="badge cool">قيد ' + esc(e.entryId) + '</span>'
                : e.pushStatus === 'فشل' ? '<span class="badge hot">فشل</span>'
                : '<span class="badge gray">لسه</span>'}</td>
          <td>${e.settled ? '<span class="badge cool">اتورد ' + esc(e.settledDate) + '</span>'
                          : '<span class="badge warm">مفتوح</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="muted">مفيش مصروفات في الفترة دي</td></tr>'}
      </table></div>
      ${r.truncated ? '<p class="muted">معروض أول 500 حركة — ضيّق الفترة أو نزّل الملف للتفاصيل الكاملة.</p>' : ''}
    `}`;
}

A.loadExpenses = async () => {
  const payload = {
    from: ($('#ex-from') || {}).value || '', to: ($('#ex-to') || {}).value || '',
    rep_id: ($('#ex-rep') || {}).value || '', category: ($('#ex-cat') || {}).value || '',
    includeArchive: ($('#ex-arch') || {}).checked || false
  };
  S.expRep = payload.rep_id; S.expCat = payload.category; S.expArch = payload.includeArchive;
  toast('⏳ بجهز التقرير...');
  try { S.exp = await api('expenseReport', payload); render(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.quickExp = (kind) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = kind === 'month' ? today.slice(0, 8) + '01'
             : kind === 'year' ? today.slice(0, 4) + '-01-01' : '';
  $('#ex-from').value = from;
  $('#ex-to').value = today;
  if (kind === 'all') $('#ex-arch').checked = true;
  A.loadExpenses();
};
A.exportExpenses = () => {
  const rows = (S.exp.rows || []).map(e => ({
    'التاريخ': e.date, 'الوقت': e.time, 'رقم السند': e.voucher || '',
    'المندوب': e.rep_name, 'النوع': e.category,
    'المبلغ': e.amount, 'البيان': e.description,
    'قيد قيود': e.pushStatus === 'مرحّل' ? e.entryId : (e.pushStatus || 'لسه'),
    'حالة التوريد': e.settled ? 'اتورد ' + e.settledDate : 'مفتوح'
  }));
  downloadCsv('تقرير_المصروفات_' + (S.exp.from || 'من_البداية') + '_' + (S.exp.to || 'للنهارده'), rows);
};

// ----- ترحيل مصروفات المناديب لقيود كقيد يومية -----
// المندوب كتب: رقم السند + البيان + القيمة + التاريخ.
// الأدمن هنا بيحدد: الحساب لكل مصروف + فيه ضريبة ولا لأ + وبيرحّل.
function adExpJournal() {
  const r = S.expj;
  if (!r) { A.loadExpJournal(); return '<div class="empty"><div class="big">⏳</div>بيحمل المصروفات...</div>'; }
  const accs = A._accounts || [];
  const rows = (r.rows || []).filter(e => !S.expjRep || String(e.rep_id) === String(S.expjRep));
  const ready = rows.filter(e => e.account_id);
  const accSelect = (id, current) => `<select class="exj-acc" data-id="${esc(id)}" onchange="A.expjSet('${esc(id)}','acc',this.value)">
      ${accs.length
        ? '<option value="">— اختار الحساب —</option>' + accs.map(a =>
            `<option value="${esc(String(a.id))}" ${String(a.id) === String(current || '') ? 'selected' : ''}>${esc(a.name)}</option>`).join('')
        : `<option value="${esc(String(current || ''))}">${current ? 'حساب ' + esc(String(current)) : '— اضغط جيب الحسابات —'}</option>`}
    </select>`;

  return `
    <div class="card">
      <h3>📒 ترحيل المصروفات لقيود (قيد يومية)</h3>
      <p class="muted">المندوب سجّل السند والبيان والقيمة والتاريخ. انت اللي بتحدد الحساب والضريبة وبترحّل.
      أرقام السندات كلها بتتكتب في تفاصيل القيد على قيود عشان تبقى مرجع.</p>
      ${!accs.length ? `<button class="btn sm" onclick="A.expjAccounts()">🔄 جيب الحسابات من قيود</button>` : ''}
      <div class="grid2 mt">
        <div><label>الحساب الدائن (الفلوس خرجت منه)</label>
          <select id="exj-credit">
            ${accs.length
              ? '<option value="">— اختار —</option>' + accs.map(a =>
                  `<option value="${esc(String(a.id))}" ${String(a.id) === String(r.creditAccount || '') ? 'selected' : ''}>${esc(a.name)}</option>`).join('')
              : `<option value="${esc(String(r.creditAccount || ''))}">${r.creditAccount ? 'حساب ' + esc(String(r.creditAccount)) : '— اضغط جيب الحسابات —'}</option>`}
          </select></div>
        <div><label>حساب ضريبة المدخلات (${r.vatPercent}%)</label>
          <select id="exj-vatacc">
            ${accs.length
              ? '<option value="">— اختار —</option>' + accs.map(a =>
                  `<option value="${esc(String(a.id))}" ${String(a.id) === String(r.vatAccount || '') ? 'selected' : ''}>${esc(a.name)}</option>`).join('')
              : `<option value="${esc(String(r.vatAccount || ''))}">${r.vatAccount ? 'حساب ' + esc(String(r.vatAccount)) : '— اضغط جيب الحسابات —'}</option>`}
          </select></div>
      </div>
      <div class="flex mt">
        <button class="btn ghost sm" onclick="A.expjSaveAccounts()">💾 احفظ الحسابات دي</button>
        <button class="btn ghost sm" onclick="A.expjDefaults()">⚙️ حساب افتراضي لكل نوع مصروف</button>
        <button class="btn ghost sm" onclick="A.loadExpJournal()">🔄 تحديث</button>
      </div>
      ${(!r.creditAccount) ? '<p class="muted mt" style="color:var(--amber)">⚠️ لازم تحدد الحساب الدائن وتحفظه قبل أي ترحيل.</p>' : ''}
    </div>

    ${!rows.length ? '<div class="empty"><div class="big">✅</div>مفيش مصروفات مستنية الترحيل</div>' : `
    <div class="card">
      <div class="grid2">
        <div><label>المندوب</label>
          <select onchange="S.expjRep=this.value; render()">
            <option value="">كل المناديب</option>
            ${(S.data.users || []).filter(u => u.role === 'rep').map(u =>
              `<option value="${esc(u.id)}" ${String(S.expjRep) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
          </select></div>
        <div><label>تاريخ القيد</label><input type="date" id="exj-date" value="${todayISO()}"></div>
      </div>
      <div class="flex mt">
        <button class="btn ghost sm" onclick="A.expjSelectAll(true)">✅ حدد الكل</button>
        <button class="btn ghost sm" onclick="A.expjSelectAll(false)">⬜ إلغاء التحديد</button>
        <button class="btn ghost sm" onclick="A.expjBulkAcc()">📌 طبّق حساب على المحدد</button>
        <button class="btn ghost sm" onclick="A.expjBulkVat(true)">➕ شامل ضريبة</button>
        <button class="btn ghost sm" onclick="A.expjBulkVat(false)">➖ من غير ضريبة</button>
      </div>
    </div>
    <div class="section-title"><span>مستني الترحيل (${rows.length}) — جاهز منهم ${ready.length}</span>
      <button class="btn sm amber" onclick="A.expjPreview()">👁 معاينة القيد</button></div>
    <div class="table-wrap"><table>
      <tr><th></th><th>التاريخ</th><th>سند رقم</th><th>المندوب</th><th>النوع</th><th>المبلغ</th>
          <th>البيان</th><th>الحساب في قيود</th><th>شامل ضريبة؟</th><th></th></tr>
      ${rows.map(e => `<tr>
        <td><input type="checkbox" class="exj-sel" data-id="${esc(e.id)}" ${e.account_id ? 'checked' : ''}></td>
        <td>${esc(e.date)}</td>
        <td><b>${esc(e.voucher || '—')}</b></td>
        <td>${esc(e.rep_name)}</td>
        <td><span class="badge info">${esc(e.category)}</span></td>
        <td><b class="neg">${money(e.amount)}</b></td>
        <td>${esc(e.description || '')}</td>
        <td>${accSelect(e.id, e.account_id)}</td>
        <td style="text-align:center"><input type="checkbox" class="exj-vat" data-id="${esc(e.id)}"
            ${e.has_vat ? 'checked' : ''} onchange="A.expjSet('${esc(e.id)}','vat',this.checked)"></td>
        <td>${e.push_status === 'فشل' ? '<span class="badge hot" title="' + esc(e.push_error || '') + '">فشل قبل كده</span>' : ''}</td>
      </tr>`).join('')}
    </table></div>
    <p class="muted">المبلغ اللي "شامل ضريبة" بيتقسم: الصافي على حساب المصروف، والضريبة على حساب المدخلات — والإجمالي بيتخصم من الحساب الدائن.</p>
    `}`;
}

A.loadExpJournal = async () => {
  if (A._expjLoading) return;
  A._expjLoading = true;
  try {
    S.expj = await api('expensesToPush', {});
    if (!A._accounts || !A._accounts.length) { try { await A.expjAccounts(true); } catch (e) { /* الشاشة بتشتغل من غيرهم */ } }
    render();
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
  finally { A._expjLoading = false; }
};
A.expjAccounts = async (quiet) => {
  if (!quiet) toast('⏳ بجيب الحسابات من قيود...');
  const r = await api('qoyodLists', {});
  A._accounts = r.accounts || [];
  if (!quiet) { toast(A._accounts.length ? 'جبت ' + A._accounts.length + ' حساب ✅' : (r.accountsError || 'مفيش حسابات'), A._accounts.length ? 'ok' : 'err'); render(); }
};
/** بيحفظ اختيار الأدمن في الذاكرة عشان ميضيعش لما الشاشة تترسم تاني */
A.expjSet = (id, what, val) => {
  const row = (S.expj.rows || []).find(x => String(x.id) === String(id));
  if (!row) return;
  if (what === 'acc') row.account_id = val; else row.has_vat = !!val;
};
A.expjSelectAll = (on) => { document.querySelectorAll('.exj-sel').forEach(c => c.checked = on); };
A.expjSelected = () => Array.from(document.querySelectorAll('.exj-sel'))
  .filter(c => c.checked).map(c => c.dataset.id);
A.expjBulkAcc = () => {
  const accs = A._accounts || [];
  if (!accs.length) return toast('اضغط "جيب الحسابات من قيود" الأول', 'err');
  const ids = A.expjSelected();
  if (!ids.length) return toast('حدد المصروفات الأول', 'err');
  A._expjBulkIds = ids;
  openModal(`
    <h2>📌 حساب للمصروفات المحددة (${ids.length})</h2>
    <label>الحساب في قيود</label>
    <select id="exj-bulk-acc">${accs.map(a => `<option value="${esc(String(a.id))}">${esc(a.name)}</option>`).join('')}</select>
    <div class="modal-actions">
      <button class="btn" onclick="A.expjBulkAccApply()">طبّق</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.expjBulkAccApply = () => {
  const val = $('#exj-bulk-acc').value;
  const ids = A._expjBulkIds || A.expjSelected();
  closeModal();
  ids.forEach(id => A.expjSet(id, 'acc', val));
  document.querySelectorAll('.exj-sel').forEach(c => {
    if (!c.checked) return;
    const sel = document.querySelector('.exj-acc[data-id="' + c.dataset.id + '"]');
    if (sel) sel.value = val;
  });
  toast('اتطبق على ' + ids.length + ' مصروف', 'ok');
};
A.expjBulkVat = (on) => {
  const ids = A.expjSelected();
  if (!ids.length) return toast('حدد المصروفات الأول', 'err');
  ids.forEach(id => A.expjSet(id, 'vat', on));
  document.querySelectorAll('.exj-vat').forEach(c => { if (ids.indexOf(c.dataset.id) > -1) c.checked = on; });
  toast(on ? 'اتحددوا "شامل ضريبة"' : 'اتشالت الضريبة', 'ok');
};
/** بيجمع اختيارات الأدمن من الشاشة */
A.expjPayload = () => {
  const ids = A.expjSelected();
  const meta = {};
  ids.forEach(id => {
    const acc = document.querySelector('.exj-acc[data-id="' + id + '"]');
    const vat = document.querySelector('.exj-vat[data-id="' + id + '"]');
    meta[id] = { account_id: acc ? acc.value : '', has_vat: vat ? vat.checked : false };
  });
  return { ids: ids, meta: meta, date: ($('#exj-date') || {}).value || todayISO() };
};
A.expjPreview = async () => {
  const p = A.expjPayload();
  if (!p.ids.length) return toast('حدد المصروفات اللي عايز ترحّلها', 'err');
  const missing = p.ids.filter(id => !p.meta[id].account_id);
  if (missing.length) return toast('في ' + missing.length + ' مصروف من غير حساب — حدد الحساب الأول', 'err');
  toast('⏳ بجهز القيد...');
  try {
    const r = await api('pushExpenseJournal', Object.assign({ dryRun: true }, p));
    A._expjDraft = p;
    renderExpjPreview(r.summary);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
function accName(id) {
  const a = (A._accounts || []).find(x => String(x.id) === String(id));
  return a ? a.name : 'حساب ' + id;
}
function renderExpjPreview(s) {
  openModal(`
    <h2>👁 معاينة القيد قبل الترحيل</h2>
    <p class="modal-sub">${esc(s.date)} — ${s.count} سند</p>
    <div class="card">
      <div class="stat-line"><span>إجمالي المصروفات</span><b>${money(s.totalGross)} ${esc(s.currency)}</b></div>
      <div class="stat-line"><span>منها صافي</span><b>${money(s.totalNet)}</b></div>
      <div class="stat-line"><span>منها ضريبة</span><b>${money(s.totalVat)}</b></div>
    </div>
    <div class="section-title"><span>شكل القيد</span></div>
    <div class="table-wrap"><table>
      <tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr>
      ${s.debits.map(d => `<tr><td>${esc(accName(d.account_id))}</td>
        <td><b>${money(d.amount)}</b></td><td class="muted">—</td></tr>`).join('')}
      ${s.credits.map(c => `<tr><td>${esc(accName(c.account_id))}</td>
        <td class="muted">—</td><td><b>${money(c.amount)}</b></td></tr>`).join('')}
      <tr style="background:var(--blue-soft)"><td><b>الإجمالي</b></td>
        <td><b>${money(s.totalDebit)}</b></td><td><b>${money(s.totalCredit)}</b></td></tr>
    </table></div>
    <div class="section-title"><span>السندات اللي جوه القيد</span></div>
    <div class="table-wrap"><table>
      <tr><th>سند</th><th>التاريخ</th><th>المندوب</th><th>البيان</th><th>المبلغ</th><th>ضريبة</th></tr>
      ${s.lines.map(l => `<tr><td><b>${esc(l.voucher || '—')}</b></td><td>${esc(l.date)}</td>
        <td>${esc(l.rep)}</td><td>${esc(l.description || '')}</td>
        <td>${money(l.gross)}</td><td>${l.vat ? money(l.vat) : '—'}</td></tr>`).join('')}
    </table></div>
    ${s.problems && s.problems.length ? `<div class="card" style="border-right:4px solid var(--amber)">
      <b>⚠️ اتساب من القيد:</b><ul>${s.problems.map(p => '<li>' + esc(p) + '</li>').join('')}</ul></div>` : ''}
    <p class="muted mt">وصف القيد على قيود: <b>${esc(s.description)}</b></p>
    <div class="modal-actions">
      <button class="btn amber" onclick="A.expjPush()">📤 رحّل لقيود دلوقتي</button>
      <button class="btn outline" onclick="A.closeModal()">رجوع</button>
    </div>`, null, true);
}
A.expjPush = async () => {
  const p = A._expjDraft;
  if (!p) return toast('اعمل معاينة الأول', 'err');
  closeModal();
  toast('⏳ بيترحّل لقيود...');
  try {
    const r = await api('pushExpenseJournal', p);
    toast(r.message, 'ok');
    A._expjDraft = null;
    A.loadExpJournal();
  } catch (e) { toast(e.msg || 'خطأ في الترحيل', 'err'); A.loadExpJournal(); }
};
A.expjSaveAccounts = async () => {
  const payload = {
    map: (S.expj && S.expj.categoryAccounts) || {},
    creditAccount: ($('#exj-credit') || {}).value || '',
    vatAccount: ($('#exj-vatacc') || {}).value || ''
  };
  try { const r = await api('saveExpenseAccounts', payload); toast(r.message, 'ok'); A.loadExpJournal(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
/** حساب افتراضي لكل نوع مصروف — عشان المرة الجاية يتملي لوحده */
A.expjDefaults = () => {
  const r = S.expj, accs = A._accounts || [];
  if (!accs.length) return toast('اضغط "جيب الحسابات من قيود" الأول', 'err');
  openModal(`
    <h2>⚙️ الحساب الافتراضي لكل نوع مصروف</h2>
    <p class="modal-sub">لما المندوب يسجل مصروف من النوع ده، الحساب ده هيتحدد لوحده.</p>
    ${(r.categories || []).map(c => `
      <label>${esc(c)}</label>
      <select class="exj-def" data-cat="${esc(c)}">
        <option value="">— من غير —</option>
        ${accs.map(a => `<option value="${esc(String(a.id))}" ${String(a.id) === String((r.categoryAccounts || {})[c] || '') ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>`).join('')}
    <div class="modal-actions">
      <button class="btn" onclick="A.expjDefaultsSave()">حفظ</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.expjDefaultsSave = async () => {
  const map = {};
  document.querySelectorAll('.exj-def').forEach(s => { if (s.value) map[s.dataset.cat] = s.value; });
  closeModal();
  try {
    const r = await api('saveExpenseAccounts', { map: map });
    toast(r.message, 'ok');
    A.loadExpJournal();
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- مطابقة الحوالات البنكية -----
function adBank() {
  const b = S.bank;
  if (!b) { A.loadBank(); return '<div class="empty"><div class="big">⏳</div>بيحمل بيانات البنك...</div>'; }
  const banks = b.banks || [];
  const cur = b.currency;
  return `
    ${!banks.length ? `<div class="card" style="border-right:4px solid var(--amber)">
      <b>⚠️ لسه محددتش بنوكك</b>
      <p class="muted">روح <b>الإعدادات ← البنوك</b> وضيف بنوكك وحساب كل واحد في قيود، وبعدين ارجع هنا.</p>
    </div>` : `
    <div class="card">
      <h3>📥 ارفع كشف حساب البنك</h3>
      <p class="muted">النظام هيطابق التاريخ والمبلغ مع الحوالات اللي المناديب سجلوها.
      المتطابق بس هو اللي هيترفع لقيود على حساب البنك ده.</p>
      <label>البنك</label>
      <select id="bk-bank">${banks.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
      <div class="flex mt">
        <button class="btn ghost sm" onclick="A.bankTemplate()">📄 نزّل التمبلت</button>
        <input type="file" id="bk-file" accept=".csv,text/csv" style="display:none" onchange="A.bankPreview(this)">
        <button class="btn sm" onclick="document.getElementById('bk-file').click()">⬆️ ارفع الكشف</button>
      </div>
      <p class="muted mt">التمبلت أعمدته: <b>التاريخ · المبلغ · رقم العملية · البيان</b> — احفظه CSV UTF-8.</p>
      <div id="bk-result"></div>
    </div>`}

    <div class="section-title"><span>⏳ حوالات مستنية تأكيد البنك (${(b.pending || []).length})</span></div>
    <div class="table-wrap"><table>
      <tr><th>تاريخ التسجيل</th><th>العميل</th><th>المندوب</th><th>المبلغ</th><th>المرجع</th><th>الحالة</th></tr>
      ${(b.pending || []).map(p => `<tr>
        <td>${esc(p.date)}</td><td><b>${esc(p.customer)}</b></td><td>${esc(p.rep)}</td>
        <td><b>${money(p.amount)}</b></td><td>${esc(p.ref || '—')}</td>
        <td><span class="badge warm">لسه مظهرتش في البنك</span></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">مفيش حوالات معلقة 👍</td></tr>'}
    </table></div>

    <div class="section-title"><span>❓ حوالات في البنك ومحدش سجّلها (${(b.rows || []).length})</span></div>
    <div class="table-wrap"><table>
      <tr><th>التاريخ</th><th>البنك</th><th>المبلغ</th><th>رقم العملية</th><th>البيان</th><th></th></tr>
      ${(b.rows || []).map(r => `<tr>
        <td>${esc(r.date)}</td><td>${esc(r.bank_name)}</td>
        <td><b class="pos">${money(r.amount)}</b></td>
        <td>${esc(r.ref || '—')}</td>
        <td class="muted">${esc(r.description || '')}</td>
        <td style="white-space:nowrap">
          ${r.notified ? '<span class="badge info">اتبعت</span>'
            : `<button class="btn sm amber" onclick="A.notifyBank('${r.id}')">📣 اسأل المناديب</button>`}
          <button class="btn sm outline" onclick="A.closeBank('${r.id}')">إقفال</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">مفيش سطور بنك معلقة 👍</td></tr>'}
    </table></div>
    <p class="muted">"اسأل المناديب" بتبعت لكلهم إشعار في التطبيق وعلى تليجرام بمبلغ الحوالة وتاريخها.</p>`;
}

A.loadBank = async () => {
  if (A._bankLoading) return;
  A._bankLoading = true;
  try { S.bank = await api('bankUnmatched', {}); render(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
  finally { A._bankLoading = false; }
};

A.bankTemplate = () => {
  downloadCsv('تمبلت_كشف_البنك', [{ 'التاريخ': '2026-08-15', 'المبلغ': '5000', 'رقم العملية': '', 'البيان': '' }]);
  toast('املا الصفوف من كشف البنك واحفظه CSV UTF-8', 'ok');
};

A.bankPreview = async (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = '';
  const bankId = $('#bk-bank').value;
  const box = document.getElementById('bk-result');
  box.innerHTML = '<div class="card">⏳ بيقرا الكشف...</div>';
  const grid = parseCsv(await file.text());
  if (grid.length < 2) { box.innerHTML = '<div class="card" style="color:var(--red)">الملف فاضي</div>'; return; }
  const headers = grid[0].map(h => String(h).trim());
  const rows = grid.slice(1).map((r, i) => {
    const o = { __row: i + 2 };
    headers.forEach((h, j) => o[h] = r[j] === undefined ? '' : r[j]);
    return o;
  });
  A._bankRows = rows; A._bankId = bankId;
  try {
    const r = await api('bankMatch', { bank_id: bankId, rows: rows, dryRun: true });
    box.innerHTML = bankSummaryHtml(r.summary, true);
  } catch (e) {
    box.innerHTML = '<div class="card" style="color:var(--red)">' + esc(e.msg || 'خطأ') + '</div>';
  }
};

function bankSummaryHtml(s, isPreview) {
  return `
    <div class="card" style="border-right:4px solid ${s.matched ? 'var(--green)' : 'var(--amber)'}">
      <b>${isPreview ? 'نتيجة الفحص (لسه محفظتش حاجة)' : '✅ تم التنفيذ'} — ${esc(s.bank)}</b>
      <div class="stat-line"><span>سطور اتقرت من الكشف</span><b>${s.read}</b></div>
      <div class="stat-line"><span>حوالات هتتطابق وترفع لقيود</span><b class="pos">${s.matched} (${money(s.matchedAmount)} ${esc(s.currency)})</b></div>
      <div class="stat-line"><span>سطور بنك من غير صاحب</span><b class="${s.unmatchedBank ? 'neg' : ''}">${s.unmatchedBank} (${money(s.unmatchedBankAmount)})</b></div>
      <div class="stat-line"><span>حوالات مناديب لسه مظهرتش</span><b>${s.stillPending}</b></div>
      ${s.errorCount ? '<div class="stat-line"><span>سطور فيها مشاكل</span><b class="neg">' + s.errorCount + '</b></div>' : ''}
      ${s.sent !== undefined ? '<div class="stat-line"><span>اتبعت لقيود</span><b class="pos">' + s.sent + '</b></div>' : ''}
    </div>
    ${s.preview && s.preview.length ? `<div class="table-wrap"><table>
      <tr><th>تاريخ البنك</th><th>المبلغ</th><th>العميل</th><th>المندوب</th><th>تاريخ التسجيل</th></tr>
      ${s.preview.map(p => `<tr><td>${esc(p.date)}</td><td><b>${money(p.amount)}</b></td>
        <td>${esc(p.customer)}</td><td>${esc(p.rep)}</td><td>${esc(p.repDate)}</td></tr>`).join('')}
    </table></div>` : ''}
    ${s.errors && s.errors.length ? `<div class="card"><b>⚠️ سطور اتساب:</b>
      ${s.errors.map(e => '<div class="muted">صف ' + e.row + ': ' + esc(e.reason) + '</div>').join('')}</div>` : ''}
    ${s.pushErrors && s.pushErrors.length ? `<div class="card" style="color:var(--red)"><b>فشل إرسال:</b>
      ${s.pushErrors.map(e => '<div>' + esc(e) + '</div>').join('')}</div>` : ''}
    ${isPreview && s.matched ? `<button class="btn green full" onclick="A.bankApply()">✔ نفّذ المطابقة وابعت لقيود</button>` : ''}
    ${isPreview && !s.matched ? '<div class="card muted">مفيش حوالات متطابقة — السطور هتتسجل كـ"من غير صاحب" لو نفّذت.</div>' +
      '<button class="btn amber full" onclick="A.bankApply()">تسجيل سطور البنك من غير مطابقة</button>' : ''}`;
}

A.bankApply = async () => {
  const box = document.getElementById('bk-result');
  box.innerHTML = '<div class="card">⏳ بينفّذ ويبعت لقيود...</div>';
  try {
    const r = await api('bankMatch', { bank_id: A._bankId, rows: A._bankRows, dryRun: false });
    box.innerHTML = bankSummaryHtml(r.summary, false);
    toast(r.message, 'ok');
    S.bank = null; S.sales = null; A.loadBank();
  } catch (e) {
    box.innerHTML = '<div class="card" style="color:var(--red)">' + esc(e.msg || 'خطأ') + '</div>';
  }
};

A.notifyBank = async (id) => {
  if (!confirm('هيتبعت إخطار لكل المناديب بمبلغ الحوالة وتاريخها. نكمل؟')) return;
  try { const r = await api('notifyBankRow', { id: id }); toast(r.message, 'ok'); S.bank = null; A.loadBank(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.closeBank = async (id) => {
  const note = prompt('سبب الإقفال (مثال: تحويل من مورد مش عميل):', '');
  if (note === null) return;
  try { const r = await api('closeBankRow', { id: id, note: note }); toast(r.message, 'ok'); S.bank = null; A.loadBank(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

/** روابط الصور والتوقيع في جداول الأدمن */
function attachLinks(row) {
  const photos = String(row.photos || '').split(',').filter(Boolean);
  const sig = row.signature;
  if (!photos.length && !sig) return '<span class="muted">—</span>';
  let h = '';
  if (photos.length) h += `<button class="btn sm ghost" onclick="A.viewAttachments('${esc(JSON.stringify(photos).replace(/'/g, ''))}')">📷 ${photos.length}</button>`;
  if (sig) h += `<button class="btn sm ghost" onclick="A.viewAttachments('${esc(JSON.stringify([sig]).replace(/'/g, ''))}')">✍️</button>`;
  return h;
}
/** المرفقات محفوظة خاصة على درايف — بنجيبها من السيرفر بعد التحقق من الصلاحية */
A.viewAttachments = async (json) => {
  let urls = [];
  try { urls = JSON.parse(json); } catch (e) { return; }
  openModal(`
    <h2>📎 المرفقات (${urls.length})</h2>
    <div class="attach-grid" id="attach-box">${urls.map((u, i) =>
      `<div class="attach-cell" id="att-${i}"><span class="muted">⏳ بيحمّل...</span></div>`).join('')}</div>
    <p class="muted mt">الملفات محفوظة خاصة على درايف — مفيش رابط عام حد يقدر يفتحه.</p>
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  for (let i = 0; i < urls.length; i++) {
    const cell = document.getElementById('att-' + i);
    if (!cell) return;
    try {
      const r = await api('getAttachment', { url: urls[i] });
      cell.innerHTML = `<a href="${esc(urls[i])}" target="_blank" rel="noopener">
        <img src="${esc(r.data)}" alt="مرفق"></a>`;
    } catch (e) {
      cell.innerHTML = '<span class="muted">' + esc(e.msg || 'مقدرتش أعرضه') + '</span>';
    }
  }
};

function statusBadge(st, err) {
  if (st === 'مرسل') return '<span class="badge cool">✅ في قيود</span>';
  if (st === 'فشل') return '<span class="badge hot" title="' + esc(err || '') + '">❌ فشل</span>';
  return '<span class="badge warm">⏳ مستني</span>';
}

A.salesTab = (t) => { S.salesTab = t; render(); };
A.loadSales = async () => {
  if (A._salesLoading) return;
  A._salesLoading = true;
  try { const r = await api('salesData', {}); S.sales = r; render(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
  finally { A._salesLoading = false; }
};
A.orderView = async (id) => {
  try {
    const r = await api('orderItems', { id: id });
    const o = r.order;
    openModal(`
      <h2>🛒 طلب ${esc(o.customer_name)}</h2>
      <p class="modal-sub">${esc(String(o.date).slice(0, 10))} • المندوب ${esc(o.rep_name)} • ${statusBadge(o.status, o.error)}</p>
      ${o.error ? `<div class="card" style="border-right:4px solid var(--red)">
        <b>❌ سبب الفشل (زي ما قيود رجّعه):</b>
        <div class="err-box" id="err-text">${esc(o.error)}</div>
        <button class="btn sm ghost mt" onclick="A.copyText('err-text')">📋 نسخ نص الخطأ</button>
      </div>` : ''}
      <div class="table-wrap"><table>
        <tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
        ${r.items.map(i => `<tr><td>${esc(i.name)}<div class="muted">${esc(i.sku || '')}</div></td>
          <td>${i.qty}</td><td>${money(i.price)}</td><td><b>${money(i.total)}</b></td></tr>`).join('')}
      </table></div>
      <div class="card mt">
        <div class="stat-line"><span>قبل الضريبة</span><b>${money(o.subtotal)} ${esc(r.currency)}</b></div>
        <div class="stat-line"><span>الضريبة</span><b>${money(o.vat)}</b></div>
        <div class="stat-line"><span><b>الإجمالي</b></span><b>${money(o.total)}</b></div>
      </div>
      ${o.notes ? '<div class="card"><b>ملاحظات:</b> ' + esc(o.notes) + '</div>' : ''}
      <div class="modal-actions">
        ${o.status !== 'مرسل' ? `<button class="btn" onclick="A.closeModal();A.pushOrder('${o.id}')">📤 ابعت لقيود</button>
        <button class="btn red" onclick="A.deleteOrder('${o.id}')">حذف</button>` : ''}
        <button class="btn outline" onclick="A.closeModal()">إغلاق</button>
      </div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.copyText = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const txt = el.textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('✅ اتنسخ — ابعته عشان نظبط الإعداد', 'ok'));
  else toast('حدد النص وانسخه يدوي', 'err');
};

A.pushOrder = async (id) => {
  toast('⏳ ببعت لقيود...');
  try { const r = await api('pushOrder', { id: id }); toast(r.message, 'ok'); A.loadSales(); }
  catch (e) { toast(e.msg || 'فشل الإرسال', 'err'); A.loadSales(); }
};
A.pushCollection = async (id) => {
  toast('⏳ ببعت لقيود...');
  try { const r = await api('pushCollection', { id: id }); toast(r.message, 'ok'); A.loadSales(); }
  catch (e) { toast(e.msg || 'فشل الإرسال', 'err'); A.loadSales(); }
};
A.pushPending = async () => {
  toast('⏳ ببعت المعلق... ممكن ياخد دقيقة');
  try {
    const r = await api('pushPending', {});
    toast(r.message, r.errors && r.errors.length ? 'err' : 'ok');
    if (r.errors && r.errors.length) alert('فشل إرسال:\n' + r.errors.join('\n'));
    A.loadSales();
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.deleteOrder = async (id) => {
  if (!confirm('متأكد من حذف الطلب؟')) return;
  closeModal();
  try { await api('deleteOrder', { id: id }); toast('اتحذف', 'ok'); A.loadSales(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.settleForm = (repId, name, balance) => {
  openModal(`
    <h2>✔ استلام عهدة: ${esc(name)}</h2>
    <p class="modal-sub">المستحق عليه دلوقتي: <b>${money(balance)} ${esc(S.sales.currency)}</b></p>
    <label>المبلغ اللي استلمته</label>
    <input id="st-amount" type="text" inputmode="decimal" value="${balance}">
    <p class="muted">لو استلمت جزء بس، الباقي هيتحول تلقائي لرصيد بداية جديد عنده.</p>
    <label>ملاحظات</label><input id="st-note" placeholder="رقم الإيصال أو أي ملاحظة">
    <div class="modal-actions">
      <button class="btn green" onclick="A.settleCash('${repId}')">تأكيد الاستلام ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.settleCash = async (repId) => {
  const payload = { rep_id: repId, amount: normDigits($('#st-amount').value), note: $('#st-note').value.trim() };
  closeModal();
  try { const r = await api('settleCash', payload); toast(r.message, 'ok'); A.loadSales(); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.openingForm = (repId, name, current) => {
  openModal(`
    <h2>💼 رصيد بداية المدة: ${esc(name)}</h2>
    <p class="modal-sub">الفلوس اللي معاه قبل ما النظام يبدأ يحسب — عشان العهدة تسمع صح.</p>
    <label>المبلغ (${esc(S.sales.currency)})</label>
    <input id="op-amount" type="text" inputmode="decimal" value="${current || 0}">
    <label>تاريخ بداية المدة</label>
    <input id="op-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
    <div class="modal-actions">
      <button class="btn green" onclick="A.openingSave('${repId}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.openingSave = async (repId) => {
  const payload = { rep_id: repId, amount: normDigits($('#op-amount').value), date: $('#op-date').value };
  closeModal();
  try { const r = await api('setCashOpening', payload); toast(r.message, 'ok'); A.loadSales(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.deleteExpense = async (id) => {
  if (!confirm('متأكد من حذف المصروف ده؟')) return;
  try { await api('deleteExpense', { id: id }); toast('اتحذف', 'ok'); A.loadSales(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ================== استيراد وتحديث من ملف Excel/CSV ==================
/** قارئ CSV بسيط بيتعامل مع علامات التنصيص والفواصل جوه النص */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // شيل علامة BOM
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQ) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\r') { /* تجاهل */ }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

A.importForm = (type) => {
  type = type || 'customers';
  const label = type === 'leads' ? 'الليدز' : 'العملاء';
  openModal(`
    <h2>📥 استيراد وتحديث ${esc(label)} من ملف</h2>
    <p class="modal-sub">نزّل التمبلت، املاه، وارفعه — الموجود هيتحدث والجديد هيتضاف.</p>
    <div class="card">
      <b>1️⃣ نزّل الملف</b>
      <div class="flex mt">
        <button class="btn ghost sm" onclick="A.downloadTemplate('${type}', false)">📄 تمبلت فاضي</button>
        <button class="btn ghost sm" onclick="A.downloadTemplate('${type}', true)">📋 بياناتي الحالية</button>
      </div>
      <p class="muted mt">لو هتعدّل على بيانات موجودة، نزّل "بياناتي الحالية" وعدّل فيها — <b>متمسحش عمود "معرف النظام"</b>.</p>
    </div>
    <div class="card">
      <b>2️⃣ املا الملف واحفظه</b>
      <p class="muted">افتحه بـ Excel، املا الصفوف، وبعدين احفظه بصيغة
      <b>CSV UTF-8</b> (من File ← Save As ← اختار "CSV UTF-8").</p>
    </div>
    <div class="card">
      <b>3️⃣ ارفعه</b>
      <input type="file" id="imp-file" accept=".csv,text/csv" style="display:none" onchange="A.importPreview('${type}', this)">
      <button class="btn full mt" onclick="document.getElementById('imp-file').click()">⬆️ اختار الملف</button>
    </div>
    <div id="imp-result"></div>
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
};

A.downloadTemplate = async (type, withData) => {
  toast('⏳ بجهز الملف...');
  try {
    const t = await api('exportTemplate', { type: type, withData: !!withData });
    const rows = [t.headers].concat(t.rows || []);
    const csv = '﻿' + rows.map(r => r.map(c =>
      '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = (withData ? 'بيانات_' : 'تمبلت_') + t.label + '.csv';
    a.click();
    toast('✅ اتنزّل — المناطق المتاحة: ' + (t.regions.join('، ') || 'مفيش مناطق'), 'ok');
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.importPreview = async (type, input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  const box = document.getElementById('imp-result');
  box.innerHTML = '<div class="card">⏳ بيقرا الملف...</div>';
  const text = await file.text();
  const grid = parseCsv(text);
  if (grid.length < 2) { box.innerHTML = '<div class="card" style="color:var(--red)">الملف فاضي أو مفيهوش بيانات تحت رؤوس الأعمدة</div>'; return; }
  const headers = grid[0].map(h => String(h).trim());
  const rows = grid.slice(1).map((r, i) => {
    const o = { __row: i + 2 };
    headers.forEach((h, j) => o[h] = r[j] === undefined ? '' : r[j]);
    return o;
  });
  A._impRows = rows; A._impType = type;

  box.innerHTML = '<div class="card">⏳ بيفحص ' + rows.length + ' صف...</div>';
  try {
    const totals = { added: 0, updated: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i += 200) {
      const r = await api('bulkImport', { type: type, rows: rows.slice(i, i + 200), dryRun: true });
      totals.added += r.result.added; totals.updated += r.result.updated; totals.skipped += r.result.skipped;
      totals.errors = totals.errors.concat(r.result.errors);
    }
    A._impCheck = totals;
    box.innerHTML = `
      <div class="card" style="border-right:4px solid ${totals.errors.length ? 'var(--amber)' : 'var(--green)'}">
        <b>نتيجة الفحص (لسه محفظتش حاجة):</b>
        <div class="stat-line"><span>هيتضافوا جدد</span><b class="pos">${totals.added}</b></div>
        <div class="stat-line"><span>هيتحدثوا</span><b>${totals.updated}</b></div>
        <div class="stat-line"><span>مفيش تغيير فيهم</span><b class="muted">${totals.skipped}</b></div>
        <div class="stat-line"><span>صفوف فيها مشاكل</span><b class="${totals.errors.length ? 'neg' : ''}">${totals.errors.length}</b></div>
      </div>
      ${totals.errors.length ? `<div class="card">
        <b>⚠️ الصفوف دي هتتساب من غير حفظ:</b>
        <div class="table-wrap mt"><table>
          <tr><th>الصف</th><th>الاسم</th><th>السبب</th></tr>
          ${totals.errors.slice(0, 40).map(e => `<tr><td>${e.row}</td><td>${esc(e.name)}</td><td>${esc(e.reason)}</td></tr>`).join('')}
        </table></div>
        ${totals.errors.length > 40 ? '<p class="muted">... و' + (totals.errors.length - 40) + ' صف كمان</p>' : ''}
      </div>` : ''}
      ${(totals.added + totals.updated) ? `<button class="btn green full" onclick="A.importApply()">✔ تمام — نفّذ التحديث</button>`
        : '<div class="card muted">مفيش أي صف صالح للحفظ.</div>'}`;
  } catch (e) {
    box.innerHTML = '<div class="card" style="color:var(--red)">' + esc(e.msg || 'خطأ في الفحص') + '</div>';
  }
};

A.importApply = async () => {
  const rows = A._impRows || [], type = A._impType;
  const box = document.getElementById('imp-result');
  box.innerHTML = '<div class="card">⏳ بيحفظ...</div>';
  try {
    const totals = { added: 0, updated: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rows.length; i += 200) {
      box.innerHTML = '<div class="card">⏳ بيحفظ ' + Math.min(i + 200, rows.length) + ' من ' + rows.length + '...</div>';
      const r = await api('bulkImport', { type: type, rows: rows.slice(i, i + 200), dryRun: false });
      totals.added += r.result.added; totals.updated += r.result.updated;
      totals.errors = totals.errors.concat(r.result.errors);
    }
    if (type === 'customers') { try { await api('finishImport', {}); } catch (e) {} }
    box.innerHTML = `<div class="card" style="border-right:4px solid var(--green)">
      ✅ <b>تم بنجاح</b><div class="stat-line"><span>اتضافوا</span><b class="pos">${totals.added}</b></div>
      <div class="stat-line"><span>اتحدثوا</span><b>${totals.updated}</b></div>
      ${totals.errors.length ? '<div class="stat-line"><span>اتساب بمشاكل</span><b class="neg">' + totals.errors.length + '</b></div>' : ''}</div>`;
    toast('✅ اتحفظ: ' + totals.added + ' جديد و' + totals.updated + ' تحديث', 'ok');
    refresh(true);
  } catch (e) {
    box.innerHTML = '<div class="card" style="color:var(--red)">' + esc(e.msg || 'خطأ في الحفظ') + '</div>';
  }
};

// ----- إدارة العملاء -----
function adCustomers() {
  const regions = S.data.regions || [];
  let list = (S.data.customers || []).slice();
  if (S.custFilter) {
    const f = S.custFilter.toLowerCase();
    list = list.filter(c => String(c.name).toLowerCase().includes(f) || String(c.phone).includes(f));
  }
  if (S.custDay !== 'all') list = list.filter(c => String(c.region_id) === String(S.custDay)); // هنا الفلتر بالمنطقة
  return `
    <div class="flex">
      <button class="btn" onclick="A.custForm()">➕ عميل جديد</button>
      <button class="btn ghost" onclick="A.importQoyod()">⬇️ استيراد عملاء قيود</button>
      <button class="btn amber" onclick="A.plannerForm()">🗺️ تقسيم خط السير</button>
      <button class="btn outline" onclick="A.bulkTermsForm()">⏱️ مدة الاستحقاق لمجموعة</button>
      <button class="btn green" onclick="A.importForm('customers')">📥 استيراد/تحديث من ملف</button>
    </div>
    <div class="flex mt">
      <input placeholder="🔍 دور باسم العميل" value="${esc(S.custFilter)}" oninput="A.custSearch(this.value)">
      <select onchange="A.custDayF(this.value)" style="max-width:200px">
        <option value="all">كل المناطق</option>
        ${regions.map(r => `<option value="${r.id}" ${String(S.custDay) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap mt"><table>
      <tr><th>العميل</th><th>المنطقة</th><th>اليوم</th><th>لوكيشن</th><th>الاستحقاق</th><th>الرصيد</th><th>المتأخر</th><th>الأولوية</th><th></th></tr>
      ${list.slice(0, 200).map(c => `<tr>
        <td><b>${esc(c.name)}</b><div class="muted" style="font-size:11.5px">${esc(c.phone || '')}</div></td>
        <td>${esc(regionName(c.region_id))}</td>
        <td>${dayLabel(c.visit_day)}</td>
        <td>${c.lat ? '✅' : '<span class="badge warm">ناقص</span>'}</td>
        <td>${Number(c.payment_terms) > 0 ? '<b>' + esc(c.payment_terms) + '</b> يوم' : '<span class="muted">' + defaultTerms() + ' يوم</span>'}</td>
        <td>${money(c.balance)}</td>
        <td style="color:${Number(c.overdue) > 0 ? 'var(--red)' : 'inherit'}">${money(c.overdue)}</td>
        <td>${c.priority_score || 0}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" onclick="A.custForm('${c.id}')">تعديل</button>
          <button class="btn sm outline" onclick="A.statement('${c.id}')">📄</button>
          <button class="btn sm outline" onclick="A.overdueDetails('${c.id}')" title="تفاصيل حساب المتأخرات">🔬</button></td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">مفيش عملاء — ضيفهم يدوي أو استوردهم من قيود</td></tr>'}
    </table></div>
    ${list.length > 200 ? '<p class="muted mt">معروض أول 200 — استخدم البحث</p>' : ''}`;
}

A.custForm = (id) => {
  const c = id ? custById(id) : {};
  const regions = S.data.regions || [];
  openModal(`
    <h2>${id ? 'تعديل عميل' : 'عميل جديد'}</h2>
    <label>الاسم *</label><input id="c-name" value="${esc(c.name || '')}">
    <label>التليفون</label><input id="c-phone" value="${esc(c.phone || '')}">
    <label>العنوان</label><input id="c-address" value="${esc(c.address || '')}">
    <div class="grid2">
      <div><label>المنطقة</label>
        <select id="c-region"><option value="">—</option>
        ${regions.map(r => `<option value="${r.id}" ${String(c.region_id) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <div><label>يوم الزيارة</label>
        <select id="c-day"><option value="">تلقائي</option>
        ${[1, 2, 3, 4, 5, 6].map(d => `<option value="${d}" ${String(c.visit_day) === String(d) ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></div>
    </div>
    <div class="grid2">
      <div><label>الحالة</label>
        <select id="c-status"><option ${c.status === 'نشط' ? 'selected' : ''}>نشط</option><option ${c.status === 'موقوف' ? 'selected' : ''}>موقوف</option></select></div>
      <div><label>مدة الاستحقاق (يوم)</label>
        <input id="c-terms" type="number" min="0" value="${esc(c.payment_terms || '')}"
          placeholder="الافتراضي ${esc(defaultTerms())} يوم"></div>
    </div>
    <label>حد الائتمان (${esc(cur())}) — 0 أو فاضي = مفيش حد</label>
    <input id="c-credit" type="number" min="0" value="${esc(c.credit_limit || '')}">
    <label>كود قيود (اختياري)</label><input id="c-qoyod" value="${esc(c.qoyod_id || '')}">
    <p class="muted">الفاتورة بتعتبر متأخرة بعد ${esc(c.payment_terms || defaultTerms())} يوم من تاريخ إصدارها. سيبها فاضية عشان تمشي على الافتراضي.</p>
    <button class="btn ghost sm mt" onclick="A.adCustLoc('${id || ''}')">📍 ${c.lat ? 'تعديل اللوكيشن (متحدد ✅)' : 'تحديد اللوكيشن على الخريطة'}</button>
    <span id="c-loc-txt" class="muted"></span>
    <div class="modal-actions">
      <button class="btn green" onclick="A.custSave('${id || ''}')">حفظ ✔</button>
      ${id ? `<button class="btn red" onclick="A.delEntity('customer','${id}')">حذف</button>` : ''}
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
  A._custLoc = c.lat ? { lat: c.lat, lng: c.lng } : null;
};
A.adCustLoc = (id) => {
  const vals = { name: $('#c-name').value, phone: $('#c-phone').value, address: $('#c-address').value, region: $('#c-region').value, day: $('#c-day').value, status: $('#c-status').value, qoyod: $('#c-qoyod').value, terms: $('#c-terms').value };
  const cur = A._custLoc || {};
  openMapPicker(cur.lat, cur.lng, ll => {
    A.custForm(id || undefined);
    $('#c-name').value = vals.name; $('#c-phone').value = vals.phone; $('#c-address').value = vals.address;
    $('#c-region').value = vals.region; $('#c-day').value = vals.day; $('#c-status').value = vals.status;
    $('#c-qoyod').value = vals.qoyod; $('#c-terms').value = vals.terms;
    A._custLoc = ll;
    $('#c-loc-txt').textContent = ' ✅ اللوكيشن اتحدد';
  });
};
A.custSave = async (id) => {
  const data = {
    id: id || undefined, name: $('#c-name').value.trim(), phone: $('#c-phone').value.trim(),
    address: $('#c-address').value.trim(), region_id: $('#c-region').value, visit_day: $('#c-day').value,
    status: $('#c-status').value, qoyod_id: $('#c-qoyod').value.trim(),
    payment_terms: $('#c-terms').value, credit_limit: $('#c-credit').value
  };
  if (A._custLoc) { data.lat = A._custLoc.lat; data.lng = A._custLoc.lng; }
  if (!data.name) return toast('اكتب اسم العميل', 'err');
  closeModal();
  try { await api('saveCustomer', { data }); toast('✅ اتحفظ', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.bulkTermsForm = () => {
  const regions = S.data.regions || [];
  openModal(`
    <h2>⏱️ مدة الاستحقاق لمجموعة عملاء</h2>
    <p class="modal-sub">بدل ما تعدل كل عميل لوحده — حدد المدة لمجموعة مرة واحدة.</p>
    <label>المدة (يوم) *</label>
    <input id="bt-days" type="number" min="1" value="${defaultTerms()}">
    <label>تطبّق على</label>
    <select id="bt-region">
      <option value="">كل العملاء</option>
      ${regions.map(r => `<option value="${r.id}">عملاء منطقة ${esc(r.name)}</option>`).join('')}
    </select>
    <label><input type="checkbox" id="bt-empty" checked style="width:auto"> العملاء اللي مالهمش مدة محددة بس (متغيرش اللي عدّلتهم يدوي)</label>
    <div class="modal-actions">
      <button class="btn green" onclick="A.bulkTermsSave()">تطبيق ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.bulkTermsSave = async () => {
  const payload = { days: $('#bt-days').value, region_id: $('#bt-region').value, onlyEmpty: $('#bt-empty').checked };
  if (!(Number(payload.days) > 0)) return toast('اكتب عدد أيام صحيح', 'err');
  closeModal();
  toast('⏳ بطبق المدة وبعيد حساب المتأخرات...');
  try { const r = await api('bulkTerms', payload); toast(r.message, 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.importQoyod = async () => {
  if (!confirm('هستورد كل عملاء قيود اللي مش موجودين هنا — نكمّل؟')) return;
  toast('⏳ بستورد من قيود...');
  try { const r = await api('importQoyodCustomers', {}); toast(r.message, 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ في الاستيراد', 'err'); }
};

A.plannerForm = () => {
  const regions = S.data.regions || [];
  if (!regions.length) return toast('ضيف مناطق الأول', 'err');
  openModal(`
    <h2>🗺️ تقسيم خط السير</h2>
    <p class="modal-sub">هيقسم عملاء المنطقة على 6 أيام (السبت للخميس) حسب قربهم الجغرافي من بعض — كل يوم حتة متلاصقة.</p>
    <label>المنطقة</label>
    <select id="p-region">${regions.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>
    <div class="modal-actions">
      <button class="btn amber" onclick="A.runPlanner()">تقسيم ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.runPlanner = async () => {
  const region_id = $('#p-region').value;
  closeModal();
  toast('⏳ بقسم خط السير...');
  try { const r = await api('runPlanner', { region_id }); toast(r.message, 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- المناديب والمناطق -----
function adTeam() {
  const users = S.data.users || [];
  const regions = S.data.regions || [];
  return `
    <div class="section-title"><span>المناديب والمستخدمين</span>
      <button class="btn sm" onclick="A.userForm()">➕ مستخدم جديد</button></div>
    <div class="table-wrap"><table>
      <tr><th>الاسم</th><th>اسم الدخول</th><th>الدور</th><th>المنطقة</th><th>الحالة</th><th>تليجرام</th><th></th></tr>
      ${users.map(u => `<tr>
        <td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td>
        <td>${u.role === 'admin' ? '<span class="badge info">أدمن</span>' : 'مندوب'}</td>
        <td>${esc(regionName(u.region_id))}</td>
        <td>${String(u.active) === 'FALSE' ? '<span class="badge gray">موقوف</span>' : '<span class="badge cool">نشط</span>'}
          ${String(u.can_spend).toUpperCase() === 'TRUE' ? '<span class="badge warm">يصرف من العهدة</span>' : ''}</td>
        <td>${esc(u.telegram_chat_id || '—')}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" onclick="A.userForm('${u.id}')">تعديل</button>
          <button class="btn sm outline" onclick="A.revokeSessions('${u.id}','${esc(u.name)}')" title="إنهاء جلساته على كل الأجهزة">🔒</button></td>
      </tr>`).join('')}
    </table></div>
    <div class="section-title"><span>🔐 الأجهزة المسجّل دخولها (${(S.data.sessions || []).length})</span></div>
    <div class="table-wrap"><table>
      <tr><th>المستخدم</th><th>الجهاز</th><th>آخر نشاط</th><th>تنتهي في</th></tr>
      ${(S.data.sessions || []).slice().reverse().slice(0, 30).map(s => `<tr>
        <td><b>${esc(s.user_name || '')}</b></td><td>${esc(s.device || '—')}</td>
        <td>${esc(String(s.last_seen || '').slice(0, 16))}</td><td>${esc(s.expires || '')}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="muted">مفيش أجهزة مسجلة</td></tr>'}
    </table></div>
    <p class="muted">لو موبايل مندوب ضاع أو حد ساب الشغل، اضغط 🔒 جنب اسمه فوق عشان تقفل جلساته فورًا.</p>

    <div class="section-title"><span>المناطق</span>
      <button class="btn sm" onclick="A.regionForm()">➕ منطقة جديدة</button></div>
    <div class="table-wrap"><table>
      <tr><th>المنطقة</th><th>عدد العملاء</th><th>المندوب المسؤول</th><th>ملاحظات</th><th></th></tr>
      ${regions.map(r => `<tr>
        <td><b>${esc(r.name)}</b></td>
        <td>${(S.data.customers || []).filter(c => String(c.region_id) === String(r.id)).length}</td>
        <td>${esc((users.find(u => String(u.region_id) === String(r.id) && u.role === 'rep') || {}).name || '—')}</td>
        <td>${esc(r.notes || '')}</td>
        <td><button class="btn sm ghost" onclick="A.regionForm('${r.id}')">تعديل</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">ضيف أول منطقة</td></tr>'}
    </table></div>`;
}

A.userForm = (id) => {
  const u = id ? (S.data.users || []).find(x => String(x.id) === String(id)) : {};
  const regions = S.data.regions || [];
  openModal(`
    <h2>${id ? 'تعديل مستخدم' : 'مستخدم جديد'}</h2>
    <label>الاسم *</label><input id="u-name" value="${esc(u.name || '')}">
    <label>اسم الدخول (انجليزي بدون مسافات) *</label><input id="u-username" value="${esc(u.username || '')}" style="direction:ltr">
    <label>الرقم السري ${id ? '(سيبه فاضي لو مش هتغيره)' : '*'}</label><input id="u-pin" inputmode="numeric" style="direction:ltr">
    <div class="grid2">
      <div><label>الدور</label>
        <select id="u-role"><option value="rep" ${u.role === 'rep' ? 'selected' : ''}>مندوب</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>أدمن</option></select></div>
      <div><label>المنطقة</label>
        <select id="u-region"><option value="">—</option>
        ${regions.map(r => `<option value="${r.id}" ${String(u.region_id) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
    </div>
    <label><input type="checkbox" id="u-active" ${String(u.active) !== 'FALSE' ? 'checked' : ''} style="width:auto"> الحساب نشط</label>
    <label><input type="checkbox" id="u-spend" ${String(u.can_spend).toUpperCase() === 'TRUE' ? 'checked' : ''} style="width:auto"> يقدر يصرف من فلوس العهدة</label>
    <p class="muted">لو مفعّلة، المندوب يقدر يسجل مصروفات (بنزين، صيانة...) بتنزل من عهدته فورًا.</p>
    <div class="modal-actions">
      <button class="btn green" onclick="A.userSave('${id || ''}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.userSave = async (id) => {
  const data = {
    id: id || undefined, name: $('#u-name').value.trim(), username: normDigits($('#u-username').value).toLowerCase(),
    pin: normDigits($('#u-pin').value), role: $('#u-role').value, region_id: $('#u-region').value,
    active: $('#u-active').checked, can_spend: $('#u-spend').checked
  };
  if (!data.name || !data.username) return toast('كمّل البيانات', 'err');
  closeModal();
  try {
    await api('saveUser', { data });
    // غيّرت بياناتك انت؟ السيرفر بيقفل كل الجلسات — فبنسجل دخول من جديد فورًا عشان متتقطعش
    if (id && String(id) === String(S.user.id) && data.pin) {
      const res = await api('login', { username: data.username, pin: data.pin, device: deviceLabel() }, { noRetry: true });
      S.token = res.token; S.user = res.user; S.device = res.device || '';
      localStorage.setItem('crm_token', S.token);
      localStorage.setItem('crm_device', S.device);
      save('crm_user', S.user);
      toast('✅ اتغير رقمك السري — وكل الأجهزة التانية اتقفلت', 'ok');
    } else toast('✅ اتحفظ', 'ok');
    refresh(true);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.revokeSessions = async (userId, name) => {
  if (!confirm('هتقفل كل جلسات ' + name + ' على كل الأجهزة — هيحتاج يسجل دخول تاني. نكمل؟')) return;
  try {
    const r = await api('revokeSessions', { user_id: userId });
    toast(r.message, 'ok');
    if (String(userId) === String(S.user.id)) { doLogout(); return; }
    refresh(true);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.regionForm = (id) => {
  const r = id ? (S.data.regions || []).find(x => String(x.id) === String(id)) : {};
  openModal(`
    <h2>${id ? 'تعديل منطقة' : 'منطقة جديدة'}</h2>
    <label>اسم المنطقة *</label><input id="r-name" value="${esc(r.name || '')}">
    <label>ملاحظات</label><input id="r-notes" value="${esc(r.notes || '')}">
    <div class="modal-actions">
      <button class="btn green" onclick="A.regionSave('${id || ''}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.regionSave = async (id) => {
  const data = { id: id || undefined, name: $('#r-name').value.trim(), notes: $('#r-notes').value.trim() };
  if (!data.name) return toast('اكتب اسم المنطقة', 'err');
  closeModal();
  try { await api('saveRegion', { data }); toast('✅ اتحفظت', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.delEntity = async (entity, id) => {
  if (!confirm('متأكد من الحذف؟ مفيش رجوع في الخطوة دي.')) return;
  closeModal();
  try { await api('deleteEntity', { entity, id }); toast('اتحذف', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- ليدز الأدمن -----
function adLeads() {
  const leads = (S.data.leads || []).slice().reverse();
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  return `
    <div class="flex">
      <button class="btn" onclick="A.leadForm()">➕ إضافة ليد</button>
      <button class="btn green" onclick="A.importForm('leads')">📥 استيراد/تحديث من ملف</button>
    </div>
    <div class="table-wrap mt"><table>
      <tr><th>الاسم</th><th>التليفون</th><th>المنطقة</th><th>المندوب</th><th>المرحلة</th><th>المصدر</th><th></th></tr>
      ${leads.map(l => `<tr>
        <td><b>${esc(l.name)}</b></td><td>${esc(l.phone || '—')}</td>
        <td>${esc(regionName(l.region_id))}</td><td>${esc(repName(l.rep_id))}</td>
        <td><span class="badge ${l.stage === 'اتحول لعميل' ? 'cool' : 'info'}">${esc(l.stage)}</span></td>
        <td>${esc(l.source || '—')}</td>
        <td><button class="btn sm ghost" onclick="A.assignLeadForm('${l.id}')">تخصيص</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">مفيش ليدز</td></tr>'}
    </table></div>`;
}
A.assignLeadForm = (id) => {
  const l = (S.data.leads || []).find(x => String(x.id) === String(id));
  const regions = S.data.regions || [];
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  openModal(`
    <h2>تخصيص الليد: ${esc(l.name)}</h2>
    <label>المنطقة</label>
    <select id="al-region">${regions.map(r => `<option value="${r.id}" ${String(l.region_id) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    <label>المندوب (هيوصله تنبيه)</label>
    <select id="al-rep"><option value="">—</option>
      ${reps.map(u => `<option value="${u.id}" ${String(l.rep_id) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
    <div class="modal-actions">
      <button class="btn green" onclick="A.assignLeadSave('${l.id}')">تخصيص ✔</button>
      <button class="btn red" onclick="A.delEntity('lead','${l.id}')">حذف</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.assignLeadSave = async (id) => {
  const payload = { id, region_id: $('#al-region').value, rep_id: $('#al-rep').value };
  closeModal();
  try { await api('assignLead', payload); toast('✅ اتخصص والمندوب هيوصله تنبيه', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- القيود اليومية -----
function adEntries() {
  const entries = (S.data.entries || []).slice().reverse();
  const customers = (S.data.customers || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  return `
    <div class="card">
      <h3>➕ قيد يومية جديد</h3>
      <p class="muted">للحركات اللي مش مسجلة في قيود كفواتير أو سندات (رصيد افتتاحي، تسوية، خصم اتفاق...) — بتدخل في رصيد العميل وكشف حسابه فورًا.</p>
      <label>العميل *</label>
      <select id="e-cust">${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <div class="grid2">
        <div><label>نوع القيد</label><select id="e-type">
          <option value="مدين">مدين — على العميل (بيزوّد اللي عليه)</option>
          <option value="دائن">دائن — للعميل (بيقلل اللي عليه)</option></select></div>
        <div><label>المبلغ (${esc(cur())}) *</label><input id="e-amount" type="number" inputmode="decimal" min="0"></div>
      </div>
      <div class="grid2">
        <div><label>التاريخ</label><input id="e-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label>البيان *</label><input id="e-desc" placeholder="مثال: رصيد افتتاحي قبل قيود"></div>
      </div>
      <button class="btn green mt" onclick="A.entrySave()">حفظ القيد ✔</button>
    </div>
    <div class="section-title"><span>القيود المسجلة (${entries.length})</span></div>
    <div class="table-wrap"><table>
      <tr><th>التاريخ</th><th>العميل</th><th>البيان</th><th>مدين</th><th>دائن</th><th></th></tr>
      ${entries.map(e => `<tr>
        <td>${esc(String(e.date).slice(0, 10))}</td><td><b>${esc(e.customer_name)}</b></td><td>${esc(e.description || '')}</td>
        <td style="color:var(--red)">${e.type === 'مدين' ? moneyC(e.amount) : '—'}</td>
        <td style="color:var(--green)">${e.type === 'دائن' ? moneyC(e.amount) : '—'}</td>
        <td><button class="btn sm red" onclick="A.delEntity('entry','${e.id}')">حذف</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">مفيش قيود مسجلة لسه</td></tr>'}
    </table></div>`;
}
A.entrySave = async () => {
  const data = {
    customer_id: $('#e-cust').value, type: $('#e-type').value,
    amount: $('#e-amount').value, date: $('#e-date').value, description: $('#e-desc').value.trim()
  };
  if (!data.customer_id) return toast('اختار العميل', 'err');
  if (!(Number(data.amount) > 0)) return toast('اكتب المبلغ', 'err');
  if (!data.description) return toast('اكتب البيان', 'err');
  try {
    await api('saveEntry', { data });
    toast('✅ القيد اتسجل ورصيد العميل اتحدث', 'ok');
    refresh(true);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- كشف حساب العميل (PDF) -----
/** الخطوة الأولى: تحديد فترة الكشف */
A.statement = (custId) => {
  const c = custById(custId) || { name: '' };
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  openModal(`
    <h2>📄 كشف حساب: ${esc(c.name)}</h2>
    <p class="modal-sub">حدد الفترة اللي عاوز الكشف عنها — الحركات اللي قبلها هتظهر كرصيد افتتاحي.</p>
    <div class="pill-row">
      <button class="pill" onclick="A.stmtPeriod('all')">كل الفترة</button>
      <button class="pill" onclick="A.stmtPeriod('month')">الشهر الحالي</button>
      <button class="pill" onclick="A.stmtPeriod('q')">آخر 3 شهور</button>
      <button class="pill" onclick="A.stmtPeriod('year')">من أول السنة</button>
    </div>
    <div class="grid2">
      <div><label>من تاريخ</label><input id="st-from" type="date" value=""></div>
      <div><label>إلى تاريخ</label><input id="st-to" type="date" value="${today}"></div>
    </div>
    <p class="muted mt">سيب "من تاريخ" فاضي عشان الكشف يبدأ من أول حركة للعميل.</p>
    <div class="modal-actions">
      <button class="btn" onclick="A.statementRun('${custId}')">اعرض الكشف ←</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
  A._stmtMonthStart = monthStart;
};
A.stmtPeriod = (kind) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let from = '';
  if (kind === 'month') from = today.slice(0, 8) + '01';
  else if (kind === 'q') { const d = new Date(now.getFullYear(), now.getMonth() - 2, 1); from = d.toISOString().slice(0, 10); }
  else if (kind === 'year') from = today.slice(0, 4) + '-01-01';
  $('#st-from').value = from;
  $('#st-to').value = today;
};

/** الخطوة الثانية: جلب الحركات وعرض الكشف جاهز للطباعة */
A.statementRun = async (custId) => {
  const fromEl = $('#st-from'), toEl = $('#st-to');
  const from = fromEl ? fromEl.value : '', to = toEl ? toEl.value : '';
  closeModal();
  toast('⏳ بجهز كشف الحساب...');
  try {
    const r = await api('getStatement', { customer_id: custId, from: from, to: to });
    const c$ = r.currency || cur();
    let running = Number(r.opening) || 0;
    const rows = r.tx.map(t => {
      running += t.debit - t.credit;
      return { date: t.date, desc: t.desc, debit: t.debit, credit: t.credit, balance: running };
    });
    const totalDebit = r.tx.reduce((s, t) => s + t.debit, 0);
    const totalCredit = r.tx.reduce((s, t) => s + t.credit, 0);
    const closing = (Number(r.opening) || 0) + totalDebit - totalCredit;
    const periodTxt = (r.from || r.to)
      ? 'من ' + (r.from || 'أول حركة') + ' إلى ' + (r.to || 'اليوم')
      : 'كل الفترة';

    const stmtHtml = `
      <div class="stmt">
        <div class="stmt-head">
          ${r.logo ? '<img class="stmt-logo" src="' + r.logo + '" alt="">' : ''}
          <div class="stmt-company">${esc(r.company)}</div>
          <div class="stmt-title">كشف حساب عميل</div>
          <div class="stmt-period">${esc(periodTxt)}</div>
          <div class="stmt-info">
            <span><b>العميل:</b> ${esc(r.customer.name)}</span>
            ${r.customer.phone ? '<span><b>الجوال:</b> ' + esc(r.customer.phone) + '</span>' : ''}
            ${r.customer.address ? '<span><b>العنوان:</b> ' + esc(r.customer.address) + '</span>' : ''}
            <span><b>تاريخ الإصدار:</b> ${new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
        <table class="stmt-table">
          <tr><th>التاريخ</th><th>البيان</th><th>مدين (${esc(c$)})</th><th>دائن (${esc(c$)})</th><th>الرصيد (${esc(c$)})</th></tr>
          ${r.opening ? `<tr class="stmt-open"><td>${esc(r.from || '')}</td><td>رصيد ما قبل الفترة</td><td>—</td><td>—</td><td>${money(r.opening)}</td></tr>` : ''}
          ${rows.map(t => `<tr>
            <td>${esc(t.date)}</td><td>${esc(t.desc)}</td>
            <td>${t.debit ? money(t.debit) : '—'}</td>
            <td>${t.credit ? money(t.credit) : '—'}</td>
            <td>${money(t.balance)}</td>
          </tr>`).join('') || '<tr><td colspan="5">مفيش حركات في الفترة دي</td></tr>'}
          <tr class="stmt-total">
            <td colspan="2">إجمالي حركات الفترة</td>
            <td>${money(totalDebit)}</td>
            <td>${money(totalCredit)}</td>
            <td>${money(closing)}</td>
          </tr>
        </table>
        <div class="stmt-final">الرصيد المستحق: <b>${money(closing)} ${esc(c$)}</b>
          ${closing > 0 ? '(مطلوب من العميل)' : closing < 0 ? '(للعميل)' : '(الحساب مسدد)'}</div>
        <div class="stmt-sign"><span>توقيع المندوب</span><span>توقيع العميل</span></div>
        <div class="stmt-footer">صادر من نظام ${esc(r.company)} — ${new Date().toISOString().slice(0, 10)}</div>
      </div>`;

    openModal(`
      <h2>📄 كشف حساب: ${esc(r.customer.name)}</h2>
      <p class="modal-sub">${esc(periodTxt)}</p>
      <div class="stmt-preview">${stmtHtml}</div>
      <div class="modal-actions">
        <button class="btn" onclick="A.printStatement()">🖨️ حفظ PDF / طباعة</button>
        <button class="btn ghost" onclick="A.statement('${custId}')">↺ غيّر الفترة</button>
        <button class="btn outline" onclick="A.closeModal()">إغلاق</button>
      </div>`);
    document.getElementById('print-area').innerHTML = stmtHtml;
  } catch (e) { toast(e.msg || (e.offline ? 'كشف الحساب محتاج نت' : 'خطأ'), 'err'); }
};
A.printStatement = () => { window.print(); };

// ----- سند القبض: عرض الصورة الأصلية + طباعة PDF -----
A.viewReceipt = async (id) => {
  const c = ((S.sales && S.sales.collections) || []).find(x => String(x.id) === String(id));
  if (!c) return toast('السند مش موجود', 'err');
  if (!c.receipt) return toast('السند ده مفيهوش صورة — اتسجل قبل التحديث', 'err');
  toast('⏳ بجيب السند...');
  try {
    const r = await api('getAttachment', { url: c.receipt });
    A._receipt = { c: c, img: r.data };
    openModal(`
      <h2>📄 سند قبض رقم ${esc(c.voucher || '—')}</h2>
      <p class="modal-sub">${esc(c.customer_name)} — ${esc(String(c.date).slice(0, 10))}</p>
      <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:6px;text-align:center">
        <img src="${r.data}" alt="سند قبض" style="max-width:100%;border-radius:6px">
      </div>
      <p class="muted mt">دي الصورة اللي اتوقّعت وقتها بالظبط — مبتتغيرش.</p>
      <div class="modal-actions">
        <button class="btn" onclick="A.printReceipt()">🖨️ حفظ PDF / طباعة</button>
        <button class="btn outline" onclick="A.closeModal()">إغلاق</button>
      </div>`);
  } catch (e) { toast(e.msg || 'مقدرتش أفتح السند', 'err'); }
};
/** نموذج سند بأرقام وهمية — عشان الأدمن يشوف الشكل قبل التسليم */
A.previewReceipt = async () => {
  const sig = document.createElement('canvas');
  sig.width = 600; sig.height = 220;
  const c = sig.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 600, 220);
  c.strokeStyle = '#111'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(90, 150);
  c.bezierCurveTo(190, 40, 270, 200, 360, 90);
  c.bezierCurveTo(420, 35, 480, 170, 530, 115);
  c.stroke();
  const img = await composeReceipt({
    voucher: '1001', date: todayISO(), time: '09:15',
    customer: 'مؤسسة بقالة النور التجارية', amount: 3327.75, method: 'كاش',
    reference: '', notes: 'دفعة تحت حساب فاتورة رقم 4471',
    rep: 'اسم المندوب', sigCanvas: sig, company: companyName(), currency: cur()
  });
  openModal(`
    <h2>👁 شكل سند القبض</h2>
    <p class="modal-sub">نموذج بأرقام وهمية — الشكل ده اللي بيتحفظ مع كل تحصيل</p>
    <div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:6px;text-align:center">
      <img src="${img}" alt="نموذج سند" style="max-width:100%;border-radius:6px">
    </div>
    <p class="muted mt">عايز تغيّر الاسم أو اللوجو؟ عدّلهم فوق واحفظ الإعدادات وشوفه تاني.</p>
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
};

A.printReceipt = () => {
  const r = A._receipt;
  if (!r) return;
  document.getElementById('print-area').innerHTML =
    '<div style="text-align:center"><img src="' + r.img + '" style="max-width:100%"></div>';
  window.print();
};

// ----- الأهداف -----
function adTargets() {
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  const month = new Date().toISOString().slice(0, 7);
  const targets = S.data.targets || [];
  return `
    <p class="muted">حدد تارجت الزيارات والتحصيل لكل مندوب — بيظهر للمندوب في حسابه وبيتحسب في اللوحة.</p>
    <div class="table-wrap mt"><table>
      <tr><th>المندوب</th><th>شهر</th><th>تارجت زيارات</th><th>تارجت تحصيل (${esc(cur())})</th><th></th></tr>
      ${reps.map(r => {
        const t = targets.find(x => String(x.rep_id) === String(r.id) && String(x.month) === month) || {};
        return `<tr>
          <td><b>${esc(r.name)}</b></td><td>${month}</td>
          <td><input style="max-width:110px" id="tv-${r.id}" type="number" value="${t.visits_target || ''}"></td>
          <td><input style="max-width:140px" id="tc-${r.id}" type="number" value="${t.collection_target || ''}"></td>
          <td><button class="btn sm green" onclick="A.saveTarget('${r.id}','${month}')">حفظ</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="muted">ضيف مناديب الأول</td></tr>'}
    </table></div>`;
}
A.saveTarget = async (repId, month) => {
  const data = { rep_id: repId, month, visits_target: $('#tv-' + repId).value, collection_target: $('#tc-' + repId).value };
  try { await api('saveTarget', { data }); toast('✅ اتحفظ', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- التقارير -----
function adReports() {
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  return `
    <div class="card">
      <h3>📄 تقرير الزيارات</h3>
      <div class="grid2">
        <div><label>من</label><input type="date" id="rp-from"></div>
        <div><label>إلى</label><input type="date" id="rp-to"></div>
      </div>
      <label>المندوب</label>
      <select id="rp-rep"><option value="">الكل</option>${reps.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>
      <div class="flex mt">
        <button class="btn" onclick="A.exportVisits()">⬇️ تنزيل Excel (زيارات)</button>
      </div>
    </div>
    <div class="card">
      <h3>💰 تقارير المالية (من قيود)</h3>
      <div class="flex">
        <button class="btn ghost" onclick="A.exportCsv('receipts')">⬇️ التحصيلات</button>
        <button class="btn ghost" onclick="A.exportCsv('invoices')">⬇️ الفواتير</button>
        <button class="btn ghost" onclick="A.exportCsv('returns')">⬇️ المرتجعات</button>
        <button class="btn ghost" onclick="A.exportCsv('customers')">⬇️ العملاء وأرصدتهم</button>
      </div>
      <p class="muted mt">الملفات بتنزل CSV وبتتفتح على Excel — وكل البيانات الكاملة موجودة برضه في شيت جوجل نفسه.</p>
    </div>`;
}
function downloadCsv(filename, rows) {
  if (!rows.length) return toast('مفيش بيانات للتصدير', 'err');
  const heads = Object.keys(rows[0]).filter(k => k !== '_row');
  // منع تنفيذ المعادلات لما الملف يتفتح في Excel
  const safe = v => {
    const s = String(v == null ? '' : v).replace(/"/g, '""').replace(/\n/g, ' ');
    return /^[=+@\t\r]/.test(s) ? "'" + s : s;
  };
  const csv = '﻿' + heads.join(',') + '\n' + rows.map(r =>
    heads.map(h => '"' + safe(r[h]) + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename + '.csv';
  a.click();
}
A.exportVisits = () => {
  const from = $('#rp-from').value, to = $('#rp-to').value, rep = $('#rp-rep').value;
  let list = (S.data.visits || []).slice();
  if (from) list = list.filter(v => String(v.date).slice(0, 10) >= from);
  if (to) list = list.filter(v => String(v.date).slice(0, 10) <= to);
  if (rep) list = list.filter(v => String(v.rep_id) === String(rep));
  downloadCsv('تقرير_الزيارات', list);
};
A.exportCsv = (key) => downloadCsv('تقرير_' + key, (S.data[key] || []).slice());

// ----- الإعدادات -----
function adSettings() {
  const s = S.data.allSettings || {};
  return `
    <div class="card">
      <h3>🔑 الربط مع قيود</h3>
      <label>API Key</label><input id="s-qoyod" value="${esc(s.QOYOD_API_KEY || '')}" style="direction:ltr">
      <div class="flex mt">
        <button class="btn green" onclick="A.saveSettings()">حفظ الإعدادات ✔</button>
        <button class="btn ghost" onclick="A.syncNow()">🔄 مزامنة دلوقتي</button>
      </div>
      <div class="stat-line mt"><span>حالة آخر مزامنة</span><b id="sync-status">${esc(s.SYNC_STATUS || 'لسه متعملتش')}</b></div>
      <button class="btn amber full mt" onclick="A.diagnose()">🔍 فحص البيانات — ليه الأرقام مش ظاهرة؟</button>
      <p class="muted mt">المزامنة بتشتغل لوحدها كل ساعة: فواتير + مرتجعات + تحصيلات، وبتحدث أرصدة العملاء وأولوياتهم.</p>
    </div>
    <div class="card">
      <h3>🛒 الطلبات والتحصيلات</h3>
      <div class="grid2">
        <label><input type="checkbox" id="s-order-on" ${String(s.ORDER_ENABLED || 'TRUE').toUpperCase() !== 'FALSE' ? 'checked' : ''} style="width:auto"> السماح للمناديب بأخذ طلبات</label>
        <label><input type="checkbox" id="s-collect-on" ${String(s.COLLECT_ENABLED || 'TRUE').toUpperCase() !== 'FALSE' ? 'checked' : ''} style="width:auto"> السماح بتسجيل تحصيلات</label>
      </div>
      <label><input type="checkbox" id="s-autopush" ${String(s.AUTO_PUSH || 'FALSE').toUpperCase() === 'TRUE' ? 'checked' : ''} style="width:auto"> إرسال تلقائي لقيود من غير مراجعتك</label>
      <div class="grid2">
        <div><label>مسار عروض الأسعار</label><input id="s-quote-path" value="${esc(s.QOYOD_QUOTE_PATH || '/estimates')}" style="direction:ltr"></div>
        <div><label>مسار سندات القبض</label><input id="s-receipt-path" value="${esc(s.QOYOD_RECEIPT_PATH || '/receipts')}" style="direction:ltr"></div>
      </div>
      <div><label>مسار الأصناف</label><input id="s-products-path" value="${esc(s.QOYOD_PRODUCTS_PATH || '/products')}" style="direction:ltr"></div>
      <div class="card" style="background:var(--blue-soft)">
        <b>الربط مع حسابات قيود</b>
        <p class="muted">قيود بيطلب المخزن في عرض السعر، وحساب لكل طريقة تحصيل في سند القبض.</p>
        <button class="btn sm" onclick="A.qoyodLists()">🔄 جيب المخازن والحسابات من قيود</button>
        <div class="mt"><label>المخزن (لعروض الأسعار)</label>
          <select id="s-inventory"><option value="${esc(s.QOYOD_INVENTORY_ID || '')}">${esc(s.QOYOD_INVENTORY_ID || '— اضغط الزرار فوق —')}</option></select></div>
        <label class="mt">طرق التحصيل (افصل بينهم بفاصلة)</label>
        <input id="s-pay-methods" value="${esc(s.PAY_METHODS || 'كاش,مدى,شيك,تحويل')}">
        <div class="section-title" style="margin-bottom:4px"><span>حساب كل طريقة</span></div>
        <div id="method-accounts">${methodAccountsHtml(s)}</div>
        <p class="muted mt">✅ علّم على الطرق اللي بتدخل <b>عهدة المندوب</b> (الكاش عادةً). ومدى الأفضل يروح لحساب وسيط
        "مدى تحت التحصيل" وتسوّي منه للبنك آخر الشهر — عشان مطابقة البنك تبقى سهلة.</p>
      </div>
      <div class="card" style="background:var(--amber-soft)">
        <b>🏦 البنوك والحوالات</b>
        <p class="muted">الطرق دي مبترفعش لقيود غير بعد ما تطابقها بكشف البنك.</p>
        <label>طرق تحتاج تأكيد البنك</label>
        <input id="s-bank-methods" value="${esc(s.BANK_METHODS || 'تحويل')}">
        <div class="grid2">
          <div><label>فرق الأيام المسموح</label><input id="s-bank-days" type="number" min="0" value="${esc(s.BANK_MATCH_DAYS || 3)}"></div>
          <div><label>فرق المبلغ المسموح</label><input id="s-bank-tol" type="number" min="0" value="${esc(s.BANK_MATCH_TOLERANCE || 0)}"></div>
        </div>
        <div class="section-title" style="margin-bottom:4px"><span>بنوكك</span>
          <button class="btn sm ghost" onclick="A.addBank()">➕ ضيف بنك</button></div>
        <div id="banks-box">${banksHtml(s)}</div>
        <button class="btn green mt" onclick="A.saveBanks()">حفظ البنوك ✔</button>
      </div>
      <div><label>صلاحية عرض السعر (يوم)</label><input id="s-quote-days" type="number" min="1" value="${esc(s.QUOTE_VALID_DAYS || 15)}"></div>
      <div><label>نسبة الضريبة %</label><input id="s-vat" type="number" value="${esc(s.VAT_PERCENT || 15)}"></div>
      <div class="grid2">
        <div><label>حد ائتمان افتراضي (0 = مفيش)</label><input id="s-credit-default" type="number" value="${esc(s.CREDIT_LIMIT_DEFAULT || 0)}"></div>
        <div><label>أقصى عدد صور للزيارة</label><input id="s-max-photos" type="number" value="${esc(s.MAX_VISIT_PHOTOS || 3)}"></div>
      </div>
      <label><input type="checkbox" id="s-credit-block" ${String(s.CREDIT_BLOCK || 'FALSE').toUpperCase() === 'TRUE' ? 'checked' : ''} style="width:auto"> امنع الطلب لو تعدى حد الائتمان (بدل التحذير بس)</label>
      <label><input type="checkbox" id="s-credit-overdue" ${String(s.CREDIT_BLOCK_OVERDUE || 'FALSE').toUpperCase() === 'TRUE' ? 'checked' : ''} style="width:auto"> امنع الطلب لو العميل عليه متأخرات</label>
      <div class="flex mt">
        <button class="btn ghost" onclick="A.qoyodProbe()">🔬 افحص مسارات قيود</button>
        <button class="btn ghost" onclick="A.syncProductsNow()">⬇️ اسحب الأصناف من قيود</button>
      </div>
      <p class="muted mt">الطلبات بتترسل كـ <b>عروض أسعار</b> مش فواتير. لو الإرسال فشل، افحص المسارات وظبطها من هنا.</p>
    </div>
    <div class="card">
      <h3>📲 بوت تليجرام</h3>
      <label>Bot Token (من BotFather)</label><input id="s-tg" value="${esc(s.TELEGRAM_BOT_TOKEN || '')}" style="direction:ltr">
      <div class="flex mt">
        <button class="btn ghost" onclick="A.testTg()">🔔 رسالة تجريبية للمتصلين</button>
      </div>
      <p class="muted mt">كل مندوب يبعت للبوت: <b style="direction:ltr">/start اسم_الدخول_بتاعه</b> — وهيوصله خطة يومه كل صبح 7:00.</p>
    </div>
    <div class="card">
      <h3>👤 حسابي</h3>
      <div class="stat-line"><span>الاسم</span><b>${esc(S.user.name)}</b></div>
      <div class="stat-line"><span>اسم الدخول</span><b style="direction:ltr">${esc(S.user.username || '')}</b></div>
      <div class="flex mt">
        <button class="btn ghost" onclick="A.userForm('${S.user.id}')">🔑 تغيير الرقم السري</button>
        <button class="btn red" onclick="A.logout()">🚪 تسجيل خروج</button>
      </div>
    </div>
    <div class="card">
      <h3>🏢 هوية الشركة</h3>
      <div class="grid2">
        <div><label>اسم الشركة</label><input id="s-company" value="${esc(s.COMPANY_NAME || '')}"></div>
        <div><label>العملة</label>
          <select id="s-currency">
            ${['ر.س', 'ريال', 'ج.م', 'د.إ', 'د.ك', 'ر.ع', 'د.ب', 'ر.ق', 'USD'].map(x =>
              `<option ${String(s.CURRENCY || 'ر.س') === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select></div>
      </div>
      <label>لوجو الشركة</label>
      <div class="logo-box">
        <div id="logo-preview">${logoSrc() ? '<img src="' + logoSrc() + '" alt="">' : '<span class="muted">مفيش لوجو مرفوع</span>'}</div>
        <div>
          <input type="file" id="s-logo-file" accept="image/*" onchange="A.logoPick(this)" style="display:none">
          <button class="btn sm ghost" onclick="document.getElementById('s-logo-file').click()">📤 اختار صورة اللوجو</button>
          ${logoSrc() ? '<button class="btn sm red" onclick="A.logoRemove()">حذف اللوجو</button>' : ''}
          <p class="muted" style="margin-top:6px">الصورة بتتصغّر تلقائيًا. هتظهر في شاشة الدخول وفوق في التطبيق وفي كشوف الحساب وعلى سندات القبض.</p>
        </div>
      </div>
      <div class="flex mt">
        <button class="btn ghost sm" onclick="A.previewReceipt()">👁 شوف شكل سند القبض</button>
      </div>
      <p class="muted">السند ده اللي العميل هيوقّع عليه وهيتحفظ بالصورة — شوفه قبل ما تسلّم النظام للمناديب.</p>
    </div>
    <div class="card">
      <h3>📍 تتبع خطوط السير</h3>
      <label><input type="checkbox" id="s-track" ${String(s.TRACK_ENABLED || 'TRUE').toUpperCase() !== 'FALSE' ? 'checked' : ''} style="width:auto"> تفعيل تتبع خط سير المناديب</label>
      <p class="muted">التتبع إلزامي للمناديب — مفيش عندهم أي زرار لإيقافه، وبيتقفل من هنا بس.</p>
      <div class="grid2">
        <div><label>أقل فاصل بين نقطتين (دقيقة)</label><input id="s-track-min" type="number" value="${esc(s.TRACK_MIN_MINUTES || 3)}"></div>
        <div><label>أقل مسافة تحرك (متر)</label><input id="s-track-m" type="number" value="${esc(s.TRACK_MIN_METERS || 120)}"></div>
      </div>
      <div><label>مدة الاحتفاظ بنقاط التتبع (يوم)</label><input id="s-track-keep" type="number" value="${esc(s.TRACK_KEEP_DAYS || 45)}"></div>
      <p class="muted mt">التتبع بيشتغل على موبايل المندوب والتطبيق مفتوح. النقاط الأقدم من المدة دي بتتمسح تلقائيًا عشان الشيت ميكبرش.</p>
    </div>
    <div class="card">
      <h3>⚙️ قواعد الشغل</h3>
      <div class="grid2">
        <div><label>نطاق تأكيد الوصول (متر)</label><input id="s-geo" type="number" value="${esc(s.GEOFENCE_METERS || 150)}"></div>
        <div><label>العميل يحتاج زيارة بعد (يوم)</label><input id="s-gap" type="number" value="${esc(s.VISIT_GAP_DAYS || 14)}"></div>
      </div>
      <div class="grid2">
        <div><label>أقل متأخر يطلع له تنبيه (${esc(cur())})</label><input id="s-overdue" type="number" value="${esc(s.OVERDUE_ALERT_MIN || 500)}"></div>
        <div><label>مدة الاستحقاق الافتراضية (يوم)</label><input id="s-terms" type="number" value="${esc(s.PAYMENT_TERMS_DAYS || 30)}"></div>
      </div>
      <p class="muted">الفاتورة بتعتبر متأخرة بعد المدة دي من تاريخ إصدارها. دي المدة الافتراضية — تقدر تحدد مدة مختلفة لكل عميل من صفحة العملاء.</p>
    </div>
    <div class="card">
      <h3>💾 النسخ الاحتياطي</h3>
      <div class="stat-line"><span>آخر نسخة</span><b>${esc(s.LAST_BACKUP || 'لسه متعملتش')}</b></div>
      <div><label>عدد النسخ المحتفظ بيها</label><input id="s-backup-keep" type="number" min="3" value="${esc(s.BACKUP_KEEP || 30)}"></div>
      <div class="flex mt">
        <button class="btn green" onclick="A.backupNow()">💾 خد نسخة دلوقتي</button>
        <button class="btn ghost" onclick="A.backupList()">📂 النسخ المحفوظة</button>
      </div>
      <p class="muted mt">بتتاخد نسخة كاملة كل يوم 2 فجرًا في فولدر على درايف بتاعك اسمه "CRM Rawafed — نسخ احتياطية".</p>
    </div>
    <div class="card">
      <h3>🩺 صحة النظام</h3>
      <div id="health-box" class="muted">اضغط للفحص — بيراجع المزامنة والنسخ الاحتياطي ونشاط المناديب والبيانات الناقصة.</div>
      <button class="btn amber mt" onclick="A.runHealth()">🩺 افحص النظام دلوقتي</button>
      <p class="muted mt">الفحص بيتعمل تلقائي كل يوم 9 مساءً، وأي مشكلة بتوصلك على تليجرام.</p>
    </div>
    <div class="card">
      <h3>🗄️ الأرشفة وأحجام البيانات</h3>
      <div class="stat-line"><span>آخر أرشفة</span><b>${esc(s.LAST_ARCHIVE || 'لسه متعملتش')}</b></div>
      <div><label>أرشفة البيانات الأقدم من (يوم)</label><input id="s-archive-days" type="number" min="60" value="${esc(s.ARCHIVE_AFTER_DAYS || 365)}"></div>
      <div class="flex mt">
        <button class="btn amber" onclick="A.archiveNow()">🗄️ أرشف دلوقتي</button>
        <button class="btn ghost" onclick="A.dataSizes()">📊 أحجام الجداول</button>
      </div>
      <p class="muted mt">البيانات القديمة بتتنقل لجداول أرشيف في نفس الملف (مش بتتمسح) عشان النظام يفضل سريع. بتشتغل تلقائي أول كل شهر.</p>
    </div>
    <div class="card" style="border-right:4px solid var(--red)">
      <h3>🧹 تنضيف بيانات التجربة</h3>
      <p class="muted">قبل التشغيل الميداني: بيمسح الزيارات والطلبات والتحصيلات والتتبع،
      وبيسيب المستخدمين والمناطق والعملاء والأصناف والإعدادات زي ما هي. بياخد نسخة احتياطية إجباري الأول.</p>
      <button class="btn red mt" onclick="A.resetForm()">🧹 تنضيف بيانات التجربة</button>
    </div>
    <div class="card">
      <h3>📋 سجل النظام</h3>
      ${(S.data.log || []).slice().reverse().slice(0, 10).map(l =>
        `<div class="stat-line"><span class="muted">${esc(l.time)}</span><span>${esc(l.message)}</span></div>`).join('') || '<p class="muted">فاضي</p>'}
    </div>`;
}
A.saveSettings = async () => {
  const data = {
    QOYOD_API_KEY: $('#s-qoyod').value.trim(), TELEGRAM_BOT_TOKEN: $('#s-tg').value.trim(),
    GEOFENCE_METERS: $('#s-geo').value, VISIT_GAP_DAYS: $('#s-gap').value,
    OVERDUE_ALERT_MIN: $('#s-overdue').value, COMPANY_NAME: $('#s-company').value.trim(),
    CURRENCY: $('#s-currency').value, PAYMENT_TERMS_DAYS: $('#s-terms').value,
    TRACK_ENABLED: $('#s-track').checked ? 'TRUE' : 'FALSE',
    TRACK_MIN_MINUTES: $('#s-track-min').value, TRACK_MIN_METERS: $('#s-track-m').value,
    TRACK_KEEP_DAYS: $('#s-track-keep').value, BACKUP_KEEP: $('#s-backup-keep').value,
    ARCHIVE_AFTER_DAYS: $('#s-archive-days').value,
    ORDER_ENABLED: $('#s-order-on').checked ? 'TRUE' : 'FALSE',
    COLLECT_ENABLED: $('#s-collect-on').checked ? 'TRUE' : 'FALSE',
    AUTO_PUSH: $('#s-autopush').checked ? 'TRUE' : 'FALSE',
    QOYOD_QUOTE_PATH: $('#s-quote-path').value.trim(),
    QOYOD_RECEIPT_PATH: $('#s-receipt-path').value.trim(),
    QOYOD_PRODUCTS_PATH: $('#s-products-path').value.trim(),
    QOYOD_INVENTORY_ID: $('#s-inventory').value.trim(),
    PAY_METHODS: $('#s-pay-methods').value.trim(),
    METHOD_ACCOUNTS: JSON.stringify((() => {
      const map = {};
      document.querySelectorAll('.method-acc').forEach(el => {
        if (el.value) map[el.dataset.method] = el.value;
      });
      return map;
    })()),
    CUSTODY_METHODS: Array.from(document.querySelectorAll('.method-custody'))
      .filter(el => el.checked).map(el => el.dataset.method).join(','),
    QUOTE_VALID_DAYS: $('#s-quote-days').value,
    VAT_PERCENT: $('#s-vat').value,
    BANK_METHODS: $('#s-bank-methods').value.trim(),
    BANK_MATCH_DAYS: $('#s-bank-days').value,
    BANK_MATCH_TOLERANCE: $('#s-bank-tol').value,
    CREDIT_LIMIT_DEFAULT: $('#s-credit-default').value,
    CREDIT_BLOCK: $('#s-credit-block').checked ? 'TRUE' : 'FALSE',
    CREDIT_BLOCK_OVERDUE: $('#s-credit-overdue').checked ? 'TRUE' : 'FALSE',
    MAX_VISIT_PHOTOS: $('#s-max-photos').value
  };
  if (A._newLogo !== undefined) data.COMPANY_LOGO = A._newLogo;
  try {
    await api('saveSettings', { data });
    // اللوجو الجديد يتخزن محليًا على طول من غير ما نجيبه تاني من السيرفر
    if (A._newLogo !== undefined) {
      if (A._newLogo) localStorage.setItem('crm_logo', A._newLogo);
      else localStorage.removeItem('crm_logo');
      localStorage.removeItem('crm_logo_hash');   // يتظبط لوحده مع أول تحديث
      A._newLogo = undefined;
    }
    toast('✅ الإعدادات اتحفظت', 'ok');
    refresh(true);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

/** بيصغّر صورة اللوجو في المتصفح قبل الحفظ عشان تفضل خفيفة */
A.logoPick = (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX = 220;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL('image/png');
      if (out.length > 44000) { // كبيرة؟ نحولها JPEG على خلفية بيضا
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const ctx = c2.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        out = c2.toDataURL('image/jpeg', 0.85);
      }
      if (out.length > 46000) return toast('الصورة كبيرة أوي — جرب صورة أبسط', 'err');
      A._newLogo = out;
      document.getElementById('logo-preview').innerHTML = '<img src="' + out + '" alt="">';
      toast('✅ اللوجو جاهز — اضغط "حفظ الإعدادات" عشان يتسجل', 'ok');
    };
    img.onerror = () => toast('مقدرتش أقرا الصورة دي', 'err');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};
A.logoRemove = () => {
  A._newLogo = '';
  document.getElementById('logo-preview').innerHTML = '<span class="muted">اتحذف — اضغط حفظ الإعدادات</span>';
};
A.syncNow = async () => {
  toast('⏳ ببدأ المزامنة...');
  try {
    const r = await api('runQoyodSync', {});
    toast(r.message, 'ok');
    pollSyncStatus(0);
  } catch (e) { toast(e.msg || 'خطأ في المزامنة', 'err'); }
};
async function pollSyncStatus(n) {
  if (n > 60) return; // نبطل متابعة بعد ~4 دقايق
  try {
    const r = await api('getSyncStatus', {});
    const status = r.status || '';
    const el = document.getElementById('sync-status');
    if (el) el.textContent = status;
    if (S.data && S.data.allSettings) S.data.allSettings.SYNC_STATUS = status;
    if (status.includes('✅')) { toast('✅ المزامنة خلصت بنجاح', 'ok'); refresh(true); return; }
    if (status.includes('❌') || status.includes('⚠️')) { toast(status, 'err'); refresh(true); return; }
  } catch (e) { /* نكمل محاولة */ }
  setTimeout(() => pollSyncStatus(n + 1), 4000);
}
// ----- فحص مسارات قيود وسحب الأصناف -----
A.qoyodProbe = async () => {
  toast('⏳ بفحص حسابك في قيود...');
  try {
    const r = await api('qoyodProbe', {});
    openModal(`
      <h2>🔬 فحص مسارات قيود</h2>
      <p class="modal-sub">دي المسارات اللي ردّت من حسابك، وأسامي الحقول الحقيقية اللي بيرجعها.</p>
      ${r.results.map(x => `
        <div class="card" style="border-right:4px solid ${x.ok ? 'var(--green)' : 'var(--red)'}">
          <b>${esc(x.label)}</b> — <span style="direction:ltr;display:inline-block">${esc(x.path)}</span>
          ${x.ok ? `<div class="stat-line"><span>عدد السجلات في العينة</span><b>${x.count}</b></div>
            <div class="muted mt"><b>الحقول:</b> ${esc(x.fields)}</div>
            ${x.sample ? '<div class="muted mt" style="direction:ltr;font-size:11px;word-break:break-all">' + esc(x.sample) + '</div>' : ''}`
          : `<div style="color:var(--red)">${esc(x.error)}</div>`}
        </div>`).join('')}
      <div class="card"><b>ازاي أستفيد؟</b>
        <p class="muted">لو مسار ظهر بعلامة حمرا، غيّره من خانة الإعدادات للمسار الصح. ولو الإرسال فشل بسبب اسم حقل،
        انسخ سطر "الحقول" وابعتهولي وأنا أظبط الإرسال عليه.</p></div>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  } catch (e) { toast(e.msg || 'خطأ في الفحص', 'err'); }
};

/** صفوف البنوك: اسم + حساب قيود */
function banksHtml(s) {
  let banks = [];
  try { banks = JSON.parse(s.BANKS || '[]'); } catch (e) { banks = []; }
  if (!banks.length) banks = [{ id: 'b1', name: '', account: '' }];
  A._banks = banks;
  A._accounts = A._accounts || [];
  return banks.map((b, i) => `
    <div class="method-row">
      <input class="bank-name" data-i="${i}" value="${esc(b.name)}" placeholder="اسم البنك" style="flex:1">
      <select class="bank-acc" data-i="${i}" style="flex:1">
        ${A._accounts.length
          ? '<option value="">— حساب قيود —</option>' + A._accounts.map(a =>
              `<option value="${esc(String(a.id))}" ${String(a.id) === String(b.account) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')
          : `<option value="${esc(String(b.account || ''))}">${esc(b.account ? 'كود ' + b.account : '— اضغط جيب الحسابات —')}</option>`}
      </select>
      <button class="btn sm red" onclick="A.delBank(${i})">✕</button>
    </div>`).join('');
}
A.addBank = () => {
  A._banks = collectBanks();
  A._banks.push({ id: 'b' + (A._banks.length + 1), name: '', account: '' });
  document.getElementById('banks-box').innerHTML =
    banksHtml({ BANKS: JSON.stringify(A._banks) });
};
A.delBank = (i) => {
  A._banks = collectBanks();
  A._banks.splice(i, 1);
  document.getElementById('banks-box').innerHTML =
    banksHtml({ BANKS: JSON.stringify(A._banks.length ? A._banks : [{ id: 'b1', name: '', account: '' }]) });
};
function collectBanks() {
  const names = Array.from(document.querySelectorAll('.bank-name'));
  const accs = Array.from(document.querySelectorAll('.bank-acc'));
  return names.map((el, i) => ({
    id: (A._banks[i] && A._banks[i].id) || ('b' + (i + 1)),
    name: el.value.trim(),
    account: accs[i] ? accs[i].value : ''
  }));
}
A.saveBanks = async () => {
  const banks = collectBanks().filter(b => b.name);
  if (!banks.length) return toast('ضيف بنك واحد على الأقل', 'err');
  const missing = banks.find(b => !b.account);
  if (missing) return toast('حدد حساب قيود لبنك "' + missing.name + '"', 'err');
  try {
    const r = await api('saveBanks', { banks: banks });
    toast(r.message, 'ok');
    S.bank = null;
    refresh(true);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

/** صف لكل طريقة دفع: الحساب في قيود + هل تدخل العهدة */
function methodAccountsHtml(s) {
  let map = {};
  try { map = JSON.parse(s.METHOD_ACCOUNTS || '{}'); } catch (e) { map = {}; }
  if (!map['كاش'] && s.QOYOD_CASH_ACCOUNT_ID) map['كاش'] = s.QOYOD_CASH_ACCOUNT_ID;
  const custody = String(s.CUSTODY_METHODS || 'كاش').split(',').map(x => x.trim());
  const methods = String(s.PAY_METHODS || 'كاش').split(',').map(x => x.trim()).filter(Boolean);
  A._accounts = A._accounts || [];
  return methods.map(m => `
    <div class="method-row">
      <span class="method-name">${esc(m)}</span>
      <select class="method-acc" data-method="${esc(m)}">
        ${A._accounts.length
          ? '<option value="">— اختار الحساب —</option>' + A._accounts.map(a =>
              `<option value="${esc(String(a.id))}" ${String(a.id) === String(map[m] || '') ? 'selected' : ''}>${esc(a.name)}</option>`).join('')
          : `<option value="${esc(String(map[m] || ''))}">${esc(map[m] ? 'كود ' + map[m] : '— اضغط جيب الحسابات —')}</option>`}
      </select>
      <label class="method-cust"><input type="checkbox" class="method-custody" data-method="${esc(m)}"
        ${custody.indexOf(m) > -1 ? 'checked' : ''}> عهدة</label>
    </div>`).join('');
}

A.qoyodLists = async () => {
  toast('⏳ بجيب المخازن والحسابات...');
  try {
    const r = await api('qoyodLists', {});
    const fill = (id, list, current) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">— اختار —</option>' + list.map(x =>
        `<option value="${esc(String(x.id))}" ${String(x.id) === String(current) ? 'selected' : ''}>${esc(x.name)} (${esc(String(x.id))})</option>`).join('');
    };
    const s = S.data.allSettings || {};
    fill('s-inventory', r.inventories, s.QOYOD_INVENTORY_ID);
    // حسابات طرق الدفع
    A._accounts = r.accounts || [];
    const box = document.getElementById('method-accounts');
    if (box) {
      const live = Object.assign({}, s, { PAY_METHODS: ($('#s-pay-methods') || {}).value || s.PAY_METHODS });
      box.innerHTML = methodAccountsHtml(live);
    }
    const msg = [];
    if (r.inventoriesError) msg.push('المخازن: ' + r.inventoriesError);
    if (r.accountsError) msg.push('الحسابات: ' + r.accountsError);
    toast(msg.length ? msg.join(' | ') : '✅ اختار المخزن وحساب الصندوق واضغط حفظ', msg.length ? 'err' : 'ok');
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.syncProductsNow = async () => {
  toast('⏳ بسحب الأصناف من قيود...');
  try {
    const r = await api('syncProducts', {});
    toast(r.message, 'ok');
    localStorage.removeItem('crm_products_v');   // يتحمّل من جديد على الأجهزة
    refresh(true);
  } catch (e) { toast(e.msg || 'فشل السحب', 'err'); }
};

// ----- تنضيف بيانات التجربة -----
A.resetForm = async () => {
  toast('⏳ بحسب اللي هيتمسح...');
  try {
    const r = await api('resetPreview', {});
    const list = arr => arr.length
      ? arr.map(x => `<div class="stat-line"><span>${esc(x.name)}</span><b>${money(x.rows)} صف</b></div>`).join('')
      : '<div class="muted">مفيش بيانات</div>';
    openModal(`
      <h2>🧹 تنضيف بيانات التجربة</h2>
      <div class="card" style="border-right:4px solid var(--red)">
        <b>⚠️ هيتمسح (الحركات):</b>${list(r.transactional)}
      </div>
      <div class="card" style="border-right:4px solid var(--green)">
        <b>✅ هيفضل زي ما هو:</b>${list(r.master)}
      </div>
      <label>مستوى التنضيف</label>
      <select id="rs-scope">
        <option value="transactions">الحركات بس (زيارات، طلبات، تحصيلات، تتبع، متابعات)</option>
        <option value="synced">+ بيانات قيود المتزامنة (بترجع بأول مزامنة)</option>
        <option value="customers_too">+ تصفير أرصدة العملاء وأعمار الديون</option>
      </select>
      <p class="muted mt">هتتاخد <b>نسخة احتياطية كاملة</b> قبل المسح تلقائيًا. لو النسخة فشلت، المسح بيتلغي.</p>
      <label>اكتب كلمة <b>مسح</b> للتأكيد</label>
      <input id="rs-confirm" placeholder="مسح">
      <div class="modal-actions">
        <button class="btn red" onclick="A.resetRun()">تنفيذ التنضيف</button>
        <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
      </div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.resetRun = async () => {
  const payload = { scope: $('#rs-scope').value, confirm: $('#rs-confirm').value.trim() };
  if (payload.confirm !== 'مسح') return toast('اكتب كلمة "مسح" للتأكيد', 'err');
  closeModal();
  toast('⏳ بياخد نسخة احتياطية وبينضف...');
  try {
    const r = await api('resetTestData', payload);
    alert(r.message + '\n\n' + (r.backup || ''));
    toast('✅ النظام جاهز للتشغيل', 'ok');
    refresh(true);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- الأرشفة وأحجام البيانات -----
A.archiveNow = async () => {
  if (!confirm('هينقل البيانات القديمة لجداول أرشيف في نفس الملف. نكمل؟')) return;
  toast('⏳ بيأرشف... ممكن ياخد دقيقة');
  try { const r = await api('archiveNow', {}); toast(r.message, 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.dataSizes = async () => {
  toast('⏳ بحسب الأحجام...');
  try {
    const r = await api('dataSizes', {});
    const big = r.sizes.filter(x => x.rows > 15000).length;
    openModal(`
      <h2>📊 أحجام الجداول</h2>
      <p class="modal-sub">آخر أرشفة: ${esc(r.lastArchive)}</p>
      ${big ? '<div class="card" style="border-right:4px solid var(--amber)">⚠️ فيه جداول كبيرة — شغّل الأرشفة عشان الأداء يفضل كويس.</div>' : ''}
      <div class="table-wrap"><table>
        <tr><th>الجدول</th><th>صفوف نشطة</th><th>في الأرشيف</th></tr>
        ${r.sizes.map(x => `<tr>
          <td>${esc(x.name)}</td>
          <td><b style="color:${x.rows > 15000 ? 'var(--amber)' : 'inherit'}">${money(x.rows)}</b></td>
          <td class="muted">${x.archived ? money(x.archived) : '—'}</td>
        </tr>`).join('')}
      </table></div>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- النسخ الاحتياطي وصحة النظام -----
A.backupNow = async () => {
  toast('⏳ بياخد نسخة... ممكن ياخد دقيقة');
  try { const r = await api('backupNow', {}); toast(r.message, 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'فشل النسخ', 'err'); }
};

A.backupList = async () => {
  toast('⏳ بجيب قايمة النسخ...');
  try {
    const r = await api('backupList', {});
    openModal(`
      <h2>📂 النسخ الاحتياطية (${r.backups.length})</h2>
      <p class="modal-sub">لو احتجت ترجع لنسخة: افتحها، وبعدين File ← Make a copy، واربط السكريبت بالنسخة الجديدة.</p>
      <a class="btn ghost full" target="_blank" href="${esc(r.folderUrl)}">📁 افتح فولدر النسخ على درايف</a>
      <div class="table-wrap mt"><table>
        <tr><th>التاريخ</th><th>الحجم</th><th></th></tr>
        ${r.backups.map(b => `<tr><td>${esc(b.date)}</td><td>${esc(b.size)}</td>
          <td><a class="btn sm outline" target="_blank" href="${esc(b.url)}">فتح</a></td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">مفيش نسخ لسه — اضغط "خد نسخة دلوقتي"</td></tr>'}
      </table></div>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.runHealth = async () => {
  const box = document.getElementById('health-box');
  box.innerHTML = '⏳ بيفحص...';
  try {
    const r = await api('healthCheck', {});
    box.innerHTML = r.issues.length
      ? '<div style="border-right:4px solid var(--amber);padding-right:10px">' +
        r.issues.map(x => '• ' + esc(x)).join('<br>') + '</div>'
      : '<b style="color:var(--green)">✅ النظام سليم — مفيش أي مشاكل</b>';
  } catch (e) { box.innerHTML = '<span style="color:var(--red)">' + esc(e.msg || 'خطأ في الفحص') + '</span>'; }
};

A.testTg = async () => {
  try { const r = await api('testTelegram', {}); toast(r.message, 'ok'); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- تفاصيل حساب المتأخرات لعميل -----
A.overdueDetails = async (custId) => {
  toast('⏳ بحسب التفاصيل...');
  try {
    const r = await api('overdueBreakdown', { customer_id: custId });
    const c$ = r.currency;
    const t = r.totals;
    const M = n => money(n) + ' ' + c$;
    openModal(`
      <h2>🔬 تفاصيل المتأخرات: ${esc(r.customer.name)}</h2>
      <p class="modal-sub">مدة الاستحقاق ${r.customer.terms} يوم — الفاتورة بتعتبر متأخرة بعدها من تاريخ إصدارها</p>
      <div class="card">
        <h3>الملخص</h3>
        <div class="stat-line"><span>إجمالي الفواتير (${t.invoiceCount})</span><b>${M(t.invoices)}</b></div>
        ${t.negativeInvoices ? `<div class="stat-line"><span>منها فواتير بقيمة سالبة (تسويات)</span><b class="pos">${M(t.negativeInvoices)}</b></div>` : ''}
        ${t.manualDebit ? `<div class="stat-line"><span>قيود يومية مدينة</span><b>${M(t.manualDebit)}</b></div>` : ''}
        <div class="stat-line"><span>سندات القبض</span><b class="pos">${M(t.receipts)}</b></div>
        <div class="stat-line"><span>المرتجعات</span><b class="pos">${M(t.returns)}</b></div>
        ${t.manualCredit ? `<div class="stat-line"><span>قيود يومية دائنة</span><b class="pos">${M(t.manualCredit)}</b></div>` : ''}
        <div class="stat-line"><span><b>إجمالي المدفوع/الدائن</b></span><b class="pos">${M(t.creditPool)}</b></div>
        <div class="stat-line"><span><b>الرصيد المستحق</b></span><b class="${r.customer.balance > 0 ? 'neg' : 'pos'}">${M(r.customer.balance)}</b></div>
        <div class="stat-line"><span><b>المتأخر منه</b></span><b class="neg">${M(r.computedOverdue)}</b></div>
        ${t.unapplied > 0 ? `<div class="stat-line"><span>مدفوع زيادة عن الفواتير</span><b class="pos">${M(t.unapplied)}</b></div>` : ''}
      </div>
      <div class="section-title"><span>توزيع المدفوع على المديونيات (الأقدم الأول)</span></div>
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>البيان</th><th>القيمة</th><th>اتسدد منها</th><th>الباقي</th><th>الحالة</th></tr>
        ${r.rows.map(x => `<tr>
          <td>${esc(x.date)}</td><td>${esc(x.label)}</td>
          <td>${money(x.total)}</td><td>${money(x.applied)}</td>
          <td>${money(x.remaining)}</td>
          <td>${x.overdue > 0 ? '<span class="badge hot">' + esc(x.why) + '</span>' : '<span class="badge cool">' + esc(x.why) + '</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">مفيش مديونيات مسجلة</td></tr>'}
      </table></div>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ----- فحص البيانات -----
A.diagnose = async () => {
  toast('⏳ بفحص البيانات...');
  try {
    const res = await api('diagnose', {});
    const d = res.report;
    const issues = [];
    if (!d.invoices) issues.push('مفيش أي فواتير متسحبة من قيود خالص — راجع الـ API Key واعمل مزامنة.');
    if (d.invoices && !d.customersLinked) issues.push('مفيش أي عميل مربوط بكود قيود — اضغط "استيراد عملاء قيود" من صفحة العملاء.');
    if (d.invoicesNotLinkedToCustomer) issues.push(d.invoicesNotLinkedToCustomer + ' فاتورة تخص عملاء مش موجودين عندك — استورد عملاء قيود عشان تتحسب.');
    if (d.invoicesNoIssueDate) issues.push(d.invoicesNoIssueDate + ' فاتورة من غير تاريخ إصدار — مش هينفع نحسب استحقاقها.');
    if (d.invoices && !d.invoicesPastDue) issues.push('مفيش فواتير عدّى استحقاقها لحد النهارده (المدة الافتراضية ' + d.paymentTerms + ' يوم) — يبقى فعلًا مفيش متأخرات 👍 لو متوقع غير كده، قلّل مدة الاستحقاق.');
    if (d.invoices && !d.receipts) issues.push('مفيش سندات قبض متسحبة — لو عندك تحصيلات في قيود، ممكن يكون فيه مشكلة في مسار التحصيلات.');
    if (d.customersNoRegion) issues.push(d.customersNoRegion + ' عميل من غير منطقة — مش هيظهروا لأي مندوب.');

    const statusRows = Object.keys(d.statuses || {}).map(k =>
      `<div class="stat-line"><span>${esc(k)}</span><b>${d.statuses[k]}</b></div>`).join('');

    openModal(`
      <h2>🔍 فحص البيانات</h2>
      <p class="modal-sub">آخر مزامنة: ${esc(d.lastSync)}</p>
      ${issues.length ? '<div class="card" style="border-right:4px solid var(--amber)"><b>الخلاصة:</b><br>' +
        issues.map(x => '• ' + esc(x)).join('<br>') + '</div>' :
        '<div class="card" style="border-right:4px solid var(--green)">✅ كل البيانات سليمة والأرقام المفروض ظاهرة صح.</div>'}
      <div class="card">
        <h3>العملاء</h3>
        <div class="stat-line"><span>إجمالي العملاء</span><b>${d.customers}</b></div>
        <div class="stat-line"><span>مربوطين بقيود</span><b>${d.customersLinked}</b></div>
        <div class="stat-line"><span>من غير منطقة</span><b>${d.customersNoRegion}</b></div>
        <div class="stat-line"><span>ليهم مدة استحقاق خاصة</span><b>${d.customersCustomTerms} <span class="muted">(الباقي ${d.paymentTerms} يوم)</span></b></div>
        <div class="stat-line"><span>عليهم رصيد</span><b>${d.customersWithBalance}</b></div>
        <div class="stat-line"><span>عليهم متأخرات</span><b>${d.customersWithOverdue}</b></div>
      </div>
      <div class="card">
        <h3>الفواتير</h3>
        <div class="stat-line"><span>إجمالي الفواتير</span><b>${d.invoices}</b></div>
        <div class="stat-line"><span>من غير تاريخ إصدار</span><b>${d.invoicesNoIssueDate}</b></div>
        <div class="stat-line"><span>عدّى استحقاقها</span><b>${d.invoicesPastDue}</b></div>
        <div class="stat-line"><span>ليها رقم فاتورة</span><b>${d.invoicesWithNumber}</b></div>
        <div class="stat-line"><span>فيها مبلغ مدفوع</span><b>${d.invoicesWithPaidField}</b></div>
        <div class="stat-line"><span>مش مربوطة بعميل عندك</span><b>${d.invoicesNotLinkedToCustomer}</b></div>
        <div class="stat-line"><span>سندات القبض</span><b>${d.receipts}</b></div>
        <div class="stat-line"><span>المرتجعات</span><b>${d.returns}</b></div>
      </div>
      ${statusRows ? '<div class="card"><h3>حالات الفواتير في قيود</h3>' + statusRows + '</div>' : ''}
      <div class="card">
        <h3>عينة خام من قيود</h3>
        ${d.qoyodError ? '<p style="color:var(--red)">⚠️ ' + esc(d.qoyodError) + '</p>' :
          `<div class="stat-line"><span>رقم الفاتورة</span><b>${esc(d.qoyodSample ? d.qoyodSample.reference : '—')}</b></div>
           <div class="stat-line"><span>تاريخ الإصدار</span><b>${esc(d.qoyodSample ? d.qoyodSample.issue_date : '—')}</b></div>
           <div class="stat-line"><span>تاريخ الاستحقاق</span><b>${esc(d.qoyodSample ? d.qoyodSample.due_date : '—')}</b></div>
           <div class="stat-line"><span>الحالة</span><b>${esc(d.qoyodSample ? d.qoyodSample.status : '—')}</b></div>
           <div class="stat-line"><span>الإجمالي</span><b>${esc(d.qoyodSample ? d.qoyodSample.total : '—')}</b></div>
           <div class="stat-line"><span>المدفوع</span><b>${esc(d.qoyodSample ? d.qoyodSample.paid : '—')}</b></div>
           <p class="muted mt">الحقول المتاحة: ${esc(d.qoyodFields || '—')}</p>`}
      </div>
      <div class="modal-actions">
        <button class="btn ghost" onclick="A.copyDiag(${JSON.stringify(JSON.stringify(d)).replace(/"/g, '&quot;')})">📋 نسخ التقرير</button>
        <button class="btn outline" onclick="A.closeModal()">إغلاق</button>
      </div>`);
  } catch (e) { toast(e.msg || 'خطأ في الفحص', 'err'); }
};
A.copyDiag = (json) => {
  const txt = typeof json === 'string' ? json : JSON.stringify(json);
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('✅ اتنسخ — تقدر تبعته', 'ok'));
  else toast('انسخه يدوي من الشاشة', 'err');
};

// ==================== [ features.js ] ====================
/* CRM روافد — فيتشرز مشتركة: الترتيب، الصوت، التوقيع والصور، الطلبات، التحصيلات، العهدة */

// ================== لوحة تنافس المناديب ==================
A.leaderboard = async (period, metric) => {
  S.lbPeriod = period || S.lbPeriod || 'week';
  S.lbSort = metric || S.lbSort || 'visits';
  toast('⏳ بجهز الترتيب...');
  try {
    S.lb = await api('leaderboard', { period: S.lbPeriod, metric: S.lbSort });
    renderLeaderboard();
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};
A.lbSort = (key) => A.leaderboard(S.lbPeriod, key);
A.lbPeriod = (p) => A.leaderboard(p, S.lbSort);

const LB_MEDALS = ['🥇', '🥈', '🥉'];
const LB_METRICS = [
  ['visits', 'الزيارات'], ['coverage', 'التغطية'],
  ['collected', 'التحصيلات'], ['netSales', 'صافي المبيعات']
];

function renderLeaderboard() {
  const r = S.lb;
  const key = r.metric || 'visits';
  const metricName = (LB_METRICS.find(m => m[0] === key) || [, ''])[1];
  const head = `
    <h2>🏆 ترتيب المناديب</h2>
    <p class="modal-sub">${esc(r.period)} — من ${esc(r.from)} إلى ${esc(r.to)}</p>
    <div class="pill-row">
      <button class="pill ${S.lbPeriod === 'week' ? 'active' : ''}" onclick="A.lbPeriod('week')">الأسبوع</button>
      <button class="pill ${S.lbPeriod === 'month' ? 'active' : ''}" onclick="A.lbPeriod('month')">الشهر</button>
    </div>
    <div class="pill-row">
      ${LB_METRICS.map(m => `<button class="pill ${key === m[0] ? 'active' : ''}" onclick="A.lbSort('${m[0]}')">ترتيب بـ ${m[1]}</button>`).join('')}
    </div>`;

  // ===== شاشة الأدمن: كل الأرقام =====
  if (r.isAdmin) {
    openModal(head + `
      <div class="table-wrap"><table>
        <tr><th>#</th><th>المندوب</th><th>الزيارات</th><th>التغطية</th><th>التحصيلات</th><th>صافي المبيعات</th><th>المسافة</th></tr>
        ${r.rows.map(x => `<tr>
          <td><b>${LB_MEDALS[x.rank - 1] || x.rank}</b></td>
          <td><b>${esc(x.rep_name)}</b>${x.region ? '<div class="muted" style="font-size:11px">' + esc(x.region) + '</div>' : ''}</td>
          <td><b>${x.visits}</b></td>
          <td><span class="badge ${x.coverage >= 80 ? 'cool' : x.coverage >= 50 ? 'warm' : 'hot'}">${x.coverage}%</span>
            <div class="muted" style="font-size:11px">${x.covered} من ${x.customers}</div></td>
          <td class="pos">${money(x.collected)}</td>
          <td>${money(x.netSales)}</td>
          <td>${x.distanceKm ? x.distanceKm + ' كم' : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">مفيش بيانات في الفترة دي</td></tr>'}
      </table></div>
      <p class="muted mt">المناديب بيشوفوا مركزهم وأرقامهم هم بس — مش أرقام بعض.</p>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
    return;
  }

  // ===== شاشة المندوب: مركزه وأرقامه هو بس =====
  const me = r.rows.find(x => x.me);
  openModal(head + `
    ${me ? `<div class="card" style="border-right:4px solid var(--blue);text-align:center">
      <div style="font-size:34px;font-weight:800;color:var(--blue)">${LB_MEDALS[me.rank - 1] || ('#' + me.rank)}</div>
      <div><b>مركزك ${me.rank} من ${r.total}</b> في ${esc(metricName)}</div>
    </div>
    <div class="card">
      <h3>أرقامك ${esc(r.period === 'الشهر' ? 'الشهر ده' : 'الأسبوع ده')}</h3>
      <div class="stat-line"><span>الزيارات المنفذة</span><b>${me.visits}</b></div>
      <div class="stat-line"><span>تغطية عملائك</span>
        <b><span class="badge ${me.coverage >= 80 ? 'cool' : me.coverage >= 50 ? 'warm' : 'hot'}">${me.coverage}%</span>
        <span class="muted" style="font-size:12px"> (${me.covered} من ${me.customers})</span></b></div>
      <div class="stat-line"><span>التحصيلات</span><b class="pos">${moneyC(me.collected)}</b></div>
      <div class="stat-line"><span>صافي المبيعات</span><b>${moneyC(me.netSales)}</b></div>
      ${me.distanceKm ? `<div class="stat-line"><span>المسافة المقطوعة</span><b>${me.distanceKm} كم</b></div>` : ''}
    </div>` : '<div class="empty">لسه مفيش أرقام ليك في الفترة دي</div>'}
    <div class="section-title"><span>الترتيب</span></div>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>المندوب</th><th>${esc(metricName)}</th></tr>
      ${r.rows.map(x => `<tr ${x.me ? 'style="background:var(--blue-soft)"' : ''}>
        <td><b>${LB_MEDALS[x.rank - 1] || x.rank}</b></td>
        <td>${esc(x.rep_name)}${x.me ? ' <span class="badge info">انت</span>' : ''}</td>
        <td>${x.me ? '<b>' + (key === 'coverage' ? x.coverage + '%' : key === 'visits' ? x.visits : money(x[key])) + '</b>' : '<span class="muted">—</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="3" class="muted">مفيش بيانات</td></tr>'}
    </table></div>
    <p class="muted mt">بتشوف مركزك وأرقامك انت بس — أرقام زمايلك خاصة بيهم.</p>
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
}

// ================== الكتابة بالصوت ==================
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let _rec = null, _recTarget = null;
function micButton(targetId) {
  if (!SR) return '';
  return `<button type="button" class="btn sm ghost mic-btn" id="mic-${targetId}"
    onclick="A.mic('${targetId}')">🎤 اكتب بصوتك</button>`;
}
A.mic = (targetId) => {
  const el = document.getElementById(targetId);
  const btn = document.getElementById('mic-' + targetId);
  if (!el || !SR) return;
  if (_rec) { try { _rec.stop(); } catch (e) {} _rec = null; return; }

  const rec = new SR();
  rec.lang = 'ar-SA';
  rec.continuous = true;
  rec.interimResults = true;
  let base = el.value ? el.value.trim() + ' ' : '';
  rec.onstart = () => { btn.classList.add('rec'); btn.textContent = '⏹️ وقف التسجيل'; toast('🎤 اتكلم دلوقتي...'); };
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    el.value = base + text;
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') toast('لازم تسمح باستخدام الميكروفون', 'err');
    else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('مشكلة في التسجيل: ' + e.error, 'err');
  };
  rec.onend = () => {
    _rec = null;
    if (btn) { btn.classList.remove('rec'); btn.textContent = '🎤 اكتب بصوتك'; }
  };
  _rec = rec;
  _recTarget = targetId;
  try { rec.start(); } catch (e) { _rec = null; toast('مقدرتش أشغل الميكروفون', 'err'); }
};
function stopMic() { if (_rec) { try { _rec.stop(); } catch (e) {} _rec = null; } }

// ================== التوقيع والصور ==================
/** لوحة توقيع بالإصبع */
function signaturePad(id) {
  return `<canvas id="${id}" class="sig-pad" width="600" height="220"></canvas>
    <div class="flex mt"><button type="button" class="btn sm outline" onclick="A.sigClear('${id}')">🗑️ مسح</button></div>`;
}
function initSignature(id) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
  let drawing = false, empty = true;
  const pos = e => {
    const r = cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (cv.width / r.width), y: (t.clientY - r.top) * (cv.height / r.height) };
  };
  const start = e => { e.preventDefault(); drawing = true; empty = false; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing = false; };
  cv.addEventListener('mousedown', start); cv.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  cv.addEventListener('touchstart', start, { passive: false });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', end);
  cv._isEmpty = () => empty;
}
A.sigClear = (id) => {
  const cv = document.getElementById(id);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  cv._isEmpty = () => true;
  initSignature(id);
};

// ================== سند القبض الكامل ==================
/** بيقسّم النص لسطور تدخل في العرض المتاح */
function wrapLines(ctx, text, maxW) {
  const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(w => {
    const t = line ? line + ' ' + w : w;
    if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; }
    else line = t;
  });
  if (line) lines.push(line);
  return lines;
}

/**
 * بيرسم سند القبض كامل كصورة — اللوجو والمبلغ رقمًا وكتابةً والتوقيع كلهم في ورقة واحدة.
 * بيتعمل على موبايل المندوب لحظة الحفظ، فبيشتغل من غير نت والعربي بيطلع سليم.
 * o = { voucher, date, time, customer, amount, method, reference, notes, rep, sigCanvas, company, currency }
 */
function composeReceipt(o) {
  return new Promise(resolve => {
    const W = 780, H = 1090, M = 46, RIGHT = W - M, INNER = W - M * 2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const F = (sz, bold) => (bold ? 'bold ' : '') + sz + 'px Tahoma, "Segoe UI", "Noto Naskh Arabic", system-ui, sans-serif';

    const paint = (logoImg) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';

      // برواز
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, W - 28, H - 28);

      let y = M + 12;
      // اللوجو واسم الشركة
      if (logoImg) {
        const lh = 74, lw = Math.min(230, logoImg.width * (lh / logoImg.height));
        ctx.drawImage(logoImg, (W - lw) / 2, y, lw, lh);
        y += lh + 12;
      }
      ctx.textAlign = 'center'; ctx.fillStyle = '#1e3a5f';
      ctx.font = F(30, true);
      ctx.fillText(o.company || 'شركة روافد', W / 2, y + 26); y += 44;

      // عنوان السند
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(W / 2 - 108, y, 216, 46);
      ctx.fillStyle = '#ffffff'; ctx.font = F(26, true);
      ctx.fillText('سند قبض', W / 2, y + 32);
      y += 76;

      ctx.textAlign = 'right';
      const line = () => { ctx.strokeStyle = '#c8d0dc'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(RIGHT, y); ctx.stroke(); y += 26; };

      // سطر بعنوان وقيمة — لو النص أطول من المساحة بيتقص بـ«…» عشان القص يبان مش يختفي
      const field = (label, value, size, maxLines) => {
        const max = maxLines || 3;
        ctx.font = F(size || 20); ctx.fillStyle = '#5d6a7a';
        ctx.fillText(label, RIGHT, y);
        const lw = ctx.measureText(label).width;
        ctx.font = F(size || 20, true); ctx.fillStyle = '#101d2b';
        let lines = wrapLines(ctx, value, INNER - lw - 10);
        if (lines.length > max) {
          lines = lines.slice(0, max);
          lines[max - 1] = lines[max - 1] + ' …';
        }
        ctx.fillText(lines[0] || '—', RIGHT - lw - 8, y);
        y += 32;
        lines.slice(1).forEach(l => { ctx.fillText(l, RIGHT, y); y += 30; });
      };

      // رقم السند والتاريخ في سطر واحد
      ctx.font = F(20); ctx.fillStyle = '#5d6a7a';
      ctx.fillText('رقم السند:', RIGHT, y);
      const w1 = ctx.measureText('رقم السند:').width;
      ctx.font = F(23, true); ctx.fillStyle = '#a52626';
      ctx.fillText(String(o.voucher || '—'), RIGHT - w1 - 8, y);
      ctx.textAlign = 'left'; ctx.font = F(19); ctx.fillStyle = '#101d2b';
      ctx.fillText(String(o.date || '') + '   ' + String(o.time || ''), M, y);
      ctx.textAlign = 'right';
      y += 22; line();

      field('استلمنا من السيد/ة:', o.customer || '—');
      field('مبلغ وقدره:', money(o.amount) + ' ' + (o.currency || 'ر.س'), 24);

      // المبلغ كتابةً في إطار
      ctx.font = F(20, true);
      const words = wrapLines(ctx, amountInWords(o.amount), INNER - 26);
      const boxH = 20 + words.length * 30;
      ctx.fillStyle = '#f4f6fa'; ctx.fillRect(M, y - 4, INNER, boxH);
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1.5; ctx.strokeRect(M, y - 4, INNER, boxH);
      ctx.fillStyle = '#101d2b';
      words.forEach((l, i) => ctx.fillText(l, RIGHT - 13, y + 24 + i * 30));
      y += boxH + 22;

      field('طريقة الدفع:', o.method || '—');
      if (o.reference) field('رقم المرجع:', o.reference, 20, 2);
      if (o.notes) field('وذلك عن:', o.notes, 20, 4);
      line();

      // المندوب والتوقيع
      const sigTop = y + 6;
      ctx.font = F(19); ctx.fillStyle = '#5d6a7a';
      ctx.fillText('المستلم (المندوب)', RIGHT, sigTop + 16);
      ctx.font = F(21, true); ctx.fillStyle = '#101d2b';
      ctx.fillText(o.rep || '', RIGHT, sigTop + 50);

      ctx.textAlign = 'center'; ctx.font = F(19); ctx.fillStyle = '#5d6a7a';
      const sx = M + INNER * 0.28;
      ctx.fillText('توقيع العميل', sx, sigTop + 16);
      if (o.sigCanvas) {
        const sw = 260, sh = Math.round(sw * (o.sigCanvas.height / o.sigCanvas.width));
        ctx.drawImage(o.sigCanvas, sx - sw / 2, sigTop + 26, sw, sh);
        ctx.strokeStyle = '#101d2b'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx - sw / 2, sigTop + 30 + sh); ctx.lineTo(sx + sw / 2, sigTop + 30 + sh); ctx.stroke();
      }

      // التذييل
      ctx.font = F(15); ctx.fillStyle = '#8a94a3';
      ctx.fillText('صادر إلكترونيًا من نظام ' + (o.company || 'روافد') + ' — ' + (o.date || ''), W / 2, H - 40);

      resolve(cv.toDataURL('image/jpeg', 0.85));
    };

    const src = logoSrc();
    if (!src) return paint(null);
    const img = new Image();
    img.onload = () => paint(img);
    img.onerror = () => paint(null);
    img.src = src;
  });
}

/** بيصغّر الصورة قبل الرفع عشان تبقى خفيفة على النت */
function shrinkImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, (maxSide || 1200) / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', quality || 0.7));
      };
      img.onerror = () => reject(new Error('مقدرتش أقرا الصورة'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('مقدرتش أقرا الملف'));
    reader.readAsDataURL(file);
  });
}

async function uploadAttachment(kind, id, type, dataUrl) {
  if (!navigator.onLine) throw { msg: 'المرفقات محتاجة نت — سجل الحركة والصور ارفعها بعدين' };
  const r = await api('uploadAttachment', { kind: kind, id: id, type: type, data: dataUrl });
  return r.url;
}

// ================== الطلبات وسندات القبض ==================
function products() { return JSON.parse(localStorage.getItem('crm_products') || '[]'); }
async function syncProducts() {
  const v = S.data && S.data.productsVersion;
  if (v === undefined) return;
  if (!v) { localStorage.removeItem('crm_products'); localStorage.removeItem('crm_products_v'); return; }
  if (localStorage.getItem('crm_products_v') === v && products().length) return;
  try {
    const r = await api('getProducts', {});
    localStorage.setItem('crm_products', JSON.stringify(r.products || []));
    localStorage.setItem('crm_products_v', r.version || v);
  } catch (e) { /* هنجيبه المرة الجاية */ }
}
function vatPct() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return Number(s.VAT_PERCENT) || 0;
}
function payMethods() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return String(s.PAY_METHODS || 'كاش').split(',').map(x => x.trim()).filter(Boolean);
}
function custodyMethods() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return String(s.CUSTODY_METHODS || 'كاش').split(',').map(x => x.trim()).filter(Boolean);
}
function isCustodyMethod(m) { return custodyMethods().indexOf(String(m).trim()) > -1; }

function featureOn(key) {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return String(s[key] === undefined ? 'TRUE' : s[key]).toUpperCase() !== 'FALSE';
}

// ----- شاشة الطلب -----
A.orderForm = (custId) => {
  const c = custById(custId);
  if (!c) return;
  if (!products().length) return toast('الكتالوج فاضي — الأدمن لازم يسحب الأصناف من قيود الأول', 'err');
  A._order = { customer_id: custId, items: [], notes: '' };
  renderOrderModal(c);
};

/** حالة ائتمان العميل — نفس منطق السيرفر */
function creditInfo(c, extra) {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  const limit = Number(c.credit_limit) > 0 ? Number(c.credit_limit) : (Number(s.CREDIT_LIMIT_DEFAULT) || 0);
  const exposure = Math.round(((Number(c.balance) || 0) + (Number(extra) || 0)) * 100) / 100;
  const overdue = Number(c.overdue) || 0;
  const overLimit = limit > 0 && exposure > limit;
  const blockLimit = String(s.CREDIT_BLOCK).toUpperCase() === 'TRUE';
  const blockOverdue = String(s.CREDIT_BLOCK_OVERDUE).toUpperCase() === 'TRUE';
  return {
    limit: limit, exposure: exposure, overdue: overdue, overLimit: overLimit,
    available: limit > 0 ? Math.round((limit - exposure) * 100) / 100 : null,
    blocked: (overLimit && blockLimit) || (overdue > 0 && blockOverdue)
  };
}

function renderOrderModal(c) {
  const o = A._order;
  const sub = o.items.reduce((s, i) => s + i.qty * i.price, 0);
  const vat = Math.round(sub * vatPct()) / 100;
  const cr = creditInfo(c, sub + vat);
  openModal(`
    <h2>🛒 طلب جديد: ${esc(c.name)}</h2>
    <p class="modal-sub">الطلب بيتبعت لقيود كـ <b>عرض سعر</b> — الفاتورة بتتعمل من الإدارة.</p>
    ${cr.overdue > 0 ? '<div class="card" style="border-right:4px solid var(--red)"><b>⚠️ العميل عليه متأخرات ' + moneyC(cr.overdue) + '</b><div class="muted">راجع الإدارة قبل ما تاخد طلب جديد.</div></div>' : ''}
    ${cr.limit > 0 ? `<div class="card" style="border-right:4px solid ${cr.overLimit ? 'var(--red)' : 'var(--green)'}">
      <div class="stat-line"><span>حد الائتمان</span><b>${moneyC(cr.limit)}</b></div>
      <div class="stat-line"><span>رصيده + الطلب ده</span><b>${moneyC(cr.exposure)}</b></div>
      <div class="stat-line"><span>${cr.overLimit ? '<b style="color:var(--red)">تعدى الحد بـ</b>' : 'المتاح ليه'}</span>
        <b class="${cr.overLimit ? 'neg' : 'pos'}">${moneyC(Math.abs(cr.available))}</b></div>
      ${cr.blocked ? '<div class="muted" style="color:var(--red)"><b>الطلب مش هيتقبل — لازم موافقة الإدارة</b></div>' : ''}
    </div>` : ''}
    <input id="ord-search" placeholder="🔍 دور على صنف بالاسم أو الكود" oninput="A.orderSearch(this.value)" autocomplete="off">
    <div id="ord-results"></div>
    <div class="section-title"><span>أصناف الطلب (${o.items.length})</span></div>
    <div id="ord-items">${orderItemsHtml()}</div>
    <div class="card">
      <div class="stat-line"><span>الإجمالي قبل الضريبة</span><b>${moneyC(sub)}</b></div>
      <div class="stat-line"><span>ضريبة ${vatPct()}%</span><b>${moneyC(vat)}</b></div>
      <div class="stat-line"><span><b>الإجمالي التقديري</b></span><b>${moneyC(sub + vat)}</b></div>
    </div>
    <label>ملاحظات على الطلب</label>
    <textarea id="ord-notes" rows="2" placeholder="موعد التسليم، طلبات خاصة...">${esc(o.notes || '')}</textarea>
    ${micButton('ord-notes')}
    <div class="modal-actions">
      <button class="btn green" onclick="A.orderSave('${c.id}')" ${(o.items.length && !cr.blocked) ? '' : 'disabled'}>حفظ الطلب ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
}

function orderItemsHtml() {
  const o = A._order;
  if (!o.items.length) return '<div class="empty" style="padding:16px"><div class="big">🛒</div>دور على صنف وضيفه</div>';
  return o.items.map((it, idx) => `
    <div class="cust-card" style="padding:10px 12px">
      <div class="cust-head">
        <div><div class="cust-name" style="font-size:14px">${esc(it.name)}</div>
          <div class="cust-meta">${esc(it.sku || '')} • ${moneyC(it.price)} للوحدة
          ${it.price < it.list_price ? '<span class="badge warm">خصم ' + Math.round((1 - it.price / it.list_price) * 100) + '%</span>' : ''}</div></div>
        <b>${moneyC(it.qty * it.price)}</b>
      </div>
      <div class="flex mt" style="gap:6px">
        <button class="btn sm outline" onclick="A.ordQty(${idx},-1)">−</button>
        <input type="text" inputmode="decimal" value="${it.qty}" onchange="A.ordSetQty(${idx}, this.value)" style="text-align:center">
        <button class="btn sm outline" onclick="A.ordQty(${idx},1)">+</button>
        <input type="text" inputmode="decimal" value="${it.price}" onchange="A.ordSetPrice(${idx}, this.value)" title="السعر">
        <button class="btn sm red" onclick="A.ordRemove(${idx})">حذف</button>
      </div>
    </div>`).join('');
}

A.orderSearch = (q) => {
  const box = document.getElementById('ord-results');
  q = normDigits(q).toLowerCase().trim();
  if (!q) { box.innerHTML = ''; return; }
  const list = products().filter(p =>
    String(p.name).toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = list.length ? list.map(p => `
    <div class="cust-card" style="padding:9px 12px;cursor:pointer" onclick="A.ordAdd('${esc(String(p.id))}')">
      <div class="cust-head"><div><div class="cust-name" style="font-size:14px">${esc(p.name)}</div>
      <div class="cust-meta">${esc(p.sku || '')} ${p.unit ? '• ' + esc(p.unit) : ''}</div></div>
      <b>${moneyC(p.price)}</b></div>
    </div>`).join('') : '<div class="muted" style="padding:8px">مفيش صنف بالاسم ده</div>';
};

A.ordAdd = (pid) => {
  const p = products().find(x => String(x.id) === String(pid));
  if (!p) return;
  const o = A._order;
  const found = o.items.find(i => String(i.product_qoyod_id) === String(p.id));
  if (found) found.qty += 1;
  else o.items.push({ product_qoyod_id: p.id, sku: p.sku, name: p.name, qty: 1, price: p.price, list_price: p.price });
  refreshOrderModal();
};
A.ordQty = (idx, d) => {
  const it = A._order.items[idx];
  it.qty = Math.max(0, Math.round((it.qty + d) * 100) / 100);
  if (!it.qty) A._order.items.splice(idx, 1);
  refreshOrderModal();
};
A.ordSetQty = (idx, v) => {
  const n = Number(normDigits(v));
  if (!(n > 0)) { A._order.items.splice(idx, 1); } else A._order.items[idx].qty = n;
  refreshOrderModal();
};
A.ordSetPrice = (idx, v) => {
  const n = Number(normDigits(v));
  if (n >= 0) A._order.items[idx].price = n;
  refreshOrderModal();
};
A.ordRemove = (idx) => { A._order.items.splice(idx, 1); refreshOrderModal(); };

function refreshOrderModal() {
  const notes = document.getElementById('ord-notes');
  if (notes) A._order.notes = notes.value;
  const c = custById(A._order.customer_id);
  const q = (document.getElementById('ord-search') || {}).value || '';
  renderOrderModal(c);
  const s = document.getElementById('ord-search');
  if (s && q) { s.value = q; A.orderSearch(q); }
}

A.orderSave = async (custId) => {
  const o = A._order;
  const notes = document.getElementById('ord-notes');
  if (notes) o.notes = notes.value.trim();
  if (!o.items.length) return toast('ضيف أصناف الأول', 'err');
  const payload = { customer_id: custId, items: o.items, notes: o.notes, date: new Date().toISOString().slice(0, 10) };
  closeModal();
  try { const r = await api('saveOrder', payload); toast(r.message, 'ok'); }
  catch (e) {
    if (e.offline) { if (qpush('saveOrder', payload)) toast('📴 الطلب اتحفظ محليًا وهيترفع لما النت يرجع', 'ok'); }
    else toast(e.msg || 'خطأ', 'err');
  }
};

// ----- سند القبض -----
A.collectForm = (custId) => {
  const c = custById(custId);
  if (!c) return;
  openModal(`
    <h2>💵 سند قبض: ${esc(c.name)}</h2>
    ${Number(c.overdue) > 0 ? '<p class="modal-sub">المتأخر عليه: <b>' + moneyC(c.overdue) + '</b></p>' : ''}
    <label>رقم سند القبض (من الدفتر) *</label>
    <input id="col-voucher" type="text" inputmode="numeric" placeholder="الرقم المطبوع على ورقة السند">
    <label>المبلغ (${esc(cur())}) *</label>
    <input id="col-amount" type="text" inputmode="decimal" placeholder="0" oninput="A.colWords(this.value)">
    <div id="col-words" class="muted"></div>
    <label>طريقة الدفع</label>
    <select id="col-method" onchange="A.colMethod(this.value)">
      ${payMethods().map(m => '<option>' + esc(m) + '</option>').join('')}
    </select>
    <div id="col-hint" class="muted"></div>
    <div id="col-ref-box" style="display:none">
      <label id="col-ref-label">رقم المرجع</label><input id="col-ref">
    </div>
    <label>ملاحظات</label><input id="col-notes">
    <label id="col-sig-label">توقيع العميل *</label>
    ${signaturePad('col-sig')}
    <p class="muted mt">تحصيل ${esc(custodyMethods().join(' و'))} بيتسجل في عهدتك لحد ما تورّده للإدارة.</p>
    <div class="modal-actions">
      <button class="btn green" onclick="A.collectSave('${custId}')">حفظ السند ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`, () => { initSignature('col-sig'); });
};
function bankMethodsList() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return String(s.BANK_METHODS || 'تحويل').split(',').map(x => x.trim()).filter(Boolean);
}
function isBankMethod(m) { return bankMethodsList().indexOf(String(m).trim()) > -1; }

/** المبلغ بالحروف بيتكتب تحت الخانة وانت بتكتب — عشان المندوب يراجع قبل ما العميل يوقّع */
A.colWords = (v) => {
  const box = document.getElementById('col-words');
  if (!box) return;
  const n = Number(normDigits(v));
  box.textContent = n > 0 ? amountInWords(n) : '';
};

A.colMethod = (v) => {
  const custody = isCustodyMethod(v);
  document.getElementById('col-ref-box').style.display = custody ? 'none' : 'block';
  const lbl = document.getElementById('col-ref-label');
  if (lbl) lbl.textContent = v === 'شيك' ? 'رقم الشيك' : v === 'مدى' ? 'رقم العملية / آخر 4 أرقام' : 'رقم العملية';
  // التوقيع إجباري على الكاش (اللي بيدخل العهدة) — الباقي ليه إثبات من البنك
  const sigLbl = document.getElementById('col-sig-label');
  if (sigLbl) sigLbl.innerHTML = custody ? 'توقيع العميل *' : 'توقيع العميل <span class="muted">(اختياري)</span>';
  const hint = document.getElementById('col-hint');
  if (!hint) return;
  if (isBankMethod(v)) {
    hint.innerHTML = '<b style="color:var(--amber)">🏦 هتتسجل مستنية تأكيد وصولها البنك</b>' +
      '<br>سجّل التاريخ والمبلغ زي ما هما في إشعار التحويل بالظبط عشان المطابقة تظبط.';
  } else if (custody) {
    hint.textContent = '💰 هيدخل عهدتك لحد ما تورّده';
  } else {
    hint.textContent = '🏦 بيروح لحساب ' + v + ' مباشرة — مش هيدخل عهدتك';
  }
};
A.collectSave = async (custId) => {
  const c = custById(custId) || {};
  const voucher = normDigits(($('#col-voucher') || {}).value || '').trim();
  const amount = normDigits($('#col-amount').value);
  const method = $('#col-method').value;
  if (!voucher) return toast('اكتب رقم سند القبض من الدفتر', 'err');
  if (!(Number(amount) > 0)) return toast('اكتب المبلغ', 'err');

  const cv = document.getElementById('col-sig');
  const signed = cv && !cv._isEmpty();
  if (isCustodyMethod(method) && !signed) return toast('لازم العميل يوقّع على السند', 'err');

  const now = new Date();
  const payload = {
    customer_id: custId, voucher: voucher, amount: amount, method: method,
    reference: ($('#col-ref') || {}).value || '', notes: $('#col-notes').value.trim(),
    date: todayISO(now)
  };
  // السند الكامل بيتبعت مع الطلب نفسه — عشان ميضيعش لو النت قطع بعد الحفظ
  try {
    payload.receipt = await composeReceipt({
      voucher: voucher, date: payload.date,
      time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      customer: c.name, amount: Number(amount), method: method,
      reference: payload.reference, notes: payload.notes,
      rep: (S.user && S.user.name) || '', sigCanvas: signed ? cv : null,
      company: companyName(), currency: cur()
    });
  } catch (e) { /* لو الرسم فشل لأي سبب، السند بيتسجل من غير الصورة */ }

  closeModal();
  try {
    const r = await api('saveCollection', payload);
    toast(r.message, 'ok');
    refresh(true);
  } catch (e) {
    if (e.offline) {
      if (qpush('saveCollection', payload)) toast('📴 السند اتحفظ محليًا وهيترفع لما النت يرجع', 'ok');
    } else toast(e.msg || 'خطأ', 'err');
  }
};

// ----- عهدة المندوب -----
A.myCash = async () => {
  toast('⏳ بجيب كشف عهدتك...');
  try {
    const r = await api('myCash', {});
    A._cash = r;
    renderCashModal();
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

function renderCashModal() {
  const r = A._cash, c = r.cash;
  openModal(`
    <h2>💰 كشف عهدتك</h2>
    <div class="card" style="text-align:center">
      <div style="font-size:30px;font-weight:800;color:${c.balance > 0 ? 'var(--green)' : 'var(--muted)'}">
        ${money(c.balance)} ${esc(r.currency)}</div>
      <div class="muted">اللي معاك دلوقتي</div>
    </div>
    <div class="card">
      <div class="stat-line"><span>رصيد بداية المدة${c.openingDate ? ' (' + esc(c.openingDate) + ')' : ''}</span><b>${money(c.opening)}</b></div>
      <div class="stat-line"><span>+ تحصيلات كاش (${c.collectionsCount})</span><b class="pos">${money(c.collections)}</b></div>
      <div class="stat-line"><span>− مصروفات (${c.expensesCount})</span><b class="neg">${money(c.expenses)}</b></div>
      <div class="stat-line"><span><b>= اللي معاك</b></span><b>${money(c.balance)} ${esc(r.currency)}</b></div>
    </div>
    <div class="flex">
      ${r.canSpend ? `<button class="btn amber" onclick="A.expenseForm()">➖ صرف من العهدة</button>` : ''}
      <button class="btn ghost" onclick="A.myExpenses()">🧾 كل مصروفاتي</button>
    </div>
    <div class="mt"></div>
    ${c.moves.length ? `<div class="section-title"><span>حركة العهدة</span></div>
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>منصرف</th></tr>
        ${c.moves.map(m => `<tr>
          <td>${esc(m.date)}</td><td>${esc(m.label)}</td>
          <td class="pos">${m.sign > 0 ? money(m.amount) : '—'}</td>
          <td class="neg">${m.sign < 0 ? money(m.amount) : '—'}</td>
        </tr>`).join('')}
      </table></div>` : '<div class="empty">مفيش حركة على عهدتك 👍</div>'}
    <p class="muted mt">لما تورّد الفلوس للإدارة، الأدمن بيقفل الحركات دي والباقي بيتحول لرصيد بداية جديد.</p>
    <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">إغلاق</button></div>`);
}

A.expenseForm = () => {
  const r = A._cash;
  openModal(`
    <h2>➖ صرف من العهدة</h2>
    <p class="modal-sub">اللي معاك دلوقتي: <b>${money(r.cash.balance)} ${esc(r.currency)}</b></p>
    <label>رقم سند الصرف *</label>
    <input id="exp-voucher" type="text" inputmode="numeric" placeholder="الرقم المكتوب على السند">
    <label>نوع المصروف *</label>
    <select id="exp-cat">${r.categories.map(c => '<option>' + esc(c) + '</option>').join('')}</select>
    <label>المبلغ (${esc(r.currency)}) *</label>
    <input id="exp-amount" type="text" inputmode="decimal" placeholder="0">
    <label>البيان *</label>
    <input id="exp-desc" placeholder="مثال: بنزين السيارة من محطة كذا">
    <label>تاريخ الصرف *</label>
    <input id="exp-date" type="date" value="${todayISO()}" max="${todayISO()}">
    <p class="muted mt">اكتب رقم السند زي ما هو مكتوب على الورقة — الإدارة بتراجع بيه وبترحّله للحسابات.</p>
    <div class="modal-actions">
      <button class="btn amber" onclick="A.expenseSave()">تسجيل المصروف ✔</button>
      <button class="btn outline" onclick="A.myCash()">رجوع</button>
    </div>`);
};

/** سجل مصروفات المندوب من البداية — بيشوف بتوعه هو بس */
A.myExpenses = async () => {
  toast('⏳ بجيب مصروفاتك...');
  try {
    const r = await api('expenseReport', { includeArchive: true });
    openModal(`
      <h2>🧾 كل مصروفاتك</h2>
      <p class="modal-sub">${r.count} حركة بإجمالي <b>${money(r.total)} ${esc(r.currency)}</b></p>
      ${r.byCategory.length ? '<div class="card">' + r.byCategory.map(c =>
        `<div class="stat-line"><span>${esc(c.name)}</span><b>${money(c.total)}</b></div>`).join('') + '</div>' : ''}
      <div class="table-wrap"><table>
        <tr><th>التاريخ</th><th>سند</th><th>النوع</th><th>المبلغ</th><th>البيان</th><th>الحالة</th></tr>
        ${r.rows.map(e => `<tr>
          <td>${esc(e.date)}</td><td>${esc(e.voucher || '—')}</td><td>${esc(e.category)}</td>
          <td><b class="neg">${money(e.amount)}</b></td>
          <td>${esc(e.description || '')}</td>
          <td>${e.settled ? '<span class="badge cool">اتورد</span>' : '<span class="badge warm">في عهدتك</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">لسه مصرفتش حاجة</td></tr>'}
      </table></div>
      <div class="modal-actions">
        <button class="btn outline" onclick="A.myCash()">رجوع للعهدة</button>
        <button class="btn outline" onclick="A.closeModal()">إغلاق</button>
      </div>`);
  } catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

A.expenseSave = async () => {
  const payload = {
    voucher: normDigits($('#exp-voucher').value).trim(),
    category: $('#exp-cat').value,
    amount: normDigits($('#exp-amount').value),
    description: $('#exp-desc').value.trim(),
    date: $('#exp-date').value || todayISO()
  };
  if (!payload.voucher) return toast('اكتب رقم سند الصرف', 'err');
  if (!(Number(payload.amount) > 0)) return toast('اكتب المبلغ', 'err');
  if (payload.description.length < 3) return toast('اكتب بيان المصروف', 'err');
  if (payload.date > todayISO()) return toast('مينفعش تاريخ في المستقبل', 'err');
  if (Number(payload.amount) > A._cash.cash.balance) return toast('المبلغ أكبر من العهدة اللي معاك', 'err');
  closeModal();
  try { const r = await api('saveExpense', payload); toast(r.message, 'ok'); A.myCash(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ==================== [ tracking.js ] ====================
/* CRM روافد — تتبع خط السير بالـ GPS */

// ================== تتبع خط السير ==================
/**
 * بيسجل نقطة كل بضع دقايق أو لما المندوب يتحرك مسافة كافية، والتطبيق مفتوح.
 * النقاط بتتخزن محليًا وبتترفع كل شوية — فلو النت قطع مفيش حاجة بتضيع.
 */
const TRK = {
  watchId: null, last: null, buf: JSON.parse(localStorage.getItem('crm_track_buf') || '[]'),
  wakeLock: null, timer: null, lastFlush: 0,
  denied: false,      // الإذن مرفوض صراحةً
  failCount: 0,       // محاولات فشلت ورا بعض (GPS مقفول مثلًا)
  checked: false      // اتفحص الإذن ولا لسه
};

/** التطبيق بيتقفل في وش المندوب لو اللوكيشن مش شغال */
function gpsBlocked() {
  return !!(S.user && S.user.role === 'rep' && (TRK.denied || TRK.failCount >= 3 || !navigator.geolocation));
}

function trackSettings() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return {
    enabled: String(s.TRACK_ENABLED || 'TRUE').toUpperCase() !== 'FALSE',
    minMin: Number(s.TRACK_MIN_MINUTES) || 3,
    minM: Number(s.TRACK_MIN_METERS) || 120
  };
}
/** التتبع إلزامي لكل المناديب — بيتقفل من إعدادات الأدمن بس */
function trackingOn() { return trackSettings().enabled; }

/**
 * بتتنادى في كل مرة يفتح فيها المندوب التطبيق أو يرجعله:
 * بتاخد نقطة فورًا وبتشغّل المتابعة المستمرة طول ما التطبيق مفتوح.
 */
async function ensureTracking(silent) {
  if (!S.user || S.user.role !== 'rep' || !S.token) return;
  if (!trackingOn()) { stopTracking(true); return; }
  if (!navigator.geolocation) return;

  // نقطة فورية أول ما يفتح التطبيق — دي اللي بتوصل المسار
  navigator.geolocation.getCurrentPosition(
    p => { TRK.denied = false; onTrackPoint(p, true); },
    err => handleTrackError(err),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
  );

  if (TRK.watchId === null) {
    TRK.watchId = navigator.geolocation.watchPosition(
      p => { TRK.denied = false; onTrackPoint(p); },
      err => handleTrackError(err),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 30000 }
    );
  }
  // منع الشاشة تنام عشان التتبع يفضل شغال والتطبيق مفتوح
  try { if ('wakeLock' in navigator && !TRK.wakeLock) TRK.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  if (!TRK.timer) TRK.timer = setInterval(flushTrack, 120000); // رفع كل دقيقتين
}

function handleTrackError(err) {
  TRK.checked = true;
  if (err && err.code === 1) {        // الإذن مرفوض
    TRK.denied = true;
    TRK.failCount = 99;
  } else {                            // الـ GPS مقفول أو مش لاقي إشارة
    TRK.failCount++;
  }
  render();
}

/** فحص إذن الموقع — بيتنادى أول ما المندوب يدخل ولما يضغط "افحص تاني" */
async function checkGpsPermission() {
  if (!S.user || S.user.role !== 'rep') return;
  if (!navigator.geolocation) { TRK.checked = true; render(); return; }
  // نتابع تغيير الإذن من إعدادات المتصفح لحظيًا
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      if (st.state === 'denied') { TRK.denied = true; TRK.failCount = 99; }
      else if (st.state === 'granted') { TRK.denied = false; TRK.failCount = 0; }
      if (!st._crmBound) {
        st._crmBound = true;
        st.onchange = () => {
          if (st.state === 'granted') { TRK.denied = false; TRK.failCount = 0; ensureTracking(true); }
          else if (st.state === 'denied') { TRK.denied = true; TRK.failCount = 99; }
          render();
        };
      }
    }
  } catch (e) {}
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      p => { TRK.denied = false; TRK.failCount = 0; TRK.checked = true; onTrackPoint(p, true); render(); resolve(true); },
      err => { handleTrackError(err); resolve(false); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  });
}

A.recheckGps = async () => {
  toast('⏳ بفحص إذن الموقع...');
  TRK.denied = false; TRK.failCount = 0;   // نبدأ من جديد
  const ok = await checkGpsPermission();
  if (ok) { toast('✅ تمام — اللوكيشن شغال', 'ok'); ensureTracking(true); }
  else toast('لسه مش شغال — اتبع الخطوات وجرب تاني', 'err');
};

function stopTracking(silent) {
  if (TRK.watchId !== null) { navigator.geolocation.clearWatch(TRK.watchId); TRK.watchId = null; }
  if (TRK.timer) { clearInterval(TRK.timer); TRK.timer = null; }
  if (TRK.wakeLock) { try { TRK.wakeLock.release(); } catch (e) {} TRK.wakeLock = null; }
  flushTrack();
}

/** force = نقطة إجبارية عند فتح التطبيق (عشان المسار يفضل متوصل) */
function onTrackPoint(pos, force) {
  const cfg = trackSettings();
  const lat = +pos.coords.latitude.toFixed(6), lng = +pos.coords.longitude.toFixed(6);
  const acc = Math.round(pos.coords.accuracy || 0);
  if (acc > 500) return; // دقة ضعيفة أوي
  const now = Date.now();
  S.myPos = { lat: lat, lng: lng, acc: acc };
  if (TRK.last && !force) {
    const mins = (now - TRK.last.t) / 60000;
    const dist = distMeters(TRK.last.lat, TRK.last.lng, lat, lng);
    if (mins < cfg.minMin && dist < cfg.minM) return;
    if (dist < 30 && mins < cfg.minMin * 4) return; // واقف مكانه
  }
  // نقطة الفتح: منسجلهاش لو لسه سجلنا واحدة من أقل من دقيقة
  if (force && TRK.last && (now - TRK.last.t) < 60000) return;
  TRK.last = { lat: lat, lng: lng, t: now };
  pushTrackPoint(lat, lng, acc, force ? 'فتح التطبيق' : 'auto');
}

function pushTrackPoint(lat, lng, acc, source) {
  const d = new Date();
  TRK.buf.push({
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5),
    lat: lat, lng: lng, acc: acc || 0, source: source || 'auto'
  });
  if (TRK.buf.length > 500) TRK.buf = TRK.buf.slice(-500);
  localStorage.setItem('crm_track_buf', JSON.stringify(TRK.buf));
  if (TRK.buf.length >= 5) flushTrack();
}

async function flushTrack() {
  if (!TRK.buf.length || !S.token || !navigator.onLine) return;
  if (Date.now() - TRK.lastFlush < 15000) return;
  TRK.lastFlush = Date.now();
  const batch = TRK.buf.slice(0, 120);
  try {
    await api('track', { points: batch });
    TRK.buf = TRK.buf.slice(batch.length);
    localStorage.setItem('crm_track_buf', JSON.stringify(TRK.buf));
  } catch (e) { /* هنحاول تاني بعدين */ }
}

// ==================== [ boot.js ] ====================
/* CRM روافد — نقطة التشغيل (لازم يتحمّل آخر واحد) */

// ================== التشغيل ==================
window.addEventListener('online', () => { document.body.classList.remove('is-offline'); qflush(); flushTrack(); });
window.addEventListener('offline', () => document.body.classList.add('is-offline'));
// لما التطبيق يرجع للواجهة تاني — نرجّع قفل الشاشة ونرفع اللي اتجمع
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { stopTracking(true); return; }
  if (gpsBlocked()) { checkGpsPermission(); return; }
  ensureTracking(true);   // نقطة جديدة كل ما يرجع للتطبيق — بيها بيتوصل المسار
  flushTrack();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

render();
if (S.token) {
  qflush();
  refresh(true).then(() => {
    if (S.user && S.user.role === 'rep') checkGpsPermission();
    ensureTracking(true);
  });
}

