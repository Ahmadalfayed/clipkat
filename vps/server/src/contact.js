// © 2026 وطن النهار — رقم واتساب الإدارة يُحفظ في القاعدة ولا يُعاد أبداً في واجهة عامة أو في HTML/JS.
// الصفحات ترى فقط whatsappEnabled، والزر يفتح GET /api/contact/whatsapp الذي يحوّل (302) إلى wa.me مع رسالة جاهزة.
import express from 'express';
import rateLimit from 'express-rate-limit';
import { q } from './db.js';
import { requireUser, requireAdmin } from './auth.js';
import { HttpError, bad, isUuid, str, normAdminWhatsApp } from './util.js';
import { config } from './config.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uid = (s) => { if (!isUuid(s)) throw bad('bad'); return s; };
const PLAN_AR = { weekly: 'أسبوعي', monthly: 'شهري', yearly: 'سنوي' };
const siteUrl = () => config.publicUrl || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'https://clipkat.live');

export async function getAdminWhatsapp() {
  const row = (await q('select admin_whatsapp from app_settings where id = 1')).rows[0];
  return row?.admin_whatsapp || null;
}
export async function whatsappEnabled() { return !!(await getAdminWhatsapp()); }

export async function setAdminWhatsapp(raw) {
  const url = normAdminWhatsApp(raw);
  await q('update app_settings set admin_whatsapp = $1 where id = 1', [url]);
  return url;
}

function coinMsg({ username, id, amount, coins }) {
  return `السلام عليكم، أنا @${username} في كليب كات. بخصوص طلب شراء العملات رقم ${String(id).slice(0, 8)} بمبلغ ${Number(amount).toFixed(3)} د.ك (${coins} عملة).`;
}
function rentalMsg({ username, id, amount, planId }) {
  return `السلام عليكم، أنا @${username} في كليب كات. بخصوص طلب إيجار المتجر رقم ${String(id).slice(0, 8)} بمبلغ ${Number(amount).toFixed(3)} د.ك${planId ? ` (خطة ${PLAN_AR[planId] || planId})` : ''}.`;
}

function bounce(res, hash) {
  const base = siteUrl().replace(/\/$/, '');
  res.redirect(302, `${base}/${hash}`);
}

export function buildContactRouter() {
  const r = express.Router();
  const waLimit = rateLimit({ windowMs: 10 * 60000, max: 20, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) });

  // عام: قيمة منطقية فقط — بلا رقم
  r.get('/contact/status', h(async (_req, res) => res.json({ whatsappEnabled: await whatsappEnabled() })));

  // مشرف فقط: الرقم يظهر هنا كي يُملأ حقل الإعداد
  r.get('/admin/settings', requireAdmin, h(async (_req, res) => {
    const url = await getAdminWhatsapp();
    res.json({ adminWhatsapp: url, whatsappEnabled: !!url });
  }));
  r.post('/admin/settings/whatsapp', requireAdmin, h(async (req, res) => {
    const raw = req.body?.number ?? req.body?.url ?? req.body?.adminWhatsapp ?? '';
    let url;
    try { url = await setAdminWhatsapp(str(raw, 300) || ''); }
    catch (e) { if (e instanceof HttpError) { e.field = 'adminWhatsapp'; } throw e; }
    res.json({ adminWhatsapp: url, whatsappEnabled: !!url });
  }));

  // تحويل مصادق: يبني wa.me على الخادم ولا يُرجع الرقم في جسم الرد
  r.get('/contact/whatsapp', requireUser, waLimit, h(async (req, res) => {
    const ctx = String(req.query.ctx || '');
    const id = String(req.query.id || '');
    if (!['rental', 'coins'].includes(ctx) || !isUuid(id)) return bounce(res, ctx === 'rental' ? '#/dashboard?wa=0' : '#/coins?wa=0');
    const wa = await getAdminWhatsapp();
    if (!wa) return bounce(res, ctx === 'rental' ? '#/dashboard?wa=0' : '#/coins?wa=0');
    let msg;
    if (ctx === 'coins') {
      const row = (await q('select r.*, p.username from coin_pay_requests r join profiles p on p.id = r.user_id where r.id = $1', [uid(id)])).rows[0];
      if (!row || (row.user_id !== req.user.id && !req.user.is_admin)) return bounce(res, '#/coins?wa=0');
      msg = coinMsg({ username: row.username, id: row.id, amount: row.price, coins: row.coins });
    } else {
      const row = (await q('select r.*, p.username from rentals r join profiles p on p.id = r.owner_id where r.id = $1', [uid(id)])).rows[0];
      if (!row || (row.owner_id !== req.user.id && !req.user.is_admin)) return bounce(res, '#/dashboard?wa=0');
      msg = rentalMsg({ username: row.username, id: row.id, amount: row.amount, planId: row.plan_id });
    }
    const loc = `${wa}?text=${encodeURIComponent(msg)}`;
    console.log(`[contact] whatsapp redirect ctx=${ctx} user=${req.user.id} id=${id}`);
    res.redirect(302, loc);
  }));

  return r;
}
