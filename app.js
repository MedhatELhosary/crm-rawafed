'use strict';
/* =====================================================================
   CRM روافد — ملف التطبيق (متولّد تلقائيًا — متعدلش فيه)
   عدّل في app/src/*.js وبعدين شغّل build.ps1
   ===================================================================== */

// ==================== [ core.js ] ====================
/* CRM روافد — النواة: الحالة، الاتصال بالسيرفر، أدوات الواجهة، الدخول، والعرض الرئيسي */

/* CRM روافد — التطبيق الرئيسي (مندوب + أدمن) */

// ================== التخزين المحلي الآمن ==================
/**
 * قراءة قيمة محفوظة من غير ما ترمي خطأ أبدًا.
 *
 * مهم جدًا: القراءات دي بتحصل وقت تحميل الملف نفسه. لو أي قيمة اتخربت
 * (مساحة الجهاز خلصت وسط الكتابة، أو المتصفح مسح جزء من البيانات)،
 * JSON.parse كان بيرمي خطأ فالملف كله ميتنفذش والتطبيق يفضل شاشة بيضا
 * — ومحصلش يفتح تاني أبدًا لأن نفس القيمة بتتقرا كل مرة.
 */
function readLS(key, fallback) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { return fallback; }
  if (raw === null || raw === undefined || raw === '') return fallback;
  try { return JSON.parse(raw); }
  catch (e) {
    try { localStorage.removeItem(key); } catch (e2) {}   // قيمة خربانة — نشيلها ونكمل
    return fallback;
  }
}
function readStr(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }

/** بيانات ممكن نجيبها تاني من السيرفر — دي أول حاجة نضحي بيها لو المساحة خلصت */
const LS_DISPOSABLE = ['crm_boot', 'crm_products', 'crm_products_v', 'crm_logo', 'crm_logo_hash'];

/**
 * كتابة آمنة: لو المساحة خلصت بنفضّي البيانات اللي ليها بديل على السيرفر
 * ونحاول تاني، وبنرجّع false لو برضه مافيش مكان (بدل ما نفشل في صمت).
 */
function writeLS(key, str) {
  try { localStorage.setItem(key, str); return true; }
  catch (e) {
    let freed = false;
    LS_DISPOSABLE.forEach(k => {
      if (k === key) return;
      try { if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); freed = true; } } catch (e2) {}
    });
    if (freed) { try { localStorage.setItem(key, str); return true; } catch (e3) {} }
    return false;
  }
}

// ================== الحالة العامة ==================
const S = {
  token: readStr('crm_token'),
  user: readLS('crm_user', null),
  device: readStr('crm_device'),
  data: readLS('crm_boot', null),
  queue: readLS('crm_queue', []),
  failed: readLS('crm_failed', []),
  liveVisit: readLS('crm_live_visit', null),
  tab: 'today', adminTab: 'dash',
  custFilter: '', custDay: 'all', leadStage: 'all',
  myPos: null, loading: false
};
const A = {}; // مسجل الأحداث للأزرار
window.A = A;

/* حدود الأولوية — لازم تفضل زي اللي في backend/Planner.gs بالظبط.
   قبل كده كانت الشارة في التطبيق بحدود وكلام مختلفين عن السيرفر،
   فالمندوب كان بيشوف "متوسط" والسيرفر حاسبها حاجة تانية. */
const PRIO_URGENT = 60;
const PRIO_IMPORTANT = 40;
const PRIO_NORMAL = 22;
function priorityLabel(score) {
  if (score >= PRIO_URGENT) return 'لازم النهارده';
  if (score >= PRIO_IMPORTANT) return 'مهم';
  if (score >= PRIO_NORMAL) return 'عادي';
  return 'مش مستعجل';
}
const DAY_NAMES = ['الجمعة', 'السبت', 'الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس'];
const LEAD_STAGES = ['جديد', 'تم التواصل', 'مهتم', 'اتحول لعميل', 'مش مهتم'];

/** بيدور على عميل بالـ id — مشترك بين شاشات المندوب والأدمن */
function custById(id) { return (S.data.customers || []).find(c => String(c.id) === String(id)); }

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
  return s.CURRENCY || readStr('crm_currency') || 'ر.س';
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
function logoSrc() { return readStr('crm_logo'); }
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
    const r = await api('getLogo', {}, { quiet: true });
    if (r.logo) {
      writeLS('crm_logo', r.logo);
      writeLS('crm_logo_hash', r.hash || hash);
      render();
    }
  } catch (e) { /* هنجيبه المرة الجاية */ }
}
function companyName() {
  const s = (S.data && (S.data.settings || S.data.allSettings)) || {};
  return s.COMPANY_NAME || readStr('crm_company') || 'CRM روافد';
}
/** بيرسم اللوجو لو مترفع، وإلا بيرجع دايرة فيها أول حرف من اسم الشركة */
function logoHtml(size, cls) {
  const src = logoSrc();
  if (src) return `<img class="logo-img ${cls || ''}" style="width:${size}px;height:${size}px" src="${src}" alt="">`;
  return `<div class="logo-circle ${cls || ''}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px;border-radius:${Math.round(size * 0.3)}px">${esc(companyName()[0] || 'ر')}</div>`;
}
function save(key, val) { return writeLS(key, JSON.stringify(val)); }
/** وصف مختصر للجهاز — بيظهر للأدمن في قايمة الأجهزة المسجلة */
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'أندرويد' : /iPhone|iPad|iPod/i.test(ua) ? 'آيفون' :
             /Windows/i.test(ua) ? 'ويندوز' : /Mac/i.test(ua) ? 'ماك' : 'جهاز';
  const br = /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : '';
  return (os + (br ? ' — ' + br : '')).slice(0, 60);
}

// ================== الاتصال بالسيرفر ==================
/**
 * ============================================================
 *  طبقة التحميل
 * ============================================================
 * بتشتغل مع كل نداء للسيرفر أوتوماتيك — مش محتاجة تتحط على كل زرار.
 * ثلاث قواعد مهمة:
 *  1) بتقفل الضغط من أول لحظة (وهي لسه شفافة)، عشان الدوسة التانية
 *     على نفس الزرار متعديش. ده الهدف الأساسي منها.
 *  2) الرمادي بيظهر بعد 220ms بس — الطلب السريع ميعملش وميض مزعج.
 *  3) عداد مش true/false — عشان طلبين مع بعض ميقفلوش الطبقة على بعض،
 *     وحارس وقت بيفتحها غصب لو طلب علّق، عشان التطبيق ميتقفلش أبدًا.
 */
var BUSY_MAX = 25000;           // أقصى وقت يفضل فيه الزرار مقفول مهما حصل

/**
 * الزرار اللي المستخدم دوس عليه دلوقتي.
 *
 * بنمسكه في مرحلة الالتقاط (capture) عشان يوصلنا قبل ما الـ onclick
 * يشتغل — وبكده أول نداء سيرفر جوه الأمر ده يعرف زراره من غير ما
 * نعدّل مية نداء في التطبيق.
 */
var _clickedBtn = null;
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('button, .btn') : null;
    _clickedBtn = (b && !b.disabled) ? b : null;
  }, true);
}

var _busyCount = 0, _busyStack = [];

function btnBusyOn(btn, label) {
  if (!btn || btn.dataset.busy === '1') return;
  btn.dataset.busy = '1';
  btn.dataset.busyLabel = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('is-loading');
  if (label) btn.textContent = label;
  // شبكة أمان: لو النداء علّق ومرجعش أبدًا، الزرار مايفضلش مقفول للأبد
  btn._busyTimer = setTimeout(() => btnBusyOff(btn), BUSY_MAX);
}

function btnBusyOff(btn) {
  if (!btn || btn.dataset.busy !== '1') return;
  clearTimeout(btn._busyTimer);
  btn.disabled = false;
  btn.classList.remove('is-loading');
  if (btn.dataset.busyLabel !== undefined) btn.innerHTML = btn.dataset.busyLabel;
  delete btn.dataset.busy;
  delete btn.dataset.busyLabel;
}

/**
 * قفل الضغط المتكرر.
 *
 * كان طبقة رمادية بتغطي الشاشة كلها. المشكلة إنها بتحوّل أي نداء بطيء
 * لشاشة متجمدة — المستخدم مش عارف لو التطبيق شغال ولا وقع، ومش قادر
 * يعمل أي حاجة تانية. دلوقتي الزرار اللي اتداس عليه بس هو اللي بيتقفل،
 * وبيفتح تاني لما الأمر يخلص أو لما الشاشة تتبدّل (render بيعيد بناء
 * الأزرار من الأساس).
 */
