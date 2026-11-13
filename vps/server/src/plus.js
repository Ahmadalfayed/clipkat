// © 2026 وطن النهار — اشتراك «كليب كات بلس» الشهري: تنزيل المقاطع بدون شعار.
// الدفع بإحدى طريقتين:
//   1) مال: PLUS_MONTHLY_KWD (افتراضياً 0.500 د.ك) عبر واجهة مزوّدي الدفع نفسها (coin-payments.js — تجريبي الآن، جاهز لـ Tap)
//   2) عملات من المحفظة: PLUS_MONTHLY_COINS (افتراضياً 170) — قيد واحد ذرّي في coin_ledger من نوع 'subscription'،
//      والعملات المدفوعة إيراد للمنصة (لا تُضاف لأي مستخدم).
// كل شراء = PLUS_DAYS (30) يوماً. التجديد المبكر يبدأ من نهاية الاشتراك الحالي (يمدّ تاريخ الانتهاء ولا يضيع شيء).
// الانتهاء تلقائي: الاشتراك فعّال فقط إن كان now() بين starts_at و expires_at لصف بحالة 'active'.
// مفتاح idem_key فريد لكل مستخدم → إعادة نفس الطلب لا تخصم مرتين. قفل استشاري لكل مستخدم يمنع سباق طلبين مختلفين.
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { q, tx, pool } from './db.js';
import { requireUser, requireAdmin } from './auth.js';
import { HttpError, bad, isUuid, str, ms } from './util.js';
import { provider, isDemo } from './coin-payments.js';
import { debit, walletOf } from './gifts.js';
import { notify } from './rentals.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const N = (v) => Number(v || 0);
function rl(windowMs, max) { return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) }); }

export const plusPrice = () => ({ kwd: Number(config.plusMonthlyKwd.toFixed(3)), coins: Math.max(1, Math.round(config.plusMonthlyCoins)), days: Math.max(1, Math.round(config.plusDays)) });

export async function plusStatus(userId, db = pool) {
  if (!userId) return { active: false, startsAt: 0, expiresAt: 0 };
  const r = (await db.query(`select
      bool_or(starts_at <= now() and expires_at > now()) as active,
      min(starts_at) filter (where expires_at > now()) as starts_at,
      max(expires_at) filter (where expires_at > now()) as expires_at
    from plus_subscriptions where user_id = $1 and status = 'active'`, [userId])).rows[0];
  return { active: !!r?.active, startsAt: ms(r?.starts_at), expiresAt: r?.active ? ms(r.expires_at) : 0 };
}
export const isPlus = async (userId, db) => (await plusStatus(userId, db)).active;

const mapSub = (s) => ({ id: s.id, method: s.method, provider: s.provider, price: N(s.price), currency: s.currency, coins: s.coins, status: s.status, startsAt: ms(s.starts_at), expiresAt: ms(s.expires_at), note: s.note || '', createdAt: ms(s.created_at) });

// إضافة فترة اشتراك داخل معاملة c (مع قفل المستخدم). البداية = max(الآن، نهاية الاشتراك الحالي)
async function addPeriod(c, userId, { method, prov, price = 0, coins = 0, days, key = null, ref = null, grantedBy = null, note = '' }) {
  const row = (await c.query(`insert into plus_subscriptions (user_id, starts_at, expires_at, method, provider, price, coins, status, provider_ref, idem_key, granted_by, note)
    select $1, s, s + make_interval(days => $2::int), $3, $4, $5, $6, 'active', $7, $8, $9, $10
    from (select greatest(now(), coalesce((select max(expires_at) from plus_subscriptions where user_id = $1 and status = 'active'), now())) as s) x
    on conflict (user_id, idem_key) where idem_key is not null do nothing returning *`,
  [userId, days, method, prov, price, coins, ref, key, grantedBy, String(note || '').slice(0, 200)])).rows[0];
  return row || null;
}
const lockUser = (c, userId) => c.query("select pg_advisory_xact_lock(hashtext('plus:' || $1::text))", [userId]);

export async function subscribeWithCoins(userId, key) {
  const p = plusPrice();
  return tx(async (c) => {
    await lockUser(c, userId);
    if (key) { const ex = (await c.query('select * from plus_subscriptions where user_id = $1 and idem_key = $2', [userId, key])).rows[0]; if (ex) return { duplicate: true, sub: ex }; }
    const sub = await addPeriod(c, userId, { method: 'coins', prov: 'coins', coins: p.coins, days: p.days, key, note: 'plus monthly' });
    // الخصم في نفس المعاملة: إن لم يكفِ الرصيد يُرمى 402 وتُلغى إضافة الاشتراك بالكامل
    const left = await debit(c, userId, 'coins', p.coins, 'subscription', { refId: sub.id, note: 'ClipKat Plus' });
    return { sub, coinsLeft: left };
  });
}

