// © 2026 وطن النهار — «نسيت كلمة السر؟»: استعادة كلمة المرور بالبريد
//  POST /auth/forgot        { email }            → دائماً نفس الرد المحايد (لا يكشف هل البريد مسجّل)
//  POST /auth/reset/check   { token }            → { valid }
//  POST /auth/reset         { token, password }  → يغيّر كلمة المرور ويُبطل كل الجلسات (token_version + 1)
// الحماية: حد لكل IP + حد لكل بريد، رمز عشوائي 256 بت يُخزَّن sha256 فقط، صلاحية 30 دقيقة، لمرة واحدة،
// وطلب رمز جديد يُبطل الرموز السابقة. حسابات Google بلا كلمة مرور تصلها رسالة «سجّل الدخول بـ Google».
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, tx, pool } from './db.js';
import { clearSession } from './auth.js';
import { HttpError, bad, str, hashPassword } from './util.js';
import { sendMail, maskEmail } from './mailer.js';
import { notify } from './rentals.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
export const RESET_TTL_MIN = 30;
const IP_MAX = num(env.RESET_RATE_IP_MAX, 5);          // طلبات «نسيت» لكل IP كل 15 دقيقة
const EMAIL_MAX = num(env.RESET_RATE_EMAIL_MAX, 3);    // رسائل لكل حساب كل ساعة
const TRY_MAX = num(env.RESET_RATE_TRY_MAX, 20);       // محاولات استخدام الرمز لكل IP كل 15 دقيقة
const limitMsg = 'محاولات كثيرة — انتظر قليلاً ثم حاول مرة أخرى';
const mkLimit = (windowMs, max) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => res.status(429).json({ error: limitMsg }) });

export const NEUTRAL = 'إذا كان هذا البريد مسجّلاً في كليب كات، ستصلك رسالة خلال دقائق فيها طريقة استعادة حسابك. تحقّق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها.';
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const isGoogleOnly = (row) => !String(row.password_hash || '').startsWith('scrypt$');
const siteUrl = () => config.publicUrl || (env.DOMAIN ? `https://${env.DOMAIN}` : '');
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, bodyHtml) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title></head>
<body style="margin:0;background:#f7f5f0;font-family:Tahoma,Arial,sans-serif;color:#1d2433;direction:rtl;text-align:right">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #ece7dc">
<tr><td style="font-size:22px;font-weight:bold;color:#0e9f84;padding-bottom:12px">كليب كات</td></tr>
<tr><td style="font-size:15px;line-height:1.9">${bodyHtml}</td></tr>
<tr><td style="font-size:12px;color:#8a8f99;padding-top:20px;border-top:1px solid #eee">رسالة آلية من كليب كات — لا ترد عليها.<br>جميع الحقوق محفوظة © 2026 وطن النهار</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label) => `<p style="text-align:center;margin:24px 0"><a href="${escHtml(href)}" style="background:#0e9f84;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:12px;font-weight:bold;display:inline-block">${escHtml(label)}</a></p>`;

export function resetEmail(user, link) {
  const hi = `مرحباً ${escHtml(user.name || user.username)}،`;
  const subject = 'استعادة كلمة المرور في كليب كات';
  const text = `مرحباً ${user.name || user.username}،\n\nوصلنا طلب لتغيير كلمة المرور لحسابك @${user.username} في كليب كات.\nلاختيار كلمة مرور جديدة افتح هذا الرابط (صالح لمدة ${RESET_TTL_MIN} دقيقة ولمرة واحدة فقط):\n\n${link}\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة، وكلمة المرور الحالية تبقى كما هي.\n\nكليب كات`;
  const html = layout(subject, `<p>${hi}</p><p>وصلنا طلب لتغيير كلمة المرور لحسابك <b dir="ltr">@${escHtml(user.username)}</b> في كليب كات.</p>
${button(link, 'اختيار كلمة مرور جديدة')}
<p style="font-size:13px;color:#555">الرابط صالح لمدة ${RESET_TTL_MIN} دقيقة ولمرة واحدة فقط. إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span dir="ltr" style="word-break:break-all;color:#1d4ed8">${escHtml(link)}</span></p>
<p style="font-size:13px;color:#555">إذا لم تطلب ذلك فتجاهل هذه الرسالة، وكلمة المرور الحالية تبقى كما هي.</p>`);
  return { subject, text, html };
}
export function googleEmail(user, loginLink) {
  const subject = 'تسجيل الدخول إلى كليب كات';
  const text = `مرحباً ${user.name || user.username}،\n\nوصلنا طلب لاستعادة كلمة المرور لحسابك @${user.username} في كليب كات.\nحسابك مسجّل بحساب Google ولا يستخدم كلمة مرور، لذلك لا تحتاج إلى استعادتها.\nلتسجيل الدخول افتح صفحة الدخول واضغط «المتابعة باستخدام Google» واختر نفس حساب Google:\n\n${loginLink}\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.\n\nكليب كات`;
  const html = layout(subject, `<p>مرحباً ${escHtml(user.name || user.username)}،</p><p>وصلنا طلب لاستعادة كلمة المرور لحسابك <b dir="ltr">@${escHtml(user.username)}</b> في كليب كات.</p>
<p>حسابك مسجّل <b>بحساب Google</b> ولا يستخدم كلمة مرور، لذلك لا تحتاج إلى استعادتها. لتسجيل الدخول اضغط «المتابعة باستخدام Google» في صفحة الدخول واختر نفس حساب Google.</p>
${button(loginLink, 'الذهاب إلى صفحة الدخول')}
<p style="font-size:13px;color:#555">إذا لم تطلب ذلك فتجاهل هذه الرسالة.</p>`);
  return { subject, text, html };
}