function busyOn(label) {
  _busyCount++;
  const btn = _clickedBtn;
  _clickedBtn = null;                 // كل نداء بياخد الزرار مرة واحدة بس
  _busyStack.push(btn || null);
  if (btn) btnBusyOn(btn, label);
}

function busyOff() {
  if (_busyCount > 0) _busyCount--;
  const btn = _busyStack.pop();
  if (btn) btnBusyOff(btn);
}

/** بيفتح كل الأزرار المقفولة — بيتنادى بعد إعادة الرسم */
function busyHide() {
  _busyCount = 0;
  _busyStack = [];
  if (typeof document === 'undefined') return;
  const list = document.querySelectorAll('[data-busy="1"]');
  for (let i = 0; i < list.length; i++) btnBusyOff(list[i]);
}

/** للعمليات اللي مش نداء سيرفر (زي رسم صورة السند) */
async function withBusy(label, fn) {
  busyOn(label);
  try { return await fn(); } finally { busyOff(); }
}

/**
 * رسالة مفهومة من رد السيرفر لما ميكونش JSON.
 *
 * ده كان أخطر عيب تشخيصي في التطبيق: أي رد مش JSON — صفحة خطأ من
 * جوجل، وقت التنفيذ خلص، الحصة اليومية اتسدّت، النشر محتاج تصريح —
 * كله كان بيتقال عنه "مفيش نت". فالمستخدم بيبص على الموبايل ويلاقي
 * النت شغال، وإحنا مش عارفين حصل إيه.
 */
function serverErrText(status, body) {
  const t = String(body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/Exceeded maximum execution time/i.test(t)) return 'السيرفر وقف عند الحد الأقصى لوقت التنفيذ — العملية تقيلة';
  if (/(Service invoked too many times|quota|Too many|limit)/i.test(t)) return 'السيرفر وصل لحد الاستخدام اليومي — بيرجع لوحده بعد منتصف الليل';
  if (/(Authorization is required|Sign in|Google Account|permission)/i.test(t)) return 'النشر محتاج تصريح من تاني — افتح Apps Script واعمل Deploy جديد';
  if (/(Script function not found|not found)/i.test(t) || status === 404) return 'لينك السيرفر غلط أو النشر اتشال (404)';
  if (status === 403) return 'النشر مش مسموح للجميع — غيّر Who has access لـ Anyone';
  if (status >= 500) return 'السيرفر رد بخطأ ' + status;
  return 'السيرفر رد برد غير متوقع (' + status + ')' + (t ? ': ' + t.slice(0, 140) : '');
}

/** آخر وقت تنفيذ على السيرفر (بالملي ثانية) — بيقوله السيرفر نفسه */
var LAST_SERVER_MS = 0;

/** آخر خطأ سيرفر — بيتعرض في شاشة الفحص عشان نعرف المشكلة بالظبط */
var LAST_ERR = null;
function noteErr(kind, detail, ms) {
  LAST_ERR = { kind: kind, detail: String(detail || '').slice(0, 300),
               ms: ms, at: new Date().toLocaleString('ar-EG') };
  try { localStorage.setItem('crm_last_err', JSON.stringify(LAST_ERR)); } catch (e) {}
}

/** مهلة النداء — بعدها بنعتبره فشل ونحط العملية في الطابور */
var API_TIMEOUT = 40000;
var SLOW_ACTIONS = {
  backupNow: 1, archiveNow: 1, syncProducts: 1, runQoyodSync: 1, pushPending: 1,
  bulkImport: 1, finishImport: 1, importQoyodCustomers: 1, recomputeInvoiceDetails: 1,
  backfillInvoiceDetails: 1, resetTestData: 1, resetPreview: 1, dedupeDocs: 1,
  purgePhantoms: 1, runPlanner: 1, fixVisitIssues: 1, pushExpenseJournal: 1,
  bankMatch: 1, sendMonthSummaryNow: 1, sendRepReportsNow: 1, sendDailySummary: 1
};

async function api(action, payload, opts) {
  if (!API_URL || API_URL.indexOf('http') !== 0) throw { fatal: 'لسه محددتش لينك السيرفر في ملف config.js' };
  // quiet = نداء في الخلفية (تتبع، فحص حالة، تحديث صامت) — ميقفلش الشاشة
  const quiet = !!(opts && opts.quiet);
  if (!quiet) busyOn(opts && opts.label);
  // الـ finally لافّ الدالة كلها مش الـ fetch بس: كده لو الجلسة انتهت
  // وحصل تجديد وإعادة محاولة، الطبقة تفضل مقفولة لحد ما كله يخلص —
  // بدل ما تتفتح وتتقفل تاني قدام المستخدم.
  try {
    let res;
    const t0 = Date.now();
    let resp = null, text = '';
    try {
      const ms = (opts && opts.timeout) || (SLOW_ACTIONS[action] ? 180000 : API_TIMEOUT);
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
      try {
        resp = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify(Object.assign({ action, token: S.token }, payload || {})),
          signal: ctrl ? ctrl.signal : undefined
        });
        text = await resp.text();
      } finally { if (timer) clearTimeout(timer); }
    } catch (e) {
      // ده الفشل الحقيقي الوحيد اللي يستاهل اسم "مفيش نت":
      // المتصفح مقدرش يوصل للسيرفر خالص، أو المهلة خلصت
      const cut = e && e.name === 'AbortError';
      noteErr(cut ? 'مهلة' : 'شبكة', action + ' — ' + (cut ? 'عدّى المهلة' : (e && e.message) || ''), Date.now() - t0);
      throw { offline: true, timeout: cut };
    }
    // وصلنا للسيرفر فعلًا — أي مشكلة من هنا مش مشكلة نت
    try { res = JSON.parse(text); }
    catch (e) {
      const m = serverErrText(resp.status, text);
      noteErr('السيرفر', action + ' — ' + m, Date.now() - t0);
      // offline كمان عشان العملية تدخل الطابور بدل ما تضيع: إحنا مش
      // عارفين لو السيرفر نفّذها ولا لأ، ومفتاح العملية هو اللي بيمنع
      // التكرار لما تتعاد
      throw { offline: true, server: true, status: resp.status, msg: m };
    }
    if (res && res.ms) LAST_SERVER_MS = res.ms;
    // الجلسة انتهت — نجددها بتوكن الجهاز (مش بالرقم السري)، ولو فشل نرجّعه لشاشة الدخول
    //
    // مهم جدًا: الطرد بيحصل **بس** لما التجديد نفسه يترفض. قبل كده
    // النداء المعاد كان جوه نفس الـ try، فأي فشل فيه — السيرفر مشغول،
    // انقطاع شبكة لحظة، حتى رفض منطقي عادي — كان بيقع في الـ catch
    // ويتنفّذ doLogout(). ودي كانت سبب إن المندوب بيلاقي نفسه مطرود
    // فجأة في نص اليوم ولازم يكتب اسمه ورقمه السري من الأول.
    if (res.error === 'AUTH' && !(opts && opts.noRetry)) {
      let renewed = false;
      if (S.device) {
        try {
          const r = await api('renew', { device: S.device }, { noRetry: true, quiet: true });
          S.token = r.token;
          S.user = r.user;
          writeLS('crm_token', S.token);
          save('crm_user', S.user);
          renewed = true;
        } catch (e) {
          // عطل شبكة مش رفض — الجلسة ممكن تكون لسه سليمة تمامًا،
          // فمنطردش المندوب على عطل مؤقت
          if (e.offline) throw { offline: true, busy: !!e.busy };
        }
      }
      // خارج الـ try عن قصد: فشل النداء ده يطلع للمستخدم زي أي خطأ
      // عادي (والحمولة تدخل الطابور لو كانت عملية كتابة)
      if (renewed) return await api(action, payload, Object.assign({}, opts || {}, { noRetry: true }));
      doLogout();
      toast('انتهت الجلسة — سجل دخول تاني', 'err');
      throw { fatal: 'انتهت الجلسة، سجل دخول تاني' };
    }
    // السيرفر مشغول بالمزامنة — نعيد المحاولة بهدوء بدل ما نزعج المندوب
    // بخطأ مش ذنبه. المزامنة بتاخد ثواني معدودة فمحاولتين كفاية.
    if (res.busy) {
      const tries = (opts && opts.busyTry) || 0;
      if (tries < 1 && !(opts && opts.noBusyRetry)) {
        await new Promise(r => setTimeout(r, 1200));
        return await api(action, payload, Object.assign({}, opts, {
          busyTry: tries + 1, quiet: true
        }));
      }
      // السيرفر رجّع busy قبل ما ينفّذ أي حاجة — يعني العملية متنفذتش
      // بالتأكيد. ده بالظبط نفس وضع "مفيش نت"، فنرميها كده عشان
      // العملية تدخل الطابور وتتعاد لوحدها، بدل ما المندوب يقف قدام
      // شاشة مقفولة دقيقة كاملة وبعدين يشوف "حصل خطأ" ويفقد شغله.
      // ومفتاح العملية هو اللي بيضمن إنها متتسجلش مرتين.
      // msg موجودة عشان الشاشات اللي مش بتفحص offline (شاشات الأدمن مثلًا)
      // تعرض السبب الحقيقي بدل كلمة "خطأ"
      throw { offline: true, busy: true, msg: res.error || 'السيرفر مشغول — جرب تاني بعد شوية' };
    }
    if (!res.ok) throw { msg: res.error || res.message || 'حصل خطأ' };
    return res;
  } finally {
    // في finally عشان يقفل مهما حصل: نجاح، خطأ، أوفلاين، أو انتهاء جلسة
    if (!quiet) busyOff();
  }
}

