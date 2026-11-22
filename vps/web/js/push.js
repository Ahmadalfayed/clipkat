// إشعارات الهاتف (Web Push) من جهة المتصفح — © 2026 وطن النهار
// تسجيل عامل الخدمة، الاشتراك/الإلغاء، وكشف قدرات الجهاز (iPhone يحتاج إضافة الموقع للشاشة الرئيسية، WebView لا يدعم الدفع).
import { rq } from './rtc.js';

const UA = navigator.userAgent || '';
export const env = () => {
  const ios = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const android = /Android/i.test(UA);
  const huawei = /HUAWEI|HONOR|HarmonyOS|HMSCore|HuaweiBrowser/i.test(UA);
  const iosBrowser = !ios ? null : /CriOS/.test(UA) ? 'chrome' : /FxiOS/.test(UA) ? 'firefox' : /EdgiOS/.test(UA) ? 'edge' : 'safari';
  const iosVer = ios ? parseFloat(((UA.match(/OS (\d+)[_.](\d+)/) || []).slice(1, 3).join('.')) || '0') : 0;
  const sw = 'serviceWorker' in navigator, pm = 'PushManager' in window, notif = 'Notification' in window;
  // iPhone: إشعارات الويب تعمل فقط من أيقونة الشاشة الرئيسية (لا من تبويب سفاري/كروم)
  const supported = sw && pm && notif && window.isSecureContext && !(ios && !standalone);
  // سبب عدم الدعم (لإظهار الإرشاد الصحيح)
  let why = '';
  if (!supported) why = ios ? (standalone ? (iosVer && iosVer < 16.4 ? 'iosOld' : 'iosNoPush') : 'iosHome') : android && !pm ? 'webview' : 'browser';
  return { ios, standalone, android, huawei, iosBrowser, iosVer, supported, why };
};
const keyBytes = (k) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - k.length % 4) % 4)), (c) => c.charCodeAt(0));

let regP = null, cfgP = null;
export const pushConfig = () => (cfgP ||= rq('GET', '/push/config').catch(() => ({ enabled: false })));
export function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  return (regP ||= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => { console.warn('[push] sw', e?.message); regP = null; return null; }));
}
// حالة هذا الجهاز: 'unsupported' | 'off' (الخادم معطّل) | 'denied' | 'on' | 'idle'
export async function deviceState() {
  const e = env(); if (!e.supported) return { state: 'unsupported', env: e };
  const cfg = await pushConfig(); if (!cfg.enabled) return { state: 'off', env: e };
  if (Notification.permission === 'denied') return { state: 'denied', env: e };
  const reg = await registerSW(); const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return { state: sub && Notification.permission === 'granted' ? 'on' : 'idle', env: e, sub };
}
// يجب استدعاؤها من ضغطة زر (iPhone يرفض الطلب بدونها)
export async function enablePush() {
  const e = env(); if (!e.supported) throw new Error(e.why);
  const permP = Notification.requestPermission();   // أول شيء داخل الضغطة
  const [perm, cfg, reg] = await Promise.all([permP, pushConfig(), registerSW()]);
  if (perm !== 'granted') throw new Error('denied');
  if (!cfg.enabled || !cfg.publicKey) throw new Error('off');
  if (!reg) throw new Error('browser');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const want = keyBytes(cfg.publicKey);
  const same = (s) => { try { const k = new Uint8Array(s.options?.applicationServerKey || []); return !k.length || (k.length === want.length && k.every((b, i) => b === want[i])); } catch { return true; } };
  if (sub && !same(sub)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  try { sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want }); }
  catch (er) { throw new Error(e.android ? 'pushService' : 'browser'); }   // أجهزة بدون خدمات Google (Huawei) تفشل هنا في Chrome
  await rq('POST', '/push/subscribe', sub.toJSON());
  localStorage.setItem('ck:push', '1');
  return sub;
}
export async function disablePush() {
  const reg = await registerSW(); const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (sub) { await rq('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  localStorage.removeItem('ck:push');
}
// بعد الدخول: نسجّل عامل الخدمة ونجدّد ربط الاشتراك الموجود بالحساب الحالي (بدون طلب إذن)
export async function syncPush(me) {
  const e = env(); if (!e.supported) return;
  const reg = await registerSW(); if (!reg || !me) return;
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  if (sub && Notification.permission === 'granted') rq('POST', '/push/subscribe', sub.toJSON()).catch(() => {});
}
// خروج من الحساب: نفصل هذا الجهاز حتى لا تصل إشعارات الحساب السابق
export async function detachPush() {
  const reg = await (('serviceWorker' in navigator) ? navigator.serviceWorker.getRegistration('/') : null);
  const sub = await reg?.pushManager?.getSubscription().catch(() => null);
  if (sub) await rq('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
}