// الإرسال في الخلفية: زمن الرد واحد سواء كان البريد مسجّلاً أم لا
const sendLater = (to, mail) => setImmediate(() => {
  sendMail({ to, ...mail }).then((r) => { if (r.sent) console.log(`[mail] reset mail sent (${r.mode}${r.via ? ' via ' + r.via : ''}) to ${maskEmail(to)}`); })
    .catch((e) => console.warn(`[mail] reset mail failed to ${maskEmail(to)}:`, e.responseCode || '', String(e.message || e).slice(0, 200)));
});

async function issue(email) {
  const row = (await q('select id, email, username, name, password_hash, is_banned from profiles where lower(email) = $1', [email])).rows[0];
  if (!row || row.is_banned) return;
  const recent = (await q("select count(*)::int n from password_resets where user_id = $1 and created_at > now() - interval '1 hour'", [row.id])).rows[0].n;
  if (recent >= EMAIL_MAX) return;                                    // حد لكل بريد — بصمت (نفس الرد)
  const base = siteUrl();
  if (!base) { console.warn('[reset] PUBLIC_URL not set — cannot build the reset link'); return; }
  if (isGoogleOnly(row)) {
    await q("insert into password_resets (user_id, kind, expires_at) values ($1, 'google', now())", [row.id]);
    return sendLater(row.email, googleEmail(row, `${base}/#/login`));
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await tx(async (c) => {
    await c.query("update password_resets set used_at = now() where user_id = $1 and kind = 'reset' and used_at is null", [row.id]);   // رابط واحد فعّال فقط
    await c.query(`insert into password_resets (user_id, kind, token_hash, expires_at) values ($1, 'reset', $2, now() + interval '${RESET_TTL_MIN} minutes')`, [row.id, hashToken(token)]);
  });
  sendLater(row.email, resetEmail(row, `${base}/#/reset?t=${token}`));
}

const tokenOf = (v) => (typeof v === 'string' && TOKEN_RE.test(v) ? v : null);

export function buildPasswordResetRouter() {
  const r = express.Router();
  r.post('/auth/forgot', mkLimit(15 * 60000, IP_MAX), h(async (req, res) => {
    const email = str(req.body?.email, 120, { min: 3 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('bad');
    try { await issue(email); } catch (e) { console.warn('[reset] issue failed:', e.message); }
    res.json({ ok: true, message: NEUTRAL });
  }));
  const tryLimit = mkLimit(15 * 60000, TRY_MAX);
  r.post('/auth/reset/check', tryLimit, h(async (req, res) => {
    const t = tokenOf(req.body?.token);
    const ok = t ? (await q("select 1 from password_resets pr join profiles p on p.id = pr.user_id where pr.token_hash = $1 and pr.kind = 'reset' and pr.used_at is null and pr.expires_at > now() and not p.is_banned", [hashToken(t)])).rowCount > 0 : false;
    res.json({ valid: ok });
  }));
  r.post('/auth/reset', tryLimit, h(async (req, res) => {
    const t = tokenOf(req.body?.token);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8 || password.length > 128) throw bad('password');
    if (req.body?.confirm !== undefined && req.body.confirm !== password) throw bad('mismatch');
    if (!t) throw bad('resetInvalid');
    const hash = await hashPassword(password);
    const user = await tx(async (c) => {
      // استهلاك ذرّي: طلبان متزامنان بنفس الرمز → واحد فقط ينجح
      const used = (await c.query("update password_resets set used_at = now() where token_hash = $1 and kind = 'reset' and used_at is null and expires_at > now() returning user_id", [hashToken(t)])).rows[0];
      if (!used) return null;
      const u = (await c.query('update profiles set password_hash = $1, token_version = token_version + 1 where id = $2 and not is_banned returning id, username', [hash, used.user_id])).rows[0];
      if (!u) return null;
      await c.query('update password_resets set used_at = now() where user_id = $1 and used_at is null', [u.id]);
      return u;
    });
    if (!user) throw bad('resetInvalid');
    try { await notify(pool, { userId: user.id, type: 'system', text: 'تم تغيير كلمة المرور لحسابك وتسجيل الخروج من كل الأجهزة 🔒' }); } catch {}
    clearSession(res);
    res.json({ ok: true });
  }));
  return r;
}