/**
 * بيحط العملية في طابور الأوفلاين. بيرجّع false لو مساحة الجهاز خلصت —
 * السندات بقت جواها صورة، فلازم المندوب يعرف إن الحفظ فشل مش يفتكره اتحفظ.
 */
/**
 * ============================================================
 *  مخزن الصور على الجهاز (IndexedDB)
 * ============================================================
 * الصور (سند القبض وصور الزيارة) كانت بتتحفظ جوه الطابور في
 * localStorage. سقف localStorage حوالي 5 ميجا، والصورة الواحدة ممكن
 * توصل 4 — يعني سند أو اتنين وتمتلي، وساعتها writeLS بتمسح بيانات
 * التطبيق عشان تفضي مكان، فالمندوب يرجع يلاقي قايمة عملاء فاضية
 * ومفيش نت يملّيها.
 *
 * دلوقتي: بيانات الطابور (صغيرة) تفضل في localStorage عشان تتقري
 * فورًا وقت الإقلاع، والصور في IndexedDB — مساحتها مئات الميجا.
 */
var IDB_NAME = 'crm_rawafed', IDB_STORE = 'blobs', _idb = null;

function idbOpen() {
  if (_idb) return _idb;
  _idb = new Promise((resolve, reject) => {
    if (!self.indexedDB) return reject(new Error('IndexedDB مش متاحة'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _idb = null; reject(req.error || new Error('مش قادر أفتح المخزن')); };
  });
  return _idb;
}

function idbRun(mode, fn) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, mode);
    const req = fn(tx.objectStore(IDB_STORE));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('اتلغت'));
    if (req) { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }
    else tx.oncomplete = () => resolve(true);
  }));
}

function blobPut(key, val) {
  return idbRun('readwrite', st => st.put(val, key)).then(() => true).catch(() => false);
}
function blobGet(key) {
  return idbRun('readonly', st => st.get(key)).catch(() => null);
}
function blobDel(key) {
  return idbRun('readwrite', st => st.delete(key)).then(() => true).catch(() => false);
}
function blobKeys() {
  return idbRun('readonly', st => st.getAllKeys()).catch(() => []);
}

/** الحقول اللي ممكن تكون صور — بتتشال من الطابور وتتحفظ لوحدها */
var BLOB_FIELDS = ['receipt', 'photos', 'data', 'signature'];

/** بيشيل الصور من الحمولة ويرجّعها لوحدها (أو null لو مفيش) */
function takeBlobs(body) {
  const out = {};
  let found = false;
  BLOB_FIELDS.forEach(f => {
    const v = body[f];
    if (v === undefined || v === null || v === '' ) return;
    if (Array.isArray(v) && !v.length) return;
    out[f] = v;
    delete body[f];
    found = true;
  });
  return found ? out : null;
}

/**
 * بيطلب من المتصفح يثبّت التخزين. من غير ده أندرويد ممكن يمسح تخزين
 * التطبيق تحت الضغط — ومعاه الشغل اللي لسه مترفعش.
 */
function askPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(already => {
        if (!already) navigator.storage.persist();
      }).catch(() => {});
    }
  } catch (e) {}
}

/** بيمسح صور عمليات خلصت أو اتشالت — بيتشغل وقت فراغ بعد الإقلاع */
async function cleanOrphanBlobs() {
  try {
    const keys = await blobKeys();
    if (!keys || !keys.length) return;
    const alive = {};
    S.queue.forEach(it => { if (it.payload && it.payload.op_id) alive[it.payload.op_id] = 1; });
    (S.failed || []).forEach(it => { if (it.payload && it.payload.op_id) alive[it.payload.op_id] = 1; });
    for (const k of keys) { if (!alive[k]) await blobDel(k); }
  } catch (e) {}
}

/**
 * سقف بيانات الطابور (من غير الصور — دي في IndexedDB).
 *
 * كان بيقارن str.length برقم بايتات، و str.length بيعدّ وحدات UTF-16
 * يعني بايتين للحرف — فالسقف الحقيقي كان ضعف المكتوب، وعمره ما كان
 * بيشتغل قبل ما مساحة المتصفح تخلص. دلوقتي بنقيس بالبايت فعلًا.
 */
const QUEUE_MAX_BYTES = 1500000;   // ~1.5 ميجا بيانات — آلاف العمليات
function bytesOf(str) { return str.length * 2; }

/** مفتاح فريد لكل عملية — بيمنع تسجيلها مرتين لو الرد ضاع واتبعتت تاني */
function opId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
}

/**
 * بيحط عملية في الطابور. بترجّع false لو مااتحفظتش — واللي بينده
 * **لازم** يتحقق من النتيجة ومايقولش للمندوب إنها اتحفظت.
 *
 * الصور بتتحفظ الأول في المخزن المنفصل، وبعدين البيانات. الترتيب ده
 * مقصود: لو الصورة فشلت مبنسجلش العملية أصلًا، بدل ما نسجّل عملية
 * بتشاور على صورة مش موجودة.
 */
async function qpush(action, payload) {
  const body = Object.assign({}, payload || {});
  if (!body.op_id) body.op_id = opId();

  const blobs = takeBlobs(body);
  if (blobs) {
    const saved = await blobPut(body.op_id, blobs);
    if (!saved) {
      toast('📵 مش قادر أحفظ الصور على الجهاز — مااتحفظش', 'err');
      return false;
    }
    body._blobs = true;
  }

  S.queue.push({ action, payload: body, ts: Date.now() });
  const str = JSON.stringify(S.queue);
  if (bytesOf(str) > QUEUE_MAX_BYTES) {
    S.queue.pop();
    if (blobs) await blobDel(body.op_id);
    toast('📵 المحفوظ محليًا وصل للحد الأقصى — لازم تتصل بالنت عشان يترفع الأول', 'err');
    return false;
  }
  if (!writeLS('crm_queue', str)) {
    S.queue.pop();
    if (blobs) await blobDel(body.op_id);
    toast('📵 مساحة الجهاز خلصت — مااتحفظش. اتصل بالنت وحاول تاني', 'err');
    return false;
  }
  render();
  return true;
}

// قفل: qflush بيتنادى من 4 أماكن (رجوع النت، إنهاء زيارة، فتح التطبيق، زرار التحديث).
// من غير القفل ده ممكن اتنين يشتغلوا مع بعض ويبعتوا نفس الطابور مرتين.
let _flushing = false;

/** أقصى عدد عمليات نبعتها في المرة — لازم يساوي أو يقل عن حد السيرفر */
const FLUSH_BATCH = 10;
/** أقصى محاولات للعملية الواحدة قبل ما تتنقل لقايمة "محتاجة تدخّل" */
const MAX_TRIES = 6;

/** اسم العملية بالعربي — بيظهر في قايمة اللي اترفض */
function actionLabel(a) {
  return {
    quickVisit: 'زيارة', saveCollection: 'سند قبض', saveOrder: 'طلب',
    addLead: 'ليد جديد', updateLead: 'تعديل ليد', setCustomerLocation: 'لوكيشن عميل'
  }[a] || a;
}

/** رجّع المرفوضة للطابور — بعد ما الأدمن يصلّح السبب مثلًا */
A.retryFailed = () => {
  if (!(S.failed || []).length) return;
  S.queue = S.queue.concat(S.failed.map(f => ({ action: f.action, payload: f.payload, ts: f.ts })));
  S.failed = [];
  save('crm_queue', S.queue);
  save('crm_failed', S.failed);
  render();
  qflush();
};

A.clearFailed = async () => {
  if (!confirm('متأكد؟ العمليات دي هتتشال من القايمة ومش هتترفع.')) return;
  for (const f of (S.failed || [])) {
    if (f.payload && f.payload._blobs) await blobDel(f.payload.op_id);
  }
  S.failed = [];
  save('crm_failed', S.failed);
  render();
};

