// © 2026 وطن النهار — العملات وهدايا البث المباشر وأرباح صنّاع المحتوى.
// مصدر ربح كليب كات الوحيد هنا هو نصيبها من هدايا البث (GIFT_PLATFORM_SHARE، افتراضياً 50٪).
// مبيعات المتاجر بين التاجر والمشتري لا تمر بهذا الملف ولا تُقتطع منها أي عمولة.
//
// قواعد السلامة المالية:
// - كل تغيير رصيد داخل معاملة واحدة مع سطر في coin_ledger (يُسجَّل الرصيد بعد الحركة).
// - الخصم بشرط "الرصيد ≥ المبلغ" في نفس جملة UPDATE + قيد CHECK (>= 0) في القاعدة → لا أرصدة سالبة.
// - مفتاح client_key فريد لكل مرسل → إعادة الطلب نفسه لا تخصم مرتين.
// - السعر يُقرأ من جدول gifts في الخادم فقط؛ ما يرسله المتصفح من أسعار يُتجاهل.
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { q, tx, pool } from './db.js';
import { requireUser, requireAdmin } from './auth.js';
import { HttpError, bad, isUuid, str, ms } from './util.js';
import { visibleLive, sendLive } from './rtc.js';
import { provider, providers, isDemo } from './coin-payments.js';
import { notify } from './rentals.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (v, code = 'notfound') => { if (!v) throw new HttpError(404, code); return v; };
const uid = (s) => { if (!isUuid(s)) throw bad('bad'); return s; };
const N = (v) => Number(v || 0);
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CUR = new Set(['coins', 'diamonds']);
function rl(windowMs, max) { return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) }); }
const intIn = (v, min, max, code = 'bad') => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw bad(code); return n; };

// نصيب المضيف (ألماس) ونصيب المنصة (عملات) — المضيف يأخذ الجزء الصحيح، والباقي للمنصة
export function splitGift(coins, sharePct = config.giftPlatformShare) {
  const diamonds = Math.floor((coins * (100 - sharePct)) / 100);
  return { diamonds, platform: coins - diamonds };
}

