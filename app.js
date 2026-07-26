/* CRM روافد — التطبيق الرئيسي (مندوب + أدمن) */
'use strict';

// ================== الحالة العامة ==================
const S = {
  token: localStorage.getItem('crm_token') || '',
  user: JSON.parse(localStorage.getItem('crm_user') || 'null'),
  creds: JSON.parse(localStorage.getItem('crm_creds') || 'null'),
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
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(n) { n = Number(n) || 0; return n.toLocaleString('ar-EG', { maximumFractionDigits: 0 }); }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

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
  if (res.error === 'AUTH' && S.creds && !(opts && opts.noRetry)) {
    const login = await api('login', S.creds, { noRetry: true });
    if (login.ok) {
      S.token = login.token; localStorage.setItem('crm_token', S.token);
      return api(action, payload, { noRetry: true });
    }
    doLogout(); throw { fatal: 'الجلسة انتهت' };
  }
  if (!res.ok) throw { msg: res.error || res.message || 'حصل خطأ' };
  return res;
}

function qpush(action, payload) {
  S.queue.push({ action, payload, ts: Date.now() });
  save('crm_queue', S.queue);
  render();
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
    const res = await api(action, {});
    S.data = res;
    save('crm_boot', res);
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
function openModal(html, onOpen) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)A.closeModal()"><div class="modal">' + html + '</div></div>';
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
  ['crm_token', 'crm_user', 'crm_creds', 'crm_boot', 'crm_live_visit'].forEach(k => localStorage.removeItem(k));
  S.token = ''; S.user = null; S.data = null; S.liveVisit = null;
  render();
}
A.logout = () => { if (confirm('متأكد إنك عاوز تسجل خروج؟')) doLogout(); };