/**
 * إعادة المحاولة التلقائية.
 *
 * قبل كده الطابور كان بيترفع في 4 حالات بس (رجوع النت، إنهاء زيارة،
 * فتح التطبيق، زرار التحديث) — ومن غير أي مؤقت. و navigator.onLine على
 * أندرويد بيقول إن فيه شبكة وهي مش شغالة فعلًا، فمندوب خرج من نفق من
 * غير ما يتطلق حدث "online" كان ممكن يفضل بالطابور كله لآخر اليوم.
 *
 * دلوقتي فيه مؤقت بتدرّج: كل ما محاولة تفشل، المدة تزيد — عشان
 * مانستهلكش بطارية ولا شبكة على الفاضي.
 */
var _retryTimer = null, _retryStep = 0;
var RETRY_STEPS = [15000, 30000, 60000, 120000, 300000];

/**
 * رفع مطلوب من حدث تلقائي (رجوع النت، رجوع المندوب للتطبيق).
 *
 * قبل كده الاتنين دول كانوا بينادوا qflush على طول **ويصفّروا التدرّج**.
 * يعني مندوب عنده طابور واقف وبيفتح ويقفل التطبيق كان بيضرب السيرفر
 * كل 15 ثانية بلا نهاية — وكل ضربة بتمسك القفل العام، فباقي المناديب
 * بيقفوا. التدرّج كان موجود بس عمره ما وصل لآخره.
 */
var _lastFlushAt = 0;
var MIN_FLUSH_GAP = 20000;
function qflushAuto() {
  if (Date.now() - _lastFlushAt < MIN_FLUSH_GAP) return Promise.resolve();
  return qflush();
}

function scheduleFlush(reset) {
  if (reset) _retryStep = 0;
  clearTimeout(_retryTimer);
  if (!S.queue.length) { _retryStep = 0; return; }
  const wait = RETRY_STEPS[Math.min(_retryStep, RETRY_STEPS.length - 1)];
  _retryTimer = setTimeout(() => {
    _retryStep++;
    qflush().then(() => scheduleFlush(false));
  }, wait);
}

/**
 * رفع الطابور.
 *
 * القاعدة: **مبنمسحش غير اللي السيرفر أكّد إنه وصل**. قبل كده كنا بنمسح
 * الدفعة كلها لمجرد إن الطلب رجع، والسيرفر كان بيرجّع ok:true دايمًا —
 * فعملية مرفوضة كانت بتختفي والمندوب يشوف رسالة نجاح.
 *
 * واللي بيترفض رفض منطقي (مش عطل شبكة) بينتقل لقايمة "محتاجة تدخّل"
 * بدل ما يفضل يتعاد للأبد ويعطّل اللي وراه.
 */
async function qflush() {
  if (_flushing || !S.queue.length || !navigator.onLine) return;
  _flushing = true;
  _lastFlushAt = Date.now();
  try {
    const batch = S.queue.slice(0, FLUSH_BATCH);
    // الصور متخزنة لوحدها — بنرجّعها للحمولة وقت الإرسال بس
    const toSend = [];
    for (const it of batch) {
      if (!it.payload || !it.payload._blobs) { toSend.push(it); continue; }
      const blobs = await blobGet(it.payload.op_id);
      const body = Object.assign({}, it.payload, blobs || {});
      delete body._blobs;
      toSend.push({ action: it.action, payload: body, ts: it.ts });
    }
    const res = await api('syncOffline', { queue: toSend }, { quiet: true });
    const byId = {};
    (res.results || []).forEach(r => { if (r.op_id) byId[r.op_id] = r; });

    const stillQueued = [];
    const rejected = [];
    batch.forEach(item => {
      const r = byId[(item.payload && item.payload.op_id) || ''];
      if (!r) { stillQueued.push(item); return; }       // السيرفر ماردش عليها — نعيد
      if (r.ok) return;                                  // وصلت — تتشال
      if (r.retryable) {
        // عطل مؤقت — بس اللي بيفضل يفشل لازم يخرج من الطابور،
        // غير كده بيعطّل كل اللي وراه للأبد
        item.tries = (item.tries || 0) + 1;
        if (item.tries < MAX_TRIES) { stillQueued.push(item); return; }
        rejected.push(Object.assign({}, item, {
          error: (r.error || 'فشل') + ' — بعد ' + item.tries + ' محاولات'
        }));
        return;
      }
      rejected.push(Object.assign({}, item, { error: r.error || 'اترفضت' }));
    });

    // صور العمليات اللي وصلت مالهاش لزمة بعد كده
    for (const it of batch) {
      const r = byId[(it.payload && it.payload.op_id) || ''];
      if (r && r.ok && it.payload && it.payload._blobs) await blobDel(it.payload.op_id);
    }

    // اللي اتبعت وهو في الطابور أثناء الإرسال لازم يفضل
    S.queue = stillQueued.concat(S.queue.slice(batch.length));
    save('crm_queue', S.queue);
    if (rejected.length) {
      S.failed = (S.failed || []).concat(rejected).slice(-50);
      save('crm_failed', S.failed);
    }

    const done = batch.length - stillQueued.length - rejected.length;
    if (done) { _retryStep = 0; toast('✅ اترفعت ' + done + ' عملية كانت متخزنة أوفلاين', 'ok'); }
    if (rejected.length) {
      toast('⚠️ ' + rejected.length + ' عملية اترفضت — شوفها في صفحتك', 'err');
    }
    render();
    // فيه باقي؟ نكمّل
    if (S.queue.length && (done || stillQueued.length < batch.length)) {
      _flushing = false;
      return qflush();
    }
    // التحديث بعد ما الطابور كله يخلص، مش مع كل دفعة: كل نداء تحديث
    // بيقرا بيانات المندوب كاملة من السيرفر ويعيد بناء الشاشة، وطابور
    // من 30 عملية كان بيعمل كده 3 مرات
    if (done) refresh(true);
  } catch (e) {
    /* عطل شبكة — الطابور زي ما هو، ومفتاح العملية بيمنع التكرار عند الإعادة */
  } finally {
    _flushing = false;
  }
}

/**
 * بصمات الأقسام اللي إحنا فعلًا ماسكينها.
 *
 * ده أهم شرط في التحديث الجزئي كله. السيرفر لما بيشوف بصمة مطابقة
 * بيشيل القسم من الرد ويقول "مفيش تغيير"، والتطبيق المفروض يرجّعه من
 * نسخته المحفوظة. لكن لو القسم كان ضايع من النسخة المحفوظة وبصمته
 * فضلت موجودة، بيحصل فخ مقفول: السيرفر مبيبعتوش لأن البصمة مطابقة،
 * والتطبيق مبيلاقيش حاجة يرجّع بيها — فالبيانات تفضل فاضية للأبد،
 * حتى بعد ما التطبيق يتقفل ويتفتح، لأن النسخة الناقصة هي اللي متخزنة.
 *
 * فبنبعت بصمة القسم بس لو القسم موجود. أي قسم ناقص بصمته مبتتبعتش،
 * فالسيرفر بيبعته كامل — والجهاز اللي كان متعلّق بيصلّح نفسه لوحده.
 */
function usableHashes(data) {
  if (!data || !data.hashes) return null;
  const out = {};
  Object.keys(data.hashes).forEach(k => {
    if (data[k] !== undefined) out[k] = data.hashes[k];
  });
  return Object.keys(out).length ? out : null;
}

// تحديث واحد في المرة — التطبيق بينده refresh من عشرات الأماكن، ومن غير
// الحارس ده ممكن ردين يتطبقوا فوق بعض
let _refreshing = null;

async function refresh(silent) {
  if (!S.token) return;
  if (_refreshing) return _refreshing;
  _refreshing = doRefreshOnce(silent).finally(() => { _refreshing = null; });
  return _refreshing;
}

