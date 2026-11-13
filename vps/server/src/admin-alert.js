// © 2026 وطن النهار — تنبيه المشرفين بطلب إيجار متجر جديد (بانتظار التفعيل)
// 1) إشعار داخل الموقع لكل مشرف (is_admin) مع زر إلى لوحة الإدارة
// 2) بريد عربي إلى ADMIN_ALERT_EMAIL (افتراضياً: وجهة تحويل MX_ROUTES، ثم العنوان الافتراضي) عبر نفس مُرسِل البريد (DKIM)
// الإرسال في الخلفية: أي فشل لا يؤثر على طلب الإيجار. حد للبريد: مرة لكل تاجر كل 10 دقائق، و20 رسالة بالساعة كحد أقصى.
// ADMIN_ALERT_EMAIL=off يوقف البريد (الإشعار داخل الموقع يبقى).
import { config } from './config.js';
import { q } from './db.js';
import { sendMail, maskEmail } from './mailer.js';
import { escHtml, layout, button } from './password-reset.js';

const env = process.env;
const DEFAULT_TO = 'aaaaaaaasa2112@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ALERT_PREFIX = 'طلب متجر جديد بانتظار التفعيل';
// نفس صيغة MX_ROUTES في mx.js (support@clipkat.live=owner@gmail.com) — بدون تحميل خادم SMTP
const routeTargets = (v) => String(v || '').split(/[,;\s]+/).map((x) => (x.split('=')[1] || '').trim().toLowerCase()).filter((x) => EMAIL_RE.test(x));
const PLAN_AR = { weekly: 'أسبوعي', monthly: 'شهري', yearly: 'سنوي' };

export function alertEmailTo() {
  const v = String(env.ADMIN_ALERT_EMAIL || '').trim().toLowerCase();
  if (['off', '0', 'none', 'false'].includes(v)) return null;
  if (EMAIL_RE.test(v)) return v;
  const routed = routeTargets(env.MX_ROUTES)[0];
  return routed || DEFAULT_TO;
}
const siteUrl = () => config.publicUrl || (env.DOMAIN ? `https://${env.DOMAIN}` : 'https://clipkat.live');

export function alertEmail({ storeName, username, planId, amount, renew }) {
  const link = `${siteUrl()}/#/admin`;
  const plan = `${PLAN_AR[planId] || planId}${amount != null ? ` (${Number(amount).toFixed(3)} د.ك)` : ''}`;
  const kind = renew ? 'طلب تجديد إيجار متجر' : 'طلب متجر جديد';
  const subject = `${kind} بانتظار التفعيل: ${storeName}`;
  const text = `${kind} بانتظار التفعيل في كليب كات.\n\nالمتجر: ${storeName}\nالتاجر: @${username}\nالخطة: ${plan}\n\nللمراجعة والتفعيل افتح لوحة الإدارة:\n${link}\n\nكليب كات`;
  const html = layout(subject, `<p><b>${escHtml(kind)}</b> بانتظار التفعيل في كليب كات.</p>
<table role="presentation" cellpadding="6" style="font-size:15px"><tr><td style="color:#555">المتجر:</td><td><b>${escHtml(storeName)}</b></td></tr>
<tr><td style="color:#555">التاجر:</td><td><b dir="ltr">@${escHtml(username)}</b></td></tr>
<tr><td style="color:#555">الخطة:</td><td><b>${escHtml(plan)}</b></td></tr></table>
${button(link, 'فتح لوحة الإدارة')}
<p style="font-size:13px;color:#555">إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span dir="ltr" style="word-break:break-all;color:#1d4ed8">${escHtml(link)}</span></p>`);
  return { subject, text, html };
}

// حدود البريد (في الذاكرة)
const perOwner = new Map(); const sentTimes = [];
const OWNER_GAP_MS = 10 * 60000, HOUR_MAX = 20;
function allowEmail(ownerId, now = Date.now()) {
  while (sentTimes.length && now - sentTimes[0] > 3600000) sentTimes.shift();
  if (sentTimes.length >= HOUR_MAX) return false;
  if (now - (perOwner.get(ownerId) || 0) < OWNER_GAP_MS) return false;
  perOwner.set(ownerId, now); sentTimes.push(now);
  if (perOwner.size > 5000) perOwner.clear();
  return true;
}