A.login = async () => {
  const username = $('#login-user').value.trim();
  const pin = $('#login-pin').value.trim();
  if (!username || !pin) return toast('اكتب اسم المستخدم والرقم السري', 'err');
  const btn = $('#login-btn'); btn.disabled = true; btn.textContent = 'ثواني...';
  try {
    const res = await api('login', { username, pin }, { noRetry: true });
    S.token = res.token; S.user = res.user; S.creds = { username, pin };
    localStorage.setItem('crm_token', S.token);
    save('crm_user', S.user); save('crm_creds', S.creds);
    S.tab = 'today'; S.adminTab = 'dash';
    render();
    refresh();
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
  app.innerHTML = S.user.role === 'admin' ? viewAdmin() : viewRep();
}

function viewLogin() {
  return `<div class="login-wrap">
    <div class="logo-circle">ر</div>
    <div class="login-card">
      <h1>CRM روافد</h1>
      <p class="sub">نظام إدارة الزيارات والعملاء والتحصيلات</p>
      <label>اسم المستخدم</label>
      <input id="login-user" autocomplete="username" placeholder="مثال: ahmed">
      <label>الرقم السري</label>
      <input id="login-pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••" onkeydown="if(event.key==='Enter')A.login()">
      <button id="login-btn" class="btn full mt" onclick="A.login()">دخول</button>
    </div>
  </div>`;
}

function topbar(subtitle) {
  return `<div class="topbar">
    <div><div class="title">CRM روافد</div><div class="sub">${esc(subtitle)}</div></div>
    <div class="flex" style="flex:none">
      ${S.queue.length ? '<span class="pending-badge">⏳ ' + S.queue.length + ' معلقة</span>' : ''}
      <span class="offline-badge">أوفلاين</span>
      <button class="btn sm ghost" onclick="A.doRefresh()" ${S.loading ? 'disabled' : ''}>${S.loading ? '⏳' : '🔄'}</button>
    </div>
  </div>`;
}
A.doRefresh = () => { qflush(); refresh(); };

// ================== واجهة المندوب ==================
function viewRep() {
  const unread = ((S.data || {}).notifications || []).length;
  const tabs = [
    ['today', '📅', 'اليوم'], ['customers', '👥', 'العملاء'], ['leads', '🎯', 'الليدز'],
    ['notifs', '🔔', 'تنبيهات'], ['me', '👤', 'حسابي']
  ];
  let body = '';
  if (!S.data) body = '<div class="empty"><div class="big">⏳</div>بيحمل البيانات...<br><button class="btn mt" onclick="A.doRefresh()">حاول تاني</button></div>';
  else if (S.tab === 'today') body = viewToday();
  else if (S.tab === 'customers') body = viewCustomers();
  else if (S.tab === 'leads') body = viewLeads();
  else if (S.tab === 'notifs') body = viewNotifs();
  else if (S.tab === 'me') body = viewMe();

  return topbar(S.user.name) + '<div class="page">' + body + '</div>' +
    '<div class="bottomnav">' + tabs.map(t =>
      `<button class="${S.tab === t[0] ? 'active' : ''}" onclick="A.tab('${t[0]}')">
        <span class="ico">${t[1]}</span>${t[2]}
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
    ${Number(c.overdue) > 0 ? '<div class="mt"><span class="badge hot">💰 متأخرات ' + money(c.overdue) + ' ج</span></div>' : ''}
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
  const sorted = sortByPriorityAndDistance(list);
  html += `<div class="section-title"><span>خط سير ${dayLabel(dayIdx)} (${list.length} عميل)</span>
    <button class="btn sm ghost" onclick="A.sortNearMe()">📍 رتب بالأقرب ليا</button></div>`;
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
    render();
    toast('اترتبوا بالأقرب ليك ✅', 'ok');
  } catch (e) { toast(e.message, 'err'); }
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
    <label>الخطوة الجاية (اختياري)</label>
    <input id="v-next" placeholder="مثال: متابعة تحصيل الشيك">
    <label>تاريخها</label>
    <input id="v-next-date" type="date">
    <div class="modal-actions">
      <button class="btn green" onclick="A.checkoutSave()">حفظ وإنهاء ✔</button>
      <button class="btn outline" onclick="A.closeModal()">رجوع</button>
    </div>`);
};

A.checkoutSave = async () => {
  const lv = S.liveVisit;
  const c = custById(lv.customer_id);
  const form = {
    status: $('#v-status').value, outcome: $('#v-outcome').value,
    report: $('#v-report').value.trim(), next_action: $('#v-next').value.trim(), next_action_date: $('#v-next-date').value
  };
  const outTime = new Date().toTimeString().slice(0, 5);
  closeModal();
  try {
    if (lv.local || !lv.visit_id) throw { offline: true };
    await api('checkout', Object.assign({ visit_id: lv.visit_id }, form));
    toast('✅ الزيارة اتسجلت بنجاح', 'ok');
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
      <div class="stat-line"><span>الرصيد الحالي</span><b class="${Number(c.balance) > 0 ? 'neg' : 'pos'}">${money(c.balance)} ج</b></div>
      <div class="stat-line"><span>متأخرات مستحقة</span><b class="${Number(c.overdue) > 0 ? 'neg' : 'pos'}">${money(c.overdue)} ج</b></div>
      <div class="stat-line"><span>مبيعات آخر 90 يوم</span><b>${money(c.sales_90d)} ج</b></div>
      <div class="stat-line"><span>مرتجعات آخر 90 يوم</span><b>${money(c.returns_90d)} ج</b></div>
      <div class="stat-line"><span>آخر دفعة</span><b>${esc(c.last_payment_date || '—')}</b></div>
      <div class="stat-line"><span>آخر زيارة</span><b>${esc(c.last_visit_date || 'لم يُزر')}</b></div>
    </div>
    <div class="flex mt">
      <button class="btn sm green" onclick="A.closeModal();A.checkin('${c.id}')">✔ تسجيل وصول</button>
      <button class="btn sm amber" onclick="A.quickCall('${c.id}')">📞 زيارة هاتفية</button>
      <button class="btn sm ghost" onclick="A.pickLocForCustomer('${c.id}', false)">📍 ${c.lat ? 'عدّل' : 'حدد'} اللوكيشن</button>
    </div>
    <button class="btn sm outline mt" onclick="A.statement('${c.id}')">📄 كشف حساب كامل (PDF)</button>
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
      <div class="kpi"><div class="num">${money(k.collectedMonth)}</div><div class="lbl">تحصيل منطقتك الشهر (ج)</div>
        ${k.collectionTarget ? '<div class="bar"><i style="width:' + Math.min(100, k.collectedMonth / k.collectionTarget * 100) + '%"></i></div>' : ''}</div>
    </div>
    <div class="card">
      <h3>📲 بوت تليجرام</h3>
      <p class="muted">عشان توصلك خطة يومك كل صبح: افتح البوت وابعتله<br><b>/start ${esc(S.creds ? S.creds.username : '')}</b></p>
    </div>
    ${S.queue.length ? '<div class="card"><h3>⏳ عمليات مستنية النت (' + S.queue.length + ')</h3><button class="btn sm ghost" onclick="A.doRefresh()">حاول ترفعها دلوقتي</button></div>' : ''}
    <button class="btn red full mt" onclick="A.logout()">تسجيل خروج</button>
    <p class="muted mt" style="text-align:center">CRM روافد — آخر تحديث بيانات: ${esc((S.data.serverTime || ''))}</p>`;
}

// ================== واجهة الأدمن ==================
function viewAdmin() {
  const tabs = [
    ['dash', '📊 اللوحة'], ['customers', '👥 العملاء'], ['team', '🧑‍💼 المناديب والمناطق'],
    ['leads', '🎯 الليدز'], ['entries', '📒 القيود اليومية'], ['targets', '🏁 الأهداف'],
    ['reports', '📄 التقارير'], ['settings', '⚙️ الإعدادات']
  ];
  let body = '';
  if (!S.data) body = '<div class="empty"><div class="big">⏳</div>بيحمل البيانات...<br><button class="btn mt" onclick="A.doRefresh()">حاول تاني</button></div>';
  else body = {
    dash: adDash, customers: adCustomers, team: adTeam, leads: adLeads, entries: adEntries,
    targets: adTargets, reports: adReports, settings: adSettings
  }[S.adminTab]();
  return topbar('لوحة تحكم الأدمن') +
    '<div class="admin-tabs">' + tabs.map(t =>
      `<button class="${S.adminTab === t[0] ? 'active' : ''}" onclick="A.adminTab('${t[0]}')">${t[1]}</button>`).join('') + '</div>' +
    '<div class="page">' + body + '</div>';
}
A.adminTab = t => { S.adminTab = t; render(); window.scrollTo(0, 0); };

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
      <div class="kpi"><div class="num" style="color:var(--red)">${money(totalOverdue)}</div><div class="lbl">إجمالي المتأخرات (ج)</div></div>
      <div class="kpi"><div class="num" style="color:var(--green)">${money(collectedMonth)}</div><div class="lbl">تحصيلات الشهر (ج)</div></div>
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
        <td>${r.telegram_chat_id || '<span class="muted">غير متصل</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">ضيف مناديب من صفحة المناديب والمناطق</td></tr>'}
    </table></div>
    <div class="section-title"><span>💰 أعلى متأخرات</span></div>
    <div class="table-wrap"><table>
      <tr><th>العميل</th><th>المنطقة</th><th>المتأخر</th><th>آخر دفعة</th><th>آخر زيارة</th></tr>
      ${topOverdue.map(c => `<tr>
        <td><b>${esc(c.name)}</b></td><td>${esc(regionName(c.region_id))}</td>
        <td style="color:var(--red);font-weight:700">${money(c.overdue)} ج</td>
        <td>${esc(c.last_payment_date || '—')}</td><td>${esc(c.last_visit_date || '—')}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">مفيش متأخرات — أو المزامنة مع قيود لسه</td></tr>'}
    </table></div>
    <div class="section-title"><span>آخر الزيارات</span></div>
    <div class="table-wrap"><table>
      <tr><th>التاريخ</th><th>المندوب</th><th>العميل</th><th>الحالة</th><th>النتيجة</th><th>المدة</th></tr>
      ${visits.slice(-15).reverse().map(v => `<tr>
        <td>${esc(String(v.date).slice(0, 10))}</td><td>${esc(v.rep_name)}</td><td>${esc(v.customer_name)}</td>
        <td><span class="badge ${v.status === 'تمت' ? 'cool' : 'gray'}">${esc(v.status)}</span></td>
        <td>${esc(v.outcome || '—')}</td><td>${v.duration_min ? v.duration_min + ' د' : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">لسه مفيش زيارات</td></tr>'}
    </table></div>`;
}

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
    </div>
    <div class="flex mt">
      <input placeholder="🔍 دور باسم العميل" value="${esc(S.custFilter)}" oninput="A.custSearch(this.value)">
      <select onchange="A.custDayF(this.value)" style="max-width:200px">
        <option value="all">كل المناطق</option>
        ${regions.map(r => `<option value="${r.id}" ${String(S.custDay) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap mt"><table>
      <tr><th>العميل</th><th>المنطقة</th><th>اليوم</th><th>لوكيشن</th><th>الرصيد</th><th>المتأخر</th><th>الأولوية</th><th></th></tr>
      ${list.slice(0, 200).map(c => `<tr>
        <td><b>${esc(c.name)}</b><div class="muted" style="font-size:11.5px">${esc(c.phone || '')}</div></td>
        <td>${esc(regionName(c.region_id))}</td>
        <td>${dayLabel(c.visit_day)}</td>
        <td>${c.lat ? '✅' : '<span class="badge warm">ناقص</span>'}</td>
        <td>${money(c.balance)}</td>
        <td style="color:${Number(c.overdue) > 0 ? 'var(--red)' : 'inherit'}">${money(c.overdue)}</td>
        <td>${c.priority_score || 0}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" onclick="A.custForm('${c.id}')">تعديل</button>
          <button class="btn sm outline" onclick="A.statement('${c.id}')">📄</button></td>
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
      <div><label>كود قيود (اختياري)</label><input id="c-qoyod" value="${esc(c.qoyod_id || '')}"></div>
    </div>
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
  const vals = { name: $('#c-name').value, phone: $('#c-phone').value, address: $('#c-address').value, region: $('#c-region').value, day: $('#c-day').value, status: $('#c-status').value, qoyod: $('#c-qoyod').value };
  const cur = A._custLoc || {};
  openMapPicker(cur.lat, cur.lng, ll => {
    A.custForm(id || undefined);
    $('#c-name').value = vals.name; $('#c-phone').value = vals.phone; $('#c-address').value = vals.address;
    $('#c-region').value = vals.region; $('#c-day').value = vals.day; $('#c-status').value = vals.status; $('#c-qoyod').value = vals.qoyod;
    A._custLoc = ll;
    $('#c-loc-txt').textContent = ' ✅ اللوكيشن اتحدد';
  });
};
A.custSave = async (id) => {
  const data = {
    id: id || undefined, name: $('#c-name').value.trim(), phone: $('#c-phone').value.trim(),
    address: $('#c-address').value.trim(), region_id: $('#c-region').value, visit_day: $('#c-day').value,
    status: $('#c-status').value, qoyod_id: $('#c-qoyod').value.trim()
  };
  if (A._custLoc) { data.lat = A._custLoc.lat; data.lng = A._custLoc.lng; }
  if (!data.name) return toast('اكتب اسم العميل', 'err');
  closeModal();
  try { await api('saveCustomer', { data }); toast('✅ اتحفظ', 'ok'); refresh(true); }
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
        <td>${String(u.active) === 'FALSE' ? '<span class="badge gray">موقوف</span>' : '<span class="badge cool">نشط</span>'}</td>
        <td>${esc(u.telegram_chat_id || '—')}</td>
        <td><button class="btn sm ghost" onclick="A.userForm('${u.id}')">تعديل</button></td>
      </tr>`).join('')}
    </table></div>
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
    <div class="modal-actions">
      <button class="btn green" onclick="A.userSave('${id || ''}')">حفظ ✔</button>
      <button class="btn outline" onclick="A.closeModal()">إلغاء</button>
    </div>`);
};
A.userSave = async (id) => {
  const data = {
    id: id || undefined, name: $('#u-name').value.trim(), username: $('#u-username').value.trim(),
    pin: $('#u-pin').value.trim(), role: $('#u-role').value, region_id: $('#u-region').value,
    active: $('#u-active').checked
  };
  if (!data.name || !data.username) return toast('كمّل البيانات', 'err');
  closeModal();
  try { await api('saveUser', { data }); toast('✅ اتحفظ', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
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
    <button class="btn" onclick="A.leadForm()">➕ إضافة ليد</button>
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
        <div><label>المبلغ (ج) *</label><input id="e-amount" type="number" inputmode="decimal" min="0"></div>
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
        <td style="color:var(--red)">${e.type === 'مدين' ? money(e.amount) + ' ج' : '—'}</td>
        <td style="color:var(--green)">${e.type === 'دائن' ? money(e.amount) + ' ج' : '—'}</td>
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
A.statement = async (custId) => {
  toast('⏳ بجهز كشف الحساب...');
  try {
    const r = await api('getStatement', { customer_id: custId });
    let running = 0;
    const rows = r.tx.map(t => {
      running += t.debit - t.credit;
      return { date: t.date, desc: t.desc, debit: t.debit, credit: t.credit, balance: running };
    });
    const totalDebit = r.tx.reduce((s, t) => s + t.debit, 0);
    const totalCredit = r.tx.reduce((s, t) => s + t.credit, 0);
    const stmtHtml = `
      <div class="stmt">
        <div class="stmt-head">
          <div class="stmt-company">${esc(r.company)}</div>
          <div class="stmt-title">كشف حساب عميل</div>
          <div class="stmt-info">
            <span><b>العميل:</b> ${esc(r.customer.name)}</span>
            ${r.customer.phone ? '<span><b>التليفون:</b> ' + esc(r.customer.phone) + '</span>' : ''}
            ${r.customer.address ? '<span><b>العنوان:</b> ' + esc(r.customer.address) + '</span>' : ''}
            <span><b>تاريخ الإصدار:</b> ${new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
        <table class="stmt-table">
          <tr><th>التاريخ</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (له)</th><th>الرصيد</th></tr>
          ${rows.map(t => `<tr>
            <td>${esc(t.date)}</td><td>${esc(t.desc)}</td>
            <td>${t.debit ? money(t.debit) : '—'}</td>
            <td>${t.credit ? money(t.credit) : '—'}</td>
            <td>${money(t.balance)}</td>
          </tr>`).join('') || '<tr><td colspan="5">مفيش حركات مسجلة للعميل ده</td></tr>'}
          <tr class="stmt-total">
            <td colspan="2">الإجمالي</td>
            <td>${money(totalDebit)}</td>
            <td>${money(totalCredit)}</td>
            <td>${money(totalDebit - totalCredit)} ج</td>
          </tr>
        </table>
        <div class="stmt-final">الرصيد المستحق: <b>${money(totalDebit - totalCredit)} جنيه</b> ${totalDebit - totalCredit > 0 ? '(مطلوب من العميل)' : totalDebit - totalCredit < 0 ? '(للعميل)' : ''}</div>
        <div class="stmt-footer">اتطبع من نظام CRM — ${esc(r.company)}</div>
      </div>`;
    openModal(`
      <h2>📄 كشف حساب: ${esc(r.customer.name)}</h2>
      <div style="max-height:50vh;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:8px">${stmtHtml}</div>
      <div class="modal-actions">
        <button class="btn" onclick="A.printStatement()">🖨️ حفظ PDF / طباعة</button>
        <button class="btn outline" onclick="A.closeModal()">إغلاق</button>
      </div>`);
    document.getElementById('print-area').innerHTML = stmtHtml;
  } catch (e) { toast(e.msg || (e.offline ? 'كشف الحساب محتاج نت' : 'خطأ'), 'err'); }
};
A.printStatement = () => { window.print(); };

// ----- الأهداف -----
function adTargets() {
  const reps = (S.data.users || []).filter(u => u.role === 'rep');
  const month = new Date().toISOString().slice(0, 7);
  const targets = S.data.targets || [];
  return `
    <p class="muted">حدد تارجت الزيارات والتحصيل لكل مندوب — بيظهر للمندوب في حسابه وبيتحسب في اللوحة.</p>
    <div class="table-wrap mt"><table>
      <tr><th>المندوب</th><th>شهر</th><th>تارجت زيارات</th><th>تارجت تحصيل (ج)</th><th></th></tr>
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
  const csv = '﻿' + heads.join(',') + '\n' + rows.map(r =>
    heads.map(h => '"' + String(r[h] == null ? '' : r[h]).replace(/"/g, '""').replace(/\n/g, ' ') + '"').join(',')).join('\n');
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
      <p class="muted mt">المزامنة بتشتغل لوحدها كل ساعة: فواتير + مرتجعات + تحصيلات، وبتحدث أرصدة العملاء وأولوياتهم.</p>
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
      <h3>⚙️ قواعد الشغل</h3>
      <div class="grid2">
        <div><label>نطاق تأكيد الوصول (متر)</label><input id="s-geo" type="number" value="${esc(s.GEOFENCE_METERS || 150)}"></div>
        <div><label>العميل يحتاج زيارة بعد (يوم)</label><input id="s-gap" type="number" value="${esc(s.VISIT_GAP_DAYS || 14)}"></div>
      </div>
      <div class="grid2">
        <div><label>أقل متأخر يطلع له تنبيه (ج)</label><input id="s-overdue" type="number" value="${esc(s.OVERDUE_ALERT_MIN || 500)}"></div>
        <div><label>اسم الشركة</label><input id="s-company" value="${esc(s.COMPANY_NAME || '')}"></div>
      </div>
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
    OVERDUE_ALERT_MIN: $('#s-overdue').value, COMPANY_NAME: $('#s-company').value.trim()
  };
  try { await api('saveSettings', { data }); toast('✅ الإعدادات اتحفظت', 'ok'); refresh(true); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
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
A.testTg = async () => {
  try { const r = await api('testTelegram', {}); toast(r.message, 'ok'); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
};

// ================== التشغيل ==================
window.addEventListener('online', () => { document.body.classList.remove('is-offline'); qflush(); });
window.addEventListener('offline', () => document.body.classList.add('is-offline'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

render();
if (S.token) { qflush(); refresh(true); }