async function doRefreshOnce(silent) {
  if (!silent) S.loading = true, render();
  try {
    const action = S.user && S.user.role === 'admin' ? 'adminData' : 'bootstrap';
    // التحديث الجزئي: بنبعت بصمات اللي عندنا والسيرفر بيبعت المتغير بس
    const res = await api(action, { hashes: usableHashes(S.data) });

    // المستخدم خرج أو الجلسة انتهت وإحنا مستنيين الرد — نسيب البيانات
    // في حالها. لو كتبنا الرد دلوقتي كنا هنخزّن نسخة ناقصة على الجهاز.
    if (!S.token || !S.user) return;

    if (res.unchanged && res.unchanged.length && S.data) {
      res.unchanged.forEach(k => { if (S.data[k] !== undefined) res[k] = S.data[k]; });
    }
    // حزام أمان: أي قسم السيرفر قال عنه "مفيش تغيير" ومالقيناهوش عندنا،
    // بنشيل بصمته عشان التحديث الجاي يجيبه كامل
    (res.unchanged || []).forEach(k => {
      if (res[k] === undefined && res.hashes) delete res.hashes[k];
    });
    S.data = res;
    save('crm_boot', res);
    // تخزين هوية الشركة محليًا عشان تظهر في شاشة الدخول قبل تحميل البيانات
    const st = res.settings || res.allSettings || {};
    if (st.CURRENCY) writeLS('crm_currency', st.CURRENCY);
    if (st.COMPANY_NAME) writeLS('crm_company', st.COMPANY_NAME);
    syncLogo();       // اللوجو بيتحمّل مرة واحدة بس لو اتغير
    syncProducts();   // وكذلك كتالوج الأصناف
  } catch (e) {
    if (!silent) {
      // الرسالة الحقيقية أهم من أي وصف عام — لو السيرفر قال سبب، نقوله
      if (e.msg || e.fatal) toast(e.msg || e.fatal, 'err');
      else if (e.timeout) toast('⏱️ السيرفر أخد وقت طويل ومردش — شغال بآخر بيانات محفوظة', 'err');
      else if (e.offline) toast('📴 مفيش نت — شغال بآخر بيانات محفوظة');
      else toast('مشكلة في التحديث', 'err');
    }
  }
  S.loading = false;
  render();
}

// ================== أدوات الواجهة ==================
function $(sel) { return document.querySelector(sel); }
/** شريط "في تحديث جديد" — بيظهر مرة واحدة بس */
function showUpdateBar() {
  if (document.getElementById('upd-bar')) return;
  const d = document.createElement('div');
  d.id = 'upd-bar';
  d.className = 'update-bar';
  d.innerHTML = '<span>✨ في نسخة جديدة من التطبيق</span>' +
    '<button onclick="location.reload()">حدّث دلوقتي</button>' +
    '<button class="x" onclick="this.parentNode.remove()">لاحقًا</button>';
  document.body.appendChild(d);
}

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
/**
 * مكتبة الخرايط بتتحمّل أول ما حد يفتح خريطة فعلًا.
 *
 * قبل كده كانت بتتحمّل في كل فتحة للتطبيق كسكربت معطِّل قبل التطبيق
 * نفسه — حوالي 150 كيلو ومعاها ملف تنسيق، والمندوب ممكن يعدي يومه كله
 * من غير ما يفتح خريطة. الملفات لسه بتتخزن مقدمًا في الـ service worker
 * فأول استخدام بيبقى فوري وبيشتغل بدون نت.
 */
var _leaflet = null;
function loadLeaflet() {
  if (typeof L !== 'undefined') return Promise.resolve();
  if (_leaflet) return _leaflet;
  _leaflet = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';
    css.crossOrigin = 'anonymous';
    document.head.appendChild(css);

    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
    js.crossOrigin = 'anonymous';
    js.onload = resolve;
    js.onerror = () => { _leaflet = null; reject(new Error('مش قادر أحمّل الخريطة')); };
    document.head.appendChild(js);
  });
  return _leaflet;
}

async function openMapPicker(lat, lng, cb) {
  if (typeof L === 'undefined') {
    busyOn('بيحمّل الخريطة...');
    try { await loadLeaflet(); }
    catch (e) { busyOff(); return toast(e.message, 'err'); }
    busyOff();
  }
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


/**
 * فحص الاتصال — بيقيس الوصول للسيرفر ويقول النسخة المنشورة.
 *
 * الهدف منها إن المستخدم يقدر يقول لنا **بالظبط** إيه اللي بيحصل بدل
 * "التطبيق مش شغال": السيرفر رد ولا لأ، في كام ثانية، وأي نسخة منشورة.
 */
A.ping = async () => {
  const box = document.getElementById('diag-out');
  if (box) box.textContent = 'بفحص...';
  const t0 = Date.now();
  let line = '';
  try {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
    let resp, text;
    try {
      resp = await fetch(API_URL, { signal: ctrl ? ctrl.signal : undefined });
      text = await resp.text();
    } finally { if (timer) clearTimeout(timer); }
    const ms = Date.now() - t0;
    let j = null;
    try { j = JSON.parse(text); } catch (e) {}
    if (j && j.ok) {
      line = '✅ السيرفر رد في ' + ms + ' جزء من الثانية' +
             '\nالنسخة المنشورة: ' + (j.build || '(قديمة — مفيش رقم نسخة)') +
             '\nساعة السيرفر: ' + (j.time || '');
    } else {
      line = '❌ السيرفر رد بحاجة مش مفهومة بعد ' + ms + ' جزء من الثانية' +
             '\n' + serverErrText(resp.status, text);
    }
  } catch (e) {
    const ms = Date.now() - t0;
    line = (e && e.name === 'AbortError')
      ? '❌ السيرفر مردش خالص خلال 30 ثانية'
      : '❌ مقدرتش أوصل للسيرفر بعد ' + ms + ' جزء من الثانية';
  }
  if (LAST_SERVER_MS) line += '\nآخر عملية اتنفذت على السيرفر في: ' + LAST_SERVER_MS + ' جزء من الثانية';
  let le = LAST_ERR;
  if (!le) { try { le = JSON.parse(localStorage.getItem('crm_last_err') || 'null'); } catch (e) {} }
  if (le) line += '\n\nآخر خطأ (' + le.at + ')\nالنوع: ' + le.kind + '\n' + le.detail +
                  (le.ms ? '\nاستغرق: ' + le.ms + ' جزء من الثانية' : '');
  if (box) box.textContent = line;
  else alert(line);
};

function viewDiag() {
  return '<div class="card"><h3>🩺 فحص الاتصال بالسيرفر</h3>' +
    '<p class="muted sm">لو التطبيق بطيء أو بيقول مفيش نت والنت شغال — دوس فحص وابعتلنا اللي هيظهر.</p>' +
    '<button class="btn full" onclick="A.ping()">افحص الاتصال دلوقتي</button>' +
    '<pre id="diag-out" class="diag-out"></pre></div>';
}

// ================== الدخول والخروج ==================
/**
 * الزيارة المفتوحة بقت بتعيش بعد الخروج (عشان متضيعش لو الجلسة انتهت
 * والمندوب واقف قدام العميل) — فلازم نتأكد إنها بتاعة اللي داخل دلوقتي،
 * مش بتاعة مندوب تاني استعمل نفس الموبايل.
 */
function ownLiveVisit() {
  const lv = S.liveVisit;
  if (!lv) return;
  const me = S.user && String(S.user.id);
  if (!me) return;
  if (lv.rep_id && String(lv.rep_id) !== me) {
    S.liveVisit = null;
    localStorage.removeItem('crm_live_visit');
  }
}

function doLogout() {
  stopTracking(true);
  // crm_live_visit مش في القايمة عن قصد: الزيارة اللي المندوب واقف
  // فيها قدام العميل مش المفروض تضيع لمجرد إن الجلسة انتهت. بتفضل
  // متخزنة وبترجع لصاحبها بس (الفحص في boot.js).
  ['crm_token', 'crm_user', 'crm_creds', 'crm_device', 'crm_boot'].forEach(k => localStorage.removeItem(k));
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
    writeLS('crm_token', S.token);
    writeLS('crm_device', S.device);
    localStorage.removeItem('crm_creds');   // مبقيناش نخزّن الرقم السري على الجهاز
    save('crm_user', S.user);
    S.tab = 'today'; S.adminTab = 'dash';
    render();
    await refresh();
    if (S.user.role === 'rep') await checkGpsPermission();
    ensureTracking(true);
  } catch (e) {
    toast(e.msg || e.fatal || (e.timeout ? 'السيرفر مردش في الوقت المحدد — جرب تاني'
                                      : e.offline ? 'مفيش نت — جرب تاني' : 'حصل خطأ'), 'err');
    btn.disabled = false; btn.textContent = 'دخول';
  }
};

// ================== العرض الرئيسي ==================
/**
 * شاشات الأدمن في ملف منفصل بيتحمّل عند الحاجة.
 *
 * كود الأدمن لوحده حوالي ثلثين حجم التطبيق، والمندوب عمره ما بيفتح
 * أي شاشة منه — فكان بيحمّله ويحلّله في كل فتحة على الفاضي.
 */
var _adminJs = null;
function loadAdminJs() {
  if (_adminJs) return _adminJs;
  _adminJs = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'app-admin.js';
    el.onload = resolve;
    el.onerror = () => { _adminJs = null; reject(new Error('مش قادر أحمّل شاشات الأدمن')); };
    document.head.appendChild(el);
  });
  return _adminJs;
}