// يُستدعى بعد حفظ الإيجار (pending) — لا يرمي أبداً ولا يؤخر الرد
export function alertNewRental({ storeId, storeName, ownerId, username, planId, amount, renew = false }) {
  setImmediate(async () => {
    try {
      const text = `${renew ? 'طلب تجديد متجر بانتظار التفعيل' : ALERT_PREFIX}: ${String(storeName).slice(0, 40)} (@${username})`;
      const r = await q("insert into notifications (user_id, type, from_id, text) select id, 'system', $1, $2 from profiles where is_admin and not is_banned and id <> $1", [ownerId, text]);
      console.log(`[alert] rental request store=${storeId} user=${ownerId} admins_notified=${r.rowCount}`);
    } catch (e) { console.warn('[alert] admin notification failed:', String(e.message || e).slice(0, 200)); }
    const to = alertEmailTo();
    if (!to) return;
    if (!allowEmail(ownerId)) { console.log(`[alert] email skipped (rate limit) user=${ownerId}`); return; }
    try {
      const res = await sendMail({ to, ...alertEmail({ storeName, username, planId, amount, renew }) });
      if (res.sent) console.log(`[mail] admin alert sent (${res.mode}${res.via ? ' via ' + res.via : ''}) to ${maskEmail(to)}${res.response ? ' — ' + String(res.response).slice(0, 120) : ''}`);
    } catch (e) { console.warn(`[mail] admin alert failed to ${maskEmail(to)}:`, e.responseCode || '', String(e.message || e).slice(0, 200)); }
  });
}

// ===== رابط دفع الإيجار: بريد لصاحب المتجر (عربي، DKIM، في الخلفية، بدون أي أثر على الطلب) =====
export const PAYLINK_TEXT = 'رابط دفع إيجار متجرك جاهز';
export function payLinkEmail({ name, username, storeName, planId, amount }) {
  const link = `${siteUrl()}/#/dashboard`;
  const amt = `${Number(amount).toFixed(3)} د.ك`;
  const subject = `رابط دفع إيجار متجرك جاهز — ${storeName}`;
  const text = `مرحباً ${name || username}،\n\nرابط دفع إيجار متجرك «${storeName}» في كليب كات جاهز.\nالخطة: ${PLAN_AR[planId] || planId}\nالمبلغ: ${amt}\n\nافتح لوحة متجرك واضغط «ادفع الإيجار»:\n${link}\n\nبعد الدفع سيتم تفعيل متجرك من الإدارة.\n\nكليب كات`;
  const html = layout(subject, `<p>مرحباً ${escHtml(name || username)}،</p><p>رابط دفع إيجار متجرك <b>${escHtml(storeName)}</b> في كليب كات جاهز.</p>
<table role="presentation" cellpadding="6" style="font-size:15px"><tr><td style="color:#555">الخطة:</td><td><b>${escHtml(PLAN_AR[planId] || planId)}</b></td></tr>
<tr><td style="color:#555">المبلغ:</td><td><b>${escHtml(amt)}</b></td></tr></table>
${button(link, 'فتح لوحة متجري')}
<p style="font-size:13px;color:#555">بعد الدفع سيتم تفعيل متجرك من الإدارة. إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span dir="ltr" style="word-break:break-all;color:#1d4ed8">${escHtml(link)}</span></p>`);
  return { subject, text, html };
}
const payLinkSent = new Map();
export function emailPaymentLink({ rentalId, ownerId, storeId, planId, amount }) {
  setImmediate(async () => {
    try {
      const now = Date.now();
      if (now - (payLinkSent.get(rentalId) || 0) < 5 * 60000) { console.log(`[mail] payment-link email skipped (rate limit) rental=${rentalId}`); return; }
      const u = (await q('select email, username, name, is_banned from profiles where id = $1', [ownerId])).rows[0];
      const st = (await q('select name from stores where id = $1', [storeId])).rows[0];
      if (!u || u.is_banned || !u.email || !st) return;
      payLinkSent.set(rentalId, now); if (payLinkSent.size > 5000) payLinkSent.clear();
      const r = await sendMail({ to: u.email, ...payLinkEmail({ name: u.name, username: u.username, storeName: st.name, planId, amount }) });
      if (r.sent) console.log(`[mail] payment-link email sent (${r.mode}${r.via ? ' via ' + r.via : ''}) to ${maskEmail(u.email)} rental=${rentalId}${r.response ? ' — ' + String(r.response).slice(0, 120) : ''}`);
    } catch (e) { console.warn(`[mail] payment-link email failed rental=${rentalId}:`, e.responseCode || '', String(e.message || e).slice(0, 200)); }
  });
}
