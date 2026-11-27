// عامل خدمة كليب كات: إشعارات الهاتف (Web Push) حتى لو كان الموقع مغلقاً — © 2026 وطن النهار
// لا يخزّن صفحات الموقع (التحديثات تصل فوراً)؛ وظيفته استقبال الإشعارات وفتح الصفحة الصحيحة عند الضغط.
// إصدار العامل: تغييره يجعل التطبيق المثبّت يحدّث نفسه ويعيد تحميل الصفحات المفتوحة على الواجهة الجديدة
const SW_VERSION = '2026-11-27-navfix';
const UA = self.navigator.userAgent || '';
// Safari (iPhone/Mac) يتطلب أن يُظهر كل دفع إشعاراً مرئياً، وإلا قد يلغي الاشتراك
const APPLE = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && /Safari/.test(UA) && !/Chrome|Chromium|Edg|Firefox/.test(UA));
const ICON = '/assets/icon-192.png', BADGE = '/assets/badge-72.png';
let queue = Promise.resolve();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'كليب كات', body: e.data ? e.data.text() : '' }; }
  // بالتسلسل حتى يُجمّع إشعار الرسائل المتتالية بشكل صحيح
  const run = queue.then(() => handle(d)).catch(() => self.registration.showNotification(d.title || 'كليب كات', { body: d.body || '', icon: ICON, dir: 'rtl', lang: 'ar' }));
  queue = run.catch(() => {});
  e.waitUntil(run);
});

async function windows() { return self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }
const base = (d, extra = {}) => ({ body: d.body || '', tag: d.tag || undefined, icon: d.icon || ICON, badge: BADGE, dir: 'rtl', lang: 'ar', timestamp: d.ts || Date.now(), data: { t: d.t, url: d.url || '/#/feed', callId: d.callId || null, kind: d.kind || null, count: 1, from: d.tag || null }, ...extra });

async function handle(d) {
  const reg = self.registration;
  const wins = await windows();
  const visible = wins.filter((c) => c.visibilityState === 'visible');
  // نبلغ الصفحات المفتوحة (لتحديث العدّادات مثلاً)
  wins.forEach((c) => c.postMessage({ ck: 'push', t: d.t, callId: d.callId || null }));

  if (d.t === 'call-end') {
    (await reg.getNotifications({ tag: d.tag })).forEach((n) => n.close());
    if (d.missed) return reg.showNotification(d.title || 'مكالمة فائتة', base(d, { requireInteraction: false }));
    return;   // رُدّ عليها/رُفضت من جهاز آخر: نكتفي بإغلاق إشعار الرنين (لا يُرسل هذا النوع لأجهزة Apple)
  }
  if (d.t === 'call') {
    // الصفحة ظاهرة أمامك: شاشة الرنين داخل الموقع تكفي (إلا على iPhone حيث يجب إظهار إشعار)
    if (visible.some((c) => c.focused) && !APPLE) return;
    return reg.showNotification(d.title, base(d, {
      body: d.body || 'اضغط للرد', requireInteraction: true, renotify: true,
      vibrate: [600, 300, 600, 300, 600, 300, 600, 300, 600],
      actions: [{ action: 'answer', title: d.kind === 'video' ? '📹 رد' : '📞 رد' }, { action: 'decline', title: '❌ رفض' }]
    }));
  }
  if (d.t === 'dm') {
    // المحادثة نفسها مفتوحة أمامك الآن: لا داعي للإشعار
    const chatUrl = d.url ? d.url.replace(/^\//, '') : '';
    if (!APPLE && chatUrl && visible.some((c) => c.focused && c.url.endsWith(chatUrl))) return;
    const prev = (await reg.getNotifications({ tag: d.tag }))[0];
    const count = (prev?.data?.count || 0) + 1;
    const o = base(d, { renotify: !d.silent, silent: !!d.silent });
    o.data.count = count;
    if (count > 1) o.body = `${count} رسائل جديدة — آخرها: ${d.body || ''}`;
    return reg.showNotification(d.title, o);
  }
  const o = base(d, { renotify: !d.silent && !!d.tag, silent: !!d.silent });
  if (d.image) o.image = d.image;
  return reg.showNotification(d.title || 'كليب كات', o);
}

self.addEventListener('notificationclick', (e) => {
  const n = e.notification; const d = n.data || {};
  n.close();
  e.waitUntil((async () => {
    if (d.t === 'call' && e.action === 'decline') {
      await fetch(`/api/calls/${encodeURIComponent(d.callId)}/decline`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CK': '1', 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      return;
    }
    let url = d.url || '/#/feed';
    if (d.t === 'call' && d.callId) url = `/#/feed?call=${encodeURIComponent(d.callId)}&act=${e.action === 'answer' ? 'accept' : 'ring'}`;
    const wins = await windows();
    const c = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (c) {
      c.postMessage({ ck: 'open', url });
      try { await c.focus(); } catch {}
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// المتصفح جدّد الاشتراك (نادراً): نسجّل الجديد
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const cfg = await (await fetch('/api/push/config', { credentials: 'same-origin' })).json();
      if (!cfg.publicKey) return;
      const key = Uint8Array.from(atob(cfg.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - cfg.publicKey.length % 4) % 4)), (ch) => ch.charCodeAt(0));
      const s = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch('/api/push/subscribe', { method: 'POST', credentials: 'same-origin', headers: { 'X-CK': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(s.toJSON()) });
    } catch {}
  })());
});