function render() {
  const app = $('#app');
  document.body.classList.toggle('is-offline', !navigator.onLine);
  if (!S.token || !S.user) { app.innerHTML = viewLogin(); return; }
  document.body.classList.toggle('admin', S.user.role === 'admin');
  if (gpsBlocked()) { app.innerHTML = viewGpsGate(); return; }

  if (S.user.role !== 'admin') { app.innerHTML = viewRep(); return; }

  if (typeof viewAdmin === 'function') { app.innerHTML = viewAdmin(); return; }
  // أول مرة الأدمن يفتح — بنجيب ملف شاشاته وبعدين نرسم
  app.innerHTML = '<div class="empty"><div class="big">⏳</div>بيحمّل لوحة التحكم...</div>';
  busyOn('بيحمّل لوحة التحكم...');
  loadAdminJs()
    .then(() => { busyOff(); render(); })
    .catch(e => {
      busyOff();
      app.innerHTML = '<div class="empty"><div class="big">⚠️</div>' + esc(e.message) +
        '<br><button class="btn mt" onclick="render()">حاول تاني</button></div>';
    });
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

// ==================== [ shared.js ] ====================
/* CRM روافد — حاجات بيستخدمها المندوب والأدمن مع بعض.
   لازم تفضل هنا مش في admin.js: ملف الأدمن مش بيتحمّل عند المندوب خالص. */

// ================== مدة الاستحقاق ==================
function defaultTerms() {
  const s = (S.data && (S.data.allSettings || S.data.settings)) || {};
  return Number(s.PAYMENT_TERMS_DAYS) || 30;
}
function termsOf(c) { return Number(c.payment_terms) > 0 ? Number(c.payment_terms) : defaultTerms(); }

// ================== سجل المبيعات ==================
A.loadSales = async () => {
  if (A._salesLoading) return;
  A._salesLoading = true;
  try { const r = await api('salesData', {}); S.sales = r; render(); }
  catch (e) { toast(e.msg || 'خطأ', 'err'); }
  finally { A._salesLoading = false; }
};

// ================== كشف حساب العميل ==================
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

    // فحص ذاتي: إجمالي الكشف لازم يطابق رصيد العميل المخزّن.
    // لو اختلفوا يبقى فيه مصدر بيتحسب في حتة ومش متحسب في التانية — وده اللي حصل مع الفواتير المسودة.
    const mismatch = (r.fullTotal !== undefined && r.storedBalance !== undefined &&
                      Math.abs(Number(r.fullTotal) - Number(r.storedBalance)) > 0.01);
    openModal(`
      <h2>📄 كشف حساب: ${esc(r.customer.name)}</h2>
      <p class="modal-sub">${esc(periodTxt)}</p>
      ${r.drafts ? `<div class="card" style="border-right:4px solid var(--amber);padding:10px 12px">
        <b>ℹ️ ${r.drafts} مستند مسودة في قيود</b>
        <p class="muted" style="margin:4px 0 0">مش محسوبين في الكشف ولا في الرصيد — المسودة مش فاتورة لسه.
        لو المفروض تتحسب، اعتمدها في قيود وزامن.</p></div>` : ''}
      ${mismatch ? `<div class="card" style="border-right:4px solid var(--red);padding:10px 12px">
        <b>🔴 إجمالي الكشف مش مطابق لرصيد العميل</b>
        <p class="muted" style="margin:4px 0 0">الكشف: ${money(r.fullTotal)} · الرصيد المسجل: ${money(r.storedBalance)}
        — شغّل مزامنة، ولو الفرق فضل شغّل «🧪 فحص سلامة كشوف الحساب» من الإعدادات.</p></div>` : ''}
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

// ================== ربط تليجرام ==================
/**
 * بيطلب كود ربط لمرة واحدة. الربط بقى بكود بدل اسم المستخدم — قبل كده
 * أي حد يعرف اسم مندوب كان يقدر يربط نفسه بحسابه ويستقبل بيانات عملائه.
 */
A.tgLinkCode = async () => {
  try {
    const r = await api('telegramLinkCode', {});
    openModal(`
      <h2>🔗 كود ربط تليجرام</h2>
      <p class="modal-sub">افتح بوت الشركة على تليجرام وابعتله الرسالة دي بالظبط:</p>
      <div class="card" style="text-align:center;background:var(--blue-soft)">
        <div style="font-size:26px;font-weight:800;letter-spacing:3px;direction:ltr">/start ${esc(r.code)}</div>
      </div>
      <p class="muted">الكود ده يخصك انت بس، بيشتغل <b>مرة واحدة</b>، وصلاحيته <b>${r.minutes} دقايق</b>.
      متديهوش لحد.</p>
      <div class="modal-actions"><button class="btn outline" onclick="A.closeModal()">تمام</button></div>`);
  } catch (e) { toast(e.msg || 'مش قادر أجيب الكود', 'err'); }
};

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

function priorityBadge(c) {
  const p = Number(c.priority_score) || 0;
  const cls = p >= PRIO_URGENT ? 'hot' : p >= PRIO_IMPORTANT ? 'warm'
            : p >= PRIO_NORMAL ? 'info' : 'cool';
  const icon = p >= PRIO_URGENT ? '🔴' : p >= PRIO_IMPORTANT ? '🟠'
             : p >= PRIO_NORMAL ? '🟡' : '⚪';
  return '<span class="badge ' + cls + '">' + icon + ' ' + priorityLabel(p) + ' ' + p + '</span>';
}

/**
 * المسافة بتتحسب مرة واحدة لكل عميل وبتتخزن لحد ما الموقع يتغير —
 * قبل كده كانت بتتحسب لكل عميل في كل رسمة (مئات العمليات في الثانية
 * وقت الكتابة في البحث).
 */
var _distCache = { key: '', map: {} };
function cachedDist(c) {
  if (!S.myPos || !c.lat || !c.lng) return null;
  const key = S.myPos.lat + ',' + S.myPos.lng;
  if (_distCache.key !== key) _distCache = { key: key, map: {} };
  const id = String(c.id);
  if (_distCache.map[id] === undefined) {
    _distCache.map[id] = distMeters(S.myPos.lat, S.myPos.lng, Number(c.lat), Number(c.lng));
  }
  return _distCache.map[id];
}

function custCard(c, showDay) {
  const dist = cachedDist(c);
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
  const urgent = myCustomers().filter(c => Number(c.visit_day) !== dayIdx && Number(c.priority_score) >= PRIO_URGENT)
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
  let added = false;
  if (saveLoc && pos) {
    c.lat = pos.lat; c.lng = pos.lng; c.location_source = 'GPS من الموقع';
    added = true;
    try { await api('setCustomerLocation', { customer_id: custId, lat: pos.lat, lng: pos.lng, source: 'gps' }); toast('📍 اتحفظ لوكيشن العميل', 'ok'); }
    catch (e) {
      if (!e.offline) return;
      if (!await qpush('setCustomerLocation', { op_id: opId(), customer_id: custId, lat: pos.lat, lng: pos.lng, source: 'gps' })) return;
    }
  }
  await doCheckin(c, pos, added);
};

A.pickLocForCustomer = (custId, thenCheckin) => {
  const c = custById(custId);
  openMapPicker(c.lat, c.lng, async (ll) => {
    c.lat = ll.lat; c.lng = ll.lng; c.location_source = 'تحديد يدوي على الخريطة';
    try { await api('setCustomerLocation', { customer_id: custId, lat: ll.lat, lng: ll.lng, source: 'manual' }); toast('📍 اتحفظ لوكيشن العميل', 'ok'); }
    catch (e) {
      if (!e.offline) return toast(e.msg || 'خطأ', 'err');
      if (await qpush('setCustomerLocation', { op_id: opId(), customer_id: custId, lat: ll.lat, lng: ll.lng, source: 'manual' })) {
        toast('اتحفظ محليًا وهيترفع لما النت يرجع');
      }
    }
    if (thenCheckin) await doCheckin(c, A._pendingPos, true);
    else render();
  });
};

/** locationAdded = اتحدد لوكيشن العميل كجزء من الزيارة دي — بيتسجل على الزيارة للتقرير */
async function doCheckin(c, pos, locationAdded) {
  const nowTime = new Date().toTimeString().slice(0, 5);
  if (pos) pushTrackPoint(pos.lat, pos.lng, pos.acc, 'وصول: ' + c.name);
  // مفتاح واحد لدورة الزيارة كلها — لو الرد ضاع وأعاد، السيرفر يعرف إنها نفس الزيارة
  const payload = { customer_id: c.id, lat: pos ? pos.lat : '', lng: pos ? pos.lng : '',
                    location_added: !!locationAdded, op_id: opId() };
  try {
    const res = await api('checkin', payload);
    S.liveVisit = { visit_id: res.visit_id, customer_id: c.id, checkin_time: nowTime, lat: payload.lat, lng: payload.lng, distance_m: res.distance_m, inRange: res.inRange, local: false };
    if (res.resumed) toast('↩️ عندك زيارة مفتوحة عند ' + c.name + ' — كمّلنا عليها', 'ok');
    else if (res.inRange === false) toast('⚠️ إنت على بعد ' + res.distance_m + ' م من لوكيشن العميل المسجل', 'err');
    else toast('✅ اتسجل وصولك عند ' + c.name, 'ok');
  } catch (e) {
    if (e.offline) {
      const dm = (pos && c.lat) ? distMeters(pos.lat, pos.lng, Number(c.lat), Number(c.lng)) : '';
      // بنحتفظ بمفتاح الزيارة — لو السيرفر كان سجّلها فعلًا والرد ضاع،
      // المفتاح ده بيخلي الإرسال الجاي يتعرف عليها بدل ما يعملها تاني
      S.liveVisit = { visit_id: '', customer_id: c.id, checkin_time: nowTime, lat: payload.lat, lng: payload.lng, distance_m: dm, inRange: null, local: true, op_id: payload.op_id };
      toast('📴 مفيش نت — الزيارة اتسجلت محليًا وهتترفع تلقائي', 'ok');
    } else { toast(e.msg || 'خطأ', 'err'); return; }
  }
  if (S.liveVisit && S.user) S.liveVisit.rep_id = S.user.id;
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
  // المفتاح بيتولّد دلوقتي — قبل أي محاولة إرسال. لو الرد ضاع بعد ما
  // السيرفر نفّذ، النسخة اللي هتتعاد بتحمل نفس المفتاح فالسيرفر يعرفها.
  const opKey = (lv && lv.op_id) || opId();
  if (S.myPos) pushTrackPoint(S.myPos.lat, S.myPos.lng, S.myPos.acc, 'انصراف: ' + (c ? c.name : ''));
  closeModal();
  try {
    if (lv.local || !lv.visit_id) throw { offline: true };
    await api('checkout', Object.assign({ visit_id: lv.visit_id, op_id: opKey }, form));
    toast('✅ الزيارة اتسجلت بنجاح', 'ok');
    // رفع الصور بعد ما الزيارة اتسجلت
    let queuedPhotos = 0;
    for (let i = 0; i < photos.length; i++) {
      try {
        toast('⏳ برفع صورة ' + (i + 1) + ' من ' + photos.length);
        await uploadAttachment('visit', lv.visit_id, 'photo', photos[i]);
      } catch (err) {
        // الصورة اللي مترفعتش تدخل الطابور — قبل كده كانت بتضيع خالص
        if (await qpush('uploadAttachment', {
          op_id: opId(), kind: 'visit', id: lv.visit_id, type: 'photo', data: photos[i]
        })) queuedPhotos++;
        else toast('صورة ' + (i + 1) + ' مترفعتش: ' + (err.msg || ''), 'err');
      }
    }
    if (photos.length > queuedPhotos) toast('📷 الصور اترفعت', 'ok');
    if (queuedPhotos) toast('📴 ' + queuedPhotos + ' صورة هترفع لما النت يرجع', 'ok');
  } catch (e) {
    if (e.offline) {
      const [h1, m1] = lv.checkin_time.split(':').map(Number);
      const [h2, m2] = outTime.split(':').map(Number);
      const ok = await qpush('quickVisit', Object.assign({
        op_id: opKey,
        customer_id: lv.customer_id, date: new Date().toISOString().slice(0, 10),
        checkin_time: lv.checkin_time, checkout_time: outTime,
        duration_min: Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1)),
        lat: lv.lat, lng: lv.lng, distance_m: lv.distance_m, visit_type: 'ميدانية'
      }, form));
      // لو الحفظ المحلي فشل، الزيارة لازم تفضل مفتوحة — مسحها هنا كان
      // بيضيّع تقرير المندوب وهو شايف رسالة نجاح خضرا
      if (!ok) { qflush(); return; }
      // الصور بتتحفظ كعمليات منفصلة بترتيبها بعد الزيارة، وبتشاور عليها
      // بمفتاح عمليتها لأن رقم الزيارة لسه مش موجود
      let savedPhotos = 0;
      for (let i = 0; i < photos.length; i++) {
        if (await qpush('uploadAttachment', {
          op_id: opId(), kind: 'visit', visit_op_id: opKey, type: 'photo', data: photos[i]
        })) savedPhotos++;
      }
      toast('📴 التقرير' + (savedPhotos ? ' و' + savedPhotos + ' صورة' : '') +
            ' اتحفظوا محليًا وهيترفعوا تلقائي', 'ok');
      if (savedPhotos < photos.length) {
        toast('⚠️ ' + (photos.length - savedPhotos) + ' صورة مااتحفظتش — مساحة الجهاز', 'err');
      }
    } else { toast(e.msg || 'خطأ', 'err'); return; }
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
  catch (e) {
    if (e.offline) {
      if (await qpush('closeFollowup', Object.assign({ op_id: opId() }, { id: id, note: note }))) toast('📴 اتحفظت محليًا', 'ok');
      return;
    }
    toast(e.msg || 'خطأ', 'err');
  }
};
A.fuCancel = async (id) => {
  if (!confirm('إلغاء المتابعة دي؟')) return;
  try { const r = await api('closeFollowup', { id: id, cancel: true }); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); }
  catch (e) {
    if (e.offline) {
      if (await qpush('closeFollowup', Object.assign({ op_id: opId() }, { id: id, cancel: true }))) toast('📴 اتحفظت محليًا', 'ok');
      return;
    }
    toast(e.msg || 'خطأ', 'err');
  }
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
  const payload = { op_id: opId(), id: id, postpone: true, due_date: $('#fu-date').value, note: $('#fu-note').value.trim() };
  closeModal();
  try { const r = await api('closeFollowup', payload); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); }
  catch (e) {
    if (e.offline) {
      if (await qpush('closeFollowup', Object.assign({ op_id: opId() }, payload))) toast('📴 اتحفظت محليًا', 'ok');
      return;
    }
    toast(e.msg || 'خطأ', 'err');
  }
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
  const payload = { op_id: opId(),
    customer_id: custId, type: $('#fu-type').value, due_date: $('#fu-due').value,
    amount: normDigits($('#fu-amount').value), note: $('#fu-note2').value.trim()
  };
  if (!payload.due_date) return toast('حدد التاريخ', 'err');
  closeModal();
  try { const r = await api('saveFollowup', payload); toast(r.message, 'ok'); S.fu = null; A.loadFollowups(); }
  catch (e) {
    if (e.offline) {
      if (await qpush('saveFollowup', payload)) toast('📴 المتابعة اتحفظت محليًا', 'ok');
      return;
    }
    toast(e.msg || 'خطأ', 'err');
  }
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
              <div class="cust-meta">${c.voucher ? 'سند ' + esc(c.voucher) + ' • ' : ''}${c.ref_no ? esc(c.ref_no) + ' • ' : ''}${esc(String(c.date).slice(0, 10))} ${esc(c.time || '')} • ${esc(c.method)}
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
  return `
    <input placeholder="🔍 دور بالاسم أو العنوان أو التليفون" value="${esc(S.custFilter)}"
      oninput="A.custSearch(this.value)" style="margin-bottom:10px">
    <div class="pill-row">${days.map(d =>
      `<button class="pill ${String(S.custDay) === String(d[0]) ? 'active' : ''}" onclick="A.custDayF('${d[0]}')">${d[1]}</button>`).join('')}
    </div>
    <div id="cust-list">${custListHtml()}</div>`;
}

/** قايمة العملاء المفلترة — متفصلة عشان نقدر نرسمها لوحدها */
function custListHtml() {
  let list = myCustomers();
  if (S.custDay !== 'all') list = list.filter(c => String(c.visit_day) === String(S.custDay));
  if (S.custFilter) {
    const f = S.custFilter.toLowerCase();
    list = list.filter(c => String(c.name).toLowerCase().includes(f) ||
      String(c.address).toLowerCase().includes(f) || String(c.phone).includes(f));
  }
  list.sort((a, b) => (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0));
  return list.length ? list.map(c => custCard(c, true)).join('')
                     : '<div class="empty"><div class="big">🔍</div>مفيش نتايج</div>';
}

/**
 * البحث كان بيعيد بناء التطبيق كله مع كل حرف — يعني مئات الكيلوبايتات
 * HTML وحساب مسافة لكل عميل، في كل ضغطة زرار، على موبايل في الشارع.
 * دلوقتي بنستنى شوية لحد ما المندوب يبطّل كتابة، وبنرسم القايمة بس.
 */
var _custTimer = null;
A.custSearch = v => {
  S.custFilter = v;
  clearTimeout(_custTimer);
  _custTimer = setTimeout(() => {
    const box = document.getElementById('cust-list');
    if (box) box.innerHTML = custListHtml();   // خانة البحث نفسها مش بتتلمس
    else render();                             // المستخدم غيّر التبويب في الوقت ده
  }, 200);
};
A.custDayF = v => { S.custDay = v; render(); };

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
    op_id: opId(),                       // مفتاح واحد للمحاولة الأونلاين وللإعادة
    customer_id: custId, visit_type: 'هاتفية', status: 'تمت',
    outcome: $('#v-outcome').value, report: $('#v-report').value.trim(),
    date: new Date().toISOString().slice(0, 10)
  };
  closeModal();
  try { await api('quickVisit', payload); toast('✅ اتسجلت', 'ok'); refresh(true); }
  catch (e) {
    if (e.offline) { if (await qpush('quickVisit', payload)) toast('📴 اتحفظت محليًا', 'ok'); }
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
    op_id: opId(),
    name: $('#l-name').value.trim(), phone: $('#l-phone').value.trim(), address: $('#l-address').value.trim(),
    source: $('#l-source').value, notes: $('#l-notes').value.trim(),
    lat: A._leadLoc ? A._leadLoc.lat : '', lng: A._leadLoc ? A._leadLoc.lng : ''
  };
  if (!payload.name) return toast('اكتب اسم الليد', 'err');
  closeModal();
  try { await api('addLead', payload); toast('✅ الليد اتضاف', 'ok'); refresh(true); }
  catch (e) {
    if (e.offline) { if (await qpush('addLead', payload)) toast('📴 اتحفظ محليًا', 'ok'); }
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
  const payload = { op_id: opId(), id: id, stage: $('#l-stage').value, notes: $('#l-notes').value.trim() };
  closeModal();
  try {
    await api('updateLead', payload);
    toast(payload.stage === 'اتحول لعميل' ? '🎉 مبروك — الليد بقى عميل!' : '✅ اتحدث', 'ok');
    refresh(true);
  } catch (e) {
    if (e.offline) { if (await qpush('updateLead', payload)) toast('📴 اتحفظ محليًا', 'ok'); }
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
      <p class="muted">عشان توصلك خطة يومك كل صبح على تليجرام، اطلب كود ربط وابعته للبوت.
      الكود بيشتغل مرة واحدة ولمدة 10 دقايق.</p>
      <button class="btn ghost full" onclick="A.tgLinkCode()">🔗 اطلب كود ربط</button>
    </div>
    ${S.queue.length ? '<div class="card"><h3>⏳ عمليات مستنية النت (' + S.queue.length + ')</h3><button class="btn sm ghost" onclick="A.doRefresh()">حاول ترفعها دلوقتي</button></div>' : ''}
    ${(S.failed || []).length ? `<div class="card" style="border-right:4px solid var(--red)">
      <h3>⚠️ عمليات السيرفر رفضها (${S.failed.length})</h3>
      <p class="muted">دي اتحفظت عندك بس السيرفر رفضها — لازم تتصرف فيها، مش هتترفع لوحدها.</p>
      ${S.failed.slice(-10).reverse().map(f => `<div class="stat-line">
        <span>${esc(actionLabel(f.action))}<div class="muted" style="font-size:11px">${esc(f.error || '')}</div></span>
        <b class="muted" style="font-size:11px">${esc(String(f.ts ? new Date(f.ts).toLocaleString('ar-EG') : ''))}</b>
      </div>`).join('')}
      <button class="btn sm ghost mt" onclick="A.retryFailed()">حاول ترفعها تاني</button>
      <button class="btn sm outline mt" onclick="A.clearFailed()">فهمت — شيلها من القايمة</button>
    </div>` : ''}
    ${viewDiag()}
    <button class="btn red full mt" onclick="A.logout()">تسجيل خروج</button>
    <p class="muted mt" style="text-align:center">CRM روافد — آخر تحديث بيانات: ${esc((S.data.serverTime || ''))}</p>`;
}

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
function products() { return readLS('crm_products', []); }
async function syncProducts() {
  const v = S.data && S.data.productsVersion;
  if (v === undefined) return;
  if (!v) { localStorage.removeItem('crm_products'); localStorage.removeItem('crm_products_v'); return; }
  if (readStr('crm_products_v') === v && products().length) return;
  try {
    const r = await api('getProducts', {});
    writeLS('crm_products', JSON.stringify(r.products || []));
    writeLS('crm_products_v', r.version || v);
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
  const payload = { op_id: opId(), customer_id: custId, items: o.items, notes: o.notes, date: new Date().toISOString().slice(0, 10) };
  closeModal();
  try { const r = await api('saveOrder', payload); toast(r.message, 'ok'); }
  catch (e) {
    if (e.offline) { if (await qpush('saveOrder', payload)) toast('📴 الطلب اتحفظ محليًا وهيترفع لما النت يرجع', 'ok'); }
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
    op_id: opId(),                       // مفتاح واحد للمحاولة الأونلاين وللإعادة
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
      if (await qpush('saveCollection', payload)) toast('📴 السند اتحفظ محليًا وهيترفع لما النت يرجع', 'ok');
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
  const payload = { op_id: opId(),
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
  catch (e) {
    // المصروف بيأثر على عهدة المندوب — ضياعه بيبوّظ حسابه، فلازم يتحفظ
    if (e.offline) {
      if (await qpush('saveExpense', payload)) toast('📴 المصروف اتحفظ محليًا وهيترفع لما النت يرجع', 'ok');
      return;
    }
    toast(e.msg || 'خطأ', 'err');
  }
};

// ==================== [ tracking.js ] ====================
/* CRM روافد — تتبع خط السير بالـ GPS */

// ================== تتبع خط السير ==================
/**
 * بيسجل نقطة كل بضع دقايق أو لما المندوب يتحرك مسافة كافية، والتطبيق مفتوح.
 * النقاط بتتخزن محليًا وبتترفع كل شوية — فلو النت قطع مفيش حاجة بتضيع.
 */
const TRK = {
  watchId: null, last: null, buf: readLS('crm_track_buf', []),
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
  writeLS('crm_track_buf', JSON.stringify(TRK.buf));
  if (TRK.buf.length >= 5) flushTrack();
}

async function flushTrack() {
  if (!TRK.buf.length || !S.token || !navigator.onLine) return;
  if (Date.now() - TRK.lastFlush < 15000) return;
  TRK.lastFlush = Date.now();
  const batch = TRK.buf.slice(0, 120);
  try {
    await api('track', { points: batch }, { quiet: true });
    TRK.buf = TRK.buf.slice(batch.length);
    writeLS('crm_track_buf', JSON.stringify(TRK.buf));
  } catch (e) { /* هنحاول تاني بعدين */ }
}

// ==================== [ boot.js ] ====================
/* CRM روافد — نقطة التشغيل (لازم يتحمّل آخر واحد) */

// ================== التشغيل ==================
window.addEventListener('online', () => {
  document.body.classList.remove('is-offline');
  // مش scheduleFlush(true): التدرّج بيترجّع لأوله لما عملية تنجح فعلًا
  // (جوه qflush) — مش كل ما أندرويد يقول إن فيه شبكة، وهو بيقولها كتير
  qflushAuto().then(() => scheduleFlush(false));
  flushTrack();
});
window.addEventListener('offline', () => document.body.classList.add('is-offline'));
// لما التطبيق يرجع للواجهة تاني — نرجّع قفل الشاشة ونرفع اللي اتجمع
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { stopTracking(true); return; }
  if (gpsBlocked()) { checkGpsPermission(); return; }
  ensureTracking(true);   // نقطة جديدة كل ما يرجع للتطبيق — بيها بيتوصل المسار
  flushTrack();
  // شغل المندوب أهم من نقط التتبع — قبل كده ده كان بيرفع النقط بس
  qflushAuto().then(() => scheduleFlush(false));
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // الـ SW بقى بيرد من الكاش فورًا والتحديث بينزل في الخلفية — فلازم
  // نقول للمستخدم إن في نسخة جديدة بدل ما يفضل على القديمة من غير ما يدري.
  // الـ SW نفسه بيفرّق بين أول تركيب والترقية، فمش محتاجين نعد الرسايل هنا.
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'sw-updated') showUpdateBar();
  });
}

render();
window.__crmStarted = true;   // بيقول لشبكة الأمان في index.html إن التطبيق فتح فعلًا
if (S.token) {
  askPersistentStorage();          // عشان أندرويد مايمسحش الشغل تحت الضغط
  qflush().then(() => scheduleFlush(true));
  setTimeout(cleanOrphanBlobs, 5000);
  ownLiveVisit();                  // زيارة مندوب تاني على نفس الموبايل متظهرش
  refresh(true).then(() => {
    if (S.user && S.user.role === 'rep') checkGpsPermission();
    ensureTracking(true);
  });
}