export function buildPlusRouter() {
  const r = express.Router();

  r.get('/plus', h(async (req, res) => {
    const p = plusPrice(); const me = req.user?.id;
    const out = { price: p, demo: isDemo(), provider: provider().name };
    if (!me) return res.json({ ...out, status: { active: false, startsAt: 0, expiresAt: 0 } });
    const [status, wallet, hist] = await Promise.all([plusStatus(me), walletOf(me), q('select * from plus_subscriptions where user_id = $1 order by created_at desc limit 10', [me])]);
    res.json({ ...out, status, coins: wallet.coins, history: hist.rows.map(mapSub) });
  }));

  r.post('/plus/subscribe', requireUser, rl(60000, 10), h(async (req, res) => {
    const me = req.user.id; const b = req.body || {};
    const method = b.method === 'coins' ? 'coins' : b.method === 'money' ? 'money' : null;
    if (!method) throw bad('bad');
    const key = b.key == null ? null : str(b.key, 64);
    if (key !== null && !KEY_RE.test(key)) throw bad('bad');
    const p = plusPrice();
    if (method === 'coins') {
      const out = await subscribeWithCoins(me, key);
      const status = await plusStatus(me);
      return res.status(out.duplicate ? 200 : 201).json({ duplicate: !!out.duplicate, sub: mapSub(out.sub), status, coins: (await walletOf(me)).coins });
    }
    // دفع بالمال عبر المزوّد المضبوط (التجريبي يوافق فوراً ولا يخصم شيئاً)
    const prov = provider();
    if (!prov.configured()) throw new HttpError(503, 'payNotConfigured');
    if (key) { const ex = (await q('select * from plus_subscriptions where user_id = $1 and idem_key = $2', [me, key])).rows[0]; if (ex) return res.json({ duplicate: true, sub: mapSub(ex), status: await plusStatus(me), demo: !prov.live }); }
    const purchase = { id: `plus-${me.slice(0, 8)}-${Date.now().toString(36)}`, price: p.kwd, currency: 'KWD', kind: 'plus' };
    const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const charge = await prov.createCharge({ purchase, user: req.user, returnUrl: `${base}/#/settings?plus=1`, webhookUrl: `${base}/api/coins/webhook/${prov.name}?plus=1` });
    if (charge.status !== 'paid') throw new HttpError(503, 'payNotReady', { provider: prov.name });   // مزوّد حقيقي: يُكمَل لاحقاً مع Tap
    const sub = await tx(async (c) => {
      await lockUser(c, me);
      return (await addPeriod(c, me, { method: 'money', prov: prov.name, price: p.kwd, days: p.days, key, ref: charge.ref, note: 'plus monthly' }))
        || (await c.query('select * from plus_subscriptions where user_id = $1 and idem_key = $2', [me, key])).rows[0];
    });
    res.status(201).json({ sub: mapSub(sub), status: await plusStatus(me), demo: !prov.live });
  }));

  // ---------------- الإدارة ----------------
  const userByRef = async (ref) => {
    const s = String(ref || '').trim().replace(/^@/, '');
    const row = (await q(isUuid(s) ? 'select id, username from profiles where id = $1' : 'select id, username from profiles where lower(username) = lower($1)', [s])).rows[0];
    if (!row) throw new HttpError(404, 'notfound'); return row;
  };
  r.get('/admin/plus', requireAdmin, h(async (_req, res) => {
    const subs = (await q(`select p.id, p.username, p.name, max(s.expires_at) as expires_at, min(s.starts_at) as starts_at
      from plus_subscriptions s join profiles p on p.id = s.user_id
      where s.status = 'active' and s.expires_at > now() group by p.id order by max(s.expires_at) desc limit 200`)).rows;
    const t = (await q(`select
      coalesce(sum(price) filter (where method = 'money' and provider <> 'demo'), 0) as money_kwd,
      coalesce(sum(price) filter (where method = 'money' and provider = 'demo'), 0) as demo_kwd,
      coalesce(sum(coins) filter (where method = 'coins'), 0)::int as coins,
      count(*) filter (where method = 'money')::int as money_n, count(*) filter (where method = 'coins')::int as coins_n, count(*) filter (where method = 'admin')::int as admin_n
      from plus_subscriptions where status in ('active','revoked')`)).rows[0];
    const dl = (await q(`select count(*) filter (where kind = 'wm')::int as wm, count(*) filter (where kind = 'nowm')::int as nowm from video_downloads`)).rows[0];
    res.json({ price: plusPrice(), demo: isDemo(), subscribers: subs.map((x) => ({ id: x.id, username: x.username, name: x.name || x.username, startsAt: ms(x.starts_at), expiresAt: ms(x.expires_at) })),
      totals: { moneyKwd: N(t.money_kwd), demoKwd: N(t.demo_kwd), coins: t.coins, moneyCount: t.money_n, coinsCount: t.coins_n, adminCount: t.admin_n, active: subs.length, downloadsWm: dl.wm, downloadsNowm: dl.nowm } });
  }));
  r.post('/admin/plus/grant', requireAdmin, h(async (req, res) => {
    const u = await userByRef(req.body?.user);
    const days = Number(req.body?.days ?? config.plusDays);
    if (!Number.isInteger(days) || days < 1 || days > 366) throw bad('bad');
    await tx(async (c) => { await lockUser(c, u.id); await addPeriod(c, u.id, { method: 'admin', prov: 'admin', days, grantedBy: req.user.id, note: str(req.body?.note || 'admin grant', 200) });
      await notify(c, { userId: u.id, type: 'system', text: `🎉 تم تفعيل «كليب كات بلس» لك لمدة ${days} يوماً — تنزيل بدون شعار.` }); });
    res.status(201).json({ user: u, status: await plusStatus(u.id) });
  }));
  r.post('/admin/plus/revoke', requireAdmin, h(async (req, res) => {
    const u = await userByRef(req.body?.user);
    const n = (await q(`update plus_subscriptions set status = 'revoked', note = left(note || ' · revoked by admin', 200) where user_id = $1 and status = 'active' and expires_at > now()`, [u.id])).rowCount;
    res.json({ user: u, revoked: n, status: await plusStatus(u.id) });
  }));
  return r;
}