// ---------------- عمليات الرصيد (تُستدعى داخل معاملة c) ----------------
async function ledger(c, { userId, currency, delta, after, kind, refId = null, actorId = null, note = '' }) {
  await c.query('insert into coin_ledger (user_id, currency, delta, balance_after, kind, ref_id, actor_id, note) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [userId, currency, delta, after, kind, refId, actorId, String(note || '').slice(0, 200)]);
}
export async function credit(c, userId, currency, amount, kind, opts = {}) {
  if (!CUR.has(currency) || !Number.isInteger(amount) || amount <= 0) throw bad('bad');
  const after = N((await c.query(`insert into wallets (user_id, ${currency}) values ($1, $2)
    on conflict (user_id) do update set ${currency} = wallets.${currency} + excluded.${currency}, updated_at = now() returning ${currency} as v`, [userId, amount])).rows[0].v);
  await ledger(c, { userId, currency, delta: amount, after, kind, ...opts });
  return after;
}
export async function debit(c, userId, currency, amount, kind, opts = {}) {
  if (!CUR.has(currency) || !Number.isInteger(amount) || amount <= 0) throw bad('bad');
  const row = (await c.query(`update wallets set ${currency} = ${currency} - $2, updated_at = now() where user_id = $1 and ${currency} >= $2 returning ${currency} as v`, [userId, amount])).rows[0];
  if (!row) {
    const have = N((await c.query(`select ${currency} as v from wallets where user_id = $1`, [userId])).rows[0]?.v);
    throw new HttpError(402, 'insufficient', { balance: have });
  }
  const after = N(row.v);
  await ledger(c, { userId, currency, delta: -amount, after, kind, ...opts });
  return after;
}
export async function walletOf(userId, db = pool) {
  const w = (await db.query('select coins, diamonds from wallets where user_id = $1', [userId])).rows[0];
  return { coins: N(w?.coins), diamonds: N(w?.diamonds) };
}

// ---------------- خرائط ----------------
const mapPkg = (p) => ({ id: p.id, coins: p.coins, bonus: p.bonus, total: p.coins + p.bonus, price: N(p.price), currency: 'KWD' });
const mapGift = (g) => ({ id: g.id, nameAr: g.name_ar, nameEn: g.name_en, emoji: g.emoji, coins: g.coins, tier: g.tier });
const mini = (u) => (u ? { id: u.id, username: u.username, name: u.name, avatar: u.avatar_url || null } : null);
const usersById = async (ids) => {
  ids = [...new Set(ids.filter(Boolean))]; if (!ids.length) return new Map();
  return new Map((await q('select id, username, name, avatar_url from profiles where id = any($1::uuid[])', [ids])).rows.map((u) => [u.id, mini(u)]));
};
const mapLedger = (r) => ({ id: String(r.id), currency: r.currency, delta: N(r.delta), balance: N(r.balance_after), kind: r.kind, note: r.note || '', refId: r.ref_id, createdAt: ms(r.created_at) });
const mapPayout = (p, u) => ({ id: p.id, userId: p.user_id, diamonds: N(p.diamonds), amount: N(p.amount), method: p.method, accountName: p.account_name, account: p.account, note: p.note, status: p.status, demo: p.demo,
  adminNote: p.admin_note, createdAt: ms(p.created_at), decidedAt: ms(p.decided_at), user: u || null });

let giftCache = null, giftCacheAt = 0;
async function catalog() {
  if (!giftCache || Date.now() - giftCacheAt > 60000) { giftCache = (await q('select * from gifts where active order by sort, coins')).rows; giftCacheAt = Date.now(); }
  return giftCache;
}
async function topGifters(liveId, limit = 5) {
  const rows = (await q(`select sender_id, sum(coins)::bigint as coins from live_gifts where live_id = $1 group by sender_id order by sum(coins) desc, min(created_at) limit $2`, [liveId, limit])).rows;
  const users = await usersById(rows.map((r) => r.sender_id));
  return rows.map((r) => ({ user: users.get(r.sender_id) || null, coins: N(r.coins) }));
}

// اعتماد عملية شراء مدفوعة (مرة واحدة فقط لكل عملية)
export async function fulfillPurchase(purchaseId, ref = null) {
  return tx(async (c) => {
    const p = (await c.query("update coin_purchases set status = 'paid', paid_at = now(), provider_ref = coalesce($2, provider_ref) where id = $1 and status = 'pending' returning *", [purchaseId, ref])).rows[0];
    if (!p) return null;
    await credit(c, p.user_id, 'coins', p.coins, 'purchase', { refId: p.id, note: p.provider === 'demo' ? 'demo' : p.provider });
    return p;
  });
}

const publicCfg = async () => ({
  packages: (await q('select * from coin_packages where active order by sort, price')).rows.map(mapPkg),
  gifts: (await catalog()).map(mapGift),
  demo: isDemo(), provider: provider().name, providerReady: provider().configured(),
  platformShare: config.giftPlatformShare, diamondKwd: config.diamondKwd, payoutMinDiamonds: config.payoutMinDiamonds, demoDailyMax: isDemo() ? config.demoCoinsDailyMax : null
});

export function buildGiftsRouter() {
  const r = express.Router();
  const giftLimit = rl(10000, config.giftRateMax);

  r.get('/coins/config', h(async (_req, res) => res.json(await publicCfg())));

  r.get('/wallet', requireUser, h(async (req, res) => {
    const w = await walletOf(req.user.id);
    const led = (await q("select * from coin_ledger where user_id = $1 and currency = 'coins' order by id desc limit 40", [req.user.id])).rows.map(mapLedger);
    res.json({ ...w, demo: isDemo(), ledger: led });
  }));

  // ---------------- شراء عملات ----------------
  r.post('/coins/purchase', requireUser, rl(60000, 12), h(async (req, res) => {
    const me = req.user.id; const b = req.body || {};
    const pkgId = str(b.packageId, 24); const key = b.key == null ? null : str(b.key, 64);
    if (key !== null && !KEY_RE.test(key)) throw bad('bad');
    const pkg = need((await q('select * from coin_packages where id = $1 and active', [pkgId])).rows[0], 'noPackage');
    const prov = provider();
    if (!prov.configured()) throw new HttpError(503, 'payNotConfigured');
    const total = pkg.coins + pkg.bonus;
    if (!prov.live) {
      const today = N((await q("select coalesce(sum(coins), 0) as s from coin_purchases where user_id = $1 and provider = 'demo' and status = 'paid' and created_at > now() - interval '24 hours'", [me])).rows[0].s);
      if (today + total > config.demoCoinsDailyMax) throw new HttpError(429, 'demoCap', { limit: config.demoCoinsDailyMax });
    }
    let p = (await q(`insert into coin_purchases (user_id, package_id, coins, price, provider, idem_key) values ($1,$2,$3,$4,$5,$6)
      on conflict (user_id, idem_key) where idem_key is not null do nothing returning *`, [me, pkg.id, total, pkg.price, prov.name, key])).rows[0];
    if (!p) {   // نفس الطلب أُرسل من قبل
      p = (await q('select * from coin_purchases where user_id = $1 and idem_key = $2', [me, key])).rows[0];
      return res.json({ duplicate: true, purchase: { id: p.id, status: p.status, coins: p.coins }, wallet: await walletOf(me), demo: !prov.live });
    }
    const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    let charge;
    try { charge = await prov.createCharge({ purchase: p, user: req.user, returnUrl: `${base}/api/coins/return?p=${p.id}`, webhookUrl: `${base}/api/coins/webhook/${prov.name}?p=${p.id}` }); }
    catch (e) { await q("update coin_purchases set status = 'failed' where id = $1 and status = 'pending'", [p.id]); throw e; }
    if (charge.status === 'paid') {
      await fulfillPurchase(p.id, charge.ref);
      return res.status(201).json({ purchase: { id: p.id, status: 'paid', coins: total }, wallet: await walletOf(me), demo: !prov.live });
    }
    await q('update coin_purchases set provider_ref = $2 where id = $1', [p.id, charge.ref || null]);
    res.status(201).json({ purchase: { id: p.id, status: 'pending', coins: total }, redirectUrl: charge.redirectUrl, demo: false });
  }));
  // عودة المستخدم من صفحة الدفع، وإشعار المزوّد (webhook) — يعملان فقط مع مزوّد حقيقي مفعّل
  const verifyAndFulfill = async (name, req) => {
    const prov = providers[name];
    if (!prov || !prov.live || name !== config.paymentProvider || !prov.configured()) throw new HttpError(404, 'notfound');
    const p = need((await q('select * from coin_purchases where id = $1 and provider = $2', [uid(String(req.query.p || '')), name])).rows[0]);
    if (p.status === 'paid') return p;
    const v = await prov.verify({ purchase: p, req });
    if (v.paid && Math.abs(N(v.amount) - N(p.price)) < 0.0005 && (v.currency || 'KWD') === p.currency) return (await fulfillPurchase(p.id, v.ref)) || p;
    return p;
  };
  r.post('/coins/webhook/:provider', h(async (req, res) => { await verifyAndFulfill(req.params.provider, req); res.json({ ok: true }); }));
  r.get('/coins/return', h(async (req, res) => {
    let ok = false; try { ok = (await verifyAndFulfill(config.paymentProvider, req)).status === 'paid'; } catch {}
    res.redirect(302, `/#/coins?paid=${ok ? 1 : 0}`);
  }));

  // ---------------- إرسال هدية في البث ----------------
  r.post('/live/:id/gifts', requireUser, giftLimit, h(async (req, res) => {
    const me = req.user.id; const b = req.body || {};
    const giftId = str(b.giftId, 24); const qty = b.qty === undefined ? 1 : intIn(b.qty, 1, 99); const key = str(b.key, 64);
    if (!KEY_RE.test(key)) throw bad('bad');
    const l = await visibleLive(req, req.params.id);
    if (l.status !== 'live') throw new HttpError(410, 'ended');
    if (l.user_id === me) throw bad('selfGift');
    const g = need((await catalog()).find((x) => x.id === giftId), 'noGift');
    const coins = g.coins * qty; const { diamonds, platform } = splitGift(coins);
    const out = await tx(async (c) => {
      const row = (await c.query(`insert into live_gifts (live_id, sender_id, host_id, gift_id, qty, coins, diamonds, platform_coins, client_key)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (sender_id, client_key) do nothing returning *`, [l.id, me, l.user_id, g.id, qty, coins, diamonds, platform, key])).rows[0];
      if (!row) return { duplicate: true, row: (await c.query('select * from live_gifts where sender_id = $1 and client_key = $2', [me, key])).rows[0] };
      const coinsLeft = await debit(c, me, 'coins', coins, 'gift_sent', { refId: row.id, note: `${g.id}×${qty}` });
      if (diamonds > 0) await credit(c, l.user_id, 'diamonds', diamonds, 'gift_received', { refId: row.id, actorId: me, note: `${g.id}×${qty}` });
      const lv = (await c.query("update lives set gift_coins = gift_coins + $2, gift_diamonds = gift_diamonds + $3 where id = $1 and status = 'live' returning gift_coins, gift_diamonds", [l.id, coins, diamonds])).rows[0];
      if (!lv) throw new HttpError(410, 'ended');
      return { row, coinsLeft, lv };
    });
    if (out.duplicate) return res.json({ duplicate: true, id: out.row?.id || null, wallet: await walletOf(me) });
    const sender = (await usersById([me])).get(me);
    const top = await topGifters(l.id);
    const msg = { id: out.row.id, gift: mapGift(g), qty, coins, from: sender, liveCoins: N(out.lv.gift_coins), liveDiamonds: N(out.lv.gift_diamonds) };
    await sendLive(l.id, { t: 'gift', g: msg, top });
    res.status(201).json({ ...msg, wallet: { coins: out.coinsLeft }, top });
  }));
  r.get('/live/:id/gifters', h(async (req, res) => {
    const l = await visibleLive(req, req.params.id);
    res.json({ top: await topGifters(l.id, 20), liveCoins: N(l.gift_coins), liveDiamonds: N(l.gift_diamonds) });
  }));

  // ---------------- أرباح صانع المحتوى والسحب ----------------
  r.get('/earnings', requireUser, h(async (req, res) => {
    const me = req.user.id; const w = await walletOf(me);
    const gifts = (await q('select * from live_gifts where host_id = $1 order by created_at desc limit 50', [me])).rows;
    const sum = (await q('select coalesce(sum(diamonds), 0) as d, count(*)::int as n from live_gifts where host_id = $1', [me])).rows[0];
    const payouts = (await q('select * from payout_requests where user_id = $1 order by created_at desc limit 20', [me])).rows;
    const users = await usersById(gifts.map((x) => x.sender_id));
    const cat = new Map((await q('select * from gifts')).rows.map((g) => [g.id, mapGift(g)]));
    res.json({ diamonds: w.diamonds, valueKwd: Math.round(w.diamonds * config.diamondKwd * 1000) / 1000, lifetimeDiamonds: N(sum.d), giftsCount: sum.n,
      diamondKwd: config.diamondKwd, payoutMinDiamonds: config.payoutMinDiamonds, platformShare: config.giftPlatformShare, demo: isDemo(),
      history: gifts.map((x) => ({ id: x.id, liveId: x.live_id, gift: cat.get(x.gift_id) || null, qty: x.qty, coins: x.coins, diamonds: x.diamonds, from: users.get(x.sender_id) || null, createdAt: ms(x.created_at) })),
      payouts: payouts.map((p) => mapPayout(p)) });
  }));
  r.post('/payouts', requireUser, rl(3600000, 6), h(async (req, res) => {
    const me = req.user.id; const b = req.body || {};
    const diamonds = intIn(b.diamonds, config.payoutMinDiamonds, 1e12, 'payoutMin');
    const method = ['bank', 'other'].includes(b.method) ? b.method : 'bank';
    const accountName = str(b.accountName, 80, { min: 2 }); const account = str(b.account, 60, { min: 4 }).replace(/\s+/g, ' ');
    const note = str(b.note, 300);
    const amount = Math.round(diamonds * config.diamondKwd * 1000) / 1000;
    const p = await tx(async (c) => {
      let row;
      try { row = (await c.query('insert into payout_requests (user_id, diamonds, amount, method, account_name, account, note, demo) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *', [me, diamonds, amount, method, accountName, account, note, isDemo()])).rows[0]; }
      catch (e) { if (e.code === '23505') throw new HttpError(409, 'payoutPending'); throw e; }
      await debit(c, me, 'diamonds', diamonds, 'payout_hold', { refId: row.id });
      return row;
    });
    res.status(201).json({ payout: mapPayout(p), wallet: await walletOf(me) });
  }));

  // ---------------- لوحة المشرف ----------------
  r.get('/admin/gifts', requireAdmin, h(async (_req, res) => {
    const tot = (await q('select coalesce(sum(coins),0) as coins, coalesce(sum(platform_coins),0) as platform, coalesce(sum(diamonds),0) as diamonds, count(*)::int as n from live_gifts')).rows[0];
    const pur = (await q("select provider, count(*)::int as n, coalesce(sum(coins),0) as coins, coalesce(sum(price),0) as kwd from coin_purchases where status = 'paid' group by provider")).rows;
    const grants = N((await q("select coalesce(sum(delta),0) as s from coin_ledger where kind = 'grant'")).rows[0].s);
    const bal = (await q('select coalesce(sum(coins),0) as coins, coalesce(sum(diamonds),0) as diamonds from wallets')).rows[0];
    const pend = (await q("select count(*)::int as n, coalesce(sum(diamonds),0) as d, coalesce(sum(amount),0) as kwd from payout_requests where status = 'pending'")).rows[0];
    const hosts = (await q('select host_id, sum(coins)::bigint as coins, sum(diamonds)::bigint as diamonds, count(*)::int as n from live_gifts group by host_id order by sum(coins) desc limit 10')).rows;
    const recent = (await q('select * from live_gifts order by created_at desc limit 20')).rows;
    const users = await usersById([...hosts.map((x) => x.host_id), ...recent.flatMap((x) => [x.sender_id, x.host_id])]);
    const cat = new Map((await q('select * from gifts')).rows.map((g) => [g.id, mapGift(g)]));
    res.json({
      demo: isDemo(), provider: provider().name, platformShare: config.giftPlatformShare, diamondKwd: config.diamondKwd,
      totals: { giftCoins: N(tot.coins), platformCoins: N(tot.platform), hostDiamonds: N(tot.diamonds), gifts: tot.n,
        platformKwdEst: Math.round(N(tot.platform) * config.diamondKwd * 1000) / 1000, grantedCoins: grants, coinsOutstanding: N(bal.coins), diamondsOutstanding: N(bal.diamonds),
        pendingPayouts: pend.n, pendingDiamonds: N(pend.d), pendingKwd: N(pend.kwd) },
      purchases: pur.map((p) => ({ provider: p.provider, count: p.n, coins: N(p.coins), kwd: N(p.kwd) })),
      topHosts: hosts.map((x) => ({ user: users.get(x.host_id) || null, coins: N(x.coins), diamonds: N(x.diamonds), gifts: x.n })),
      recent: recent.map((x) => ({ id: x.id, gift: cat.get(x.gift_id) || null, qty: x.qty, coins: x.coins, from: users.get(x.sender_id) || null, to: users.get(x.host_id) || null, createdAt: ms(x.created_at) }))
    });
  }));
  r.get('/admin/payouts', requireAdmin, h(async (req, res) => {
    const st = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = (await q('select * from payout_requests where status = $1 order by created_at desc limit 100', [st])).rows;
    const users = await usersById(rows.map((x) => x.user_id));
    res.json({ status: st, payouts: rows.map((p) => mapPayout(p, users.get(p.user_id))) });
  }));
  r.post('/admin/payouts/:id/:action(approve|reject)', requireAdmin, h(async (req, res) => {
    const id = uid(req.params.id); const approve = req.params.action === 'approve'; const note = str(req.body?.note, 300);
    const p = await tx(async (c) => {
      const row = (await c.query("update payout_requests set status = $2, admin_note = $3, decided_by = $4, decided_at = now() where id = $1 and status = 'pending' returning *", [id, approve ? 'approved' : 'rejected', note, req.user.id])).rows[0];
      if (!row) throw new HttpError(409, 'notPending');
      if (!approve) await credit(c, row.user_id, 'diamonds', N(row.diamonds), 'payout_refund', { refId: row.id, actorId: req.user.id, note });
      await notify(c, { userId: row.user_id, type: 'system', text: approve ? `✅ تمت الموافقة على طلب سحب ${N(row.diamonds)} 💎 (${N(row.amount).toFixed(3)} د.ك) — سيُحوَّل المبلغ يدوياً.` : `طلب السحب رُفض وأُعيد ${N(row.diamonds)} 💎 إلى رصيدك${note ? ` — ${note}` : ''}` });
      return row;
    });
    res.json({ payout: mapPayout(p) });
  }));
  r.post('/admin/coins/grant', requireAdmin, h(async (req, res) => {
    const b = req.body || {}; const coins = intIn(b.coins, 1, 1000000); const note = str(b.note, 200);
    const who = str(b.user, 64, { min: 1 }).replace(/^@/, '').toLowerCase();
    const u = need((await q(isUuid(who) ? 'select id, username from profiles where id = $1' : 'select id, username from profiles where username = $1', [who])).rows[0], 'noUser');
    const after = await tx((c) => credit(c, u.id, 'coins', coins, 'grant', { actorId: req.user.id, note: note || 'admin' }));
    res.json({ ok: true, user: { id: u.id, username: u.username }, coins: after });
  }));
  return r;
}
