// © 2026 وطن النهار — العملات وهدايا البث: محفظة، شراء تجريبي، سجل حركات ذري، أرباح، سحب، لوحة المشرف
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const PORT = 39950 + crypto.randomInt(0, 40);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-gifts-'));
let srv, db;
const key = () => crypto.randomBytes(12).toString('hex');

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body) {
    const h = { 'X-CK': '1' }; if (this.cookie) h.cookie = this.cookie;
    let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b, redirect: 'manual' });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}
let n = 0;
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${++n}${crypto.randomBytes(2).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function admin() { const c = new Client(); const r = await c.post('/auth/login', ADMIN); assert.equal(r.status, 200, JSON.stringify(r.body)); return c; }
// بث جارٍ (بدون خادم وسائط — الهدايا لا تحتاجه)
const goLive = async (host) => (await db.query("insert into lives (user_id, title) values ($1, 'gift test') returning id", [host.me.id])).rows[0].id;
const grant = async (adm, u, coins) => { const r = await adm.post('/admin/coins/grant', { user: u.me.username, coins, note: 'test' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.coins; };
const wallet = async (c) => (await c.get('/wallet')).body;
const ledgerSum = async (uid, currency) => Number((await db.query('select coalesce(sum(delta),0) as s from coin_ledger where user_id = $1 and currency = $2', [uid, currency])).rows[0].s);

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl,
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', TRANSCODE: '0', LIVEKIT_URL: '', PAYMENT_PROVIDER: '', GIFT_PLATFORM_SHARE: '', DEMO_COINS_DAILY_MAX: '3000', PAYOUT_MIN_DIAMONDS: '50', GIFT_RATE_MAX: '25' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { if (!/sendData|LiveKit/.test(String(d))) process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
  db = new pg.Client({ connectionString: DB }); await db.connect();
});
after(async () => { await db?.end(); srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('coins config: KWD packages, 8 gifts, demo mode by default, 50% platform share', async () => {
  const r = await new Client().get('/coins/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.demo, true); assert.equal(r.body.provider, 'demo'); assert.equal(r.body.platformShare, 50);
  assert.deepEqual(r.body.packages.map((p) => p.id), ['small', 'medium', 'large']);
  assert.ok(r.body.packages.every((p) => p.currency === 'KWD' && p.price > 0 && p.total >= p.coins));
  assert.equal(r.body.gifts.length, 8);
  assert.ok(r.body.gifts.every((g) => g.coins > 0 && g.emoji && g.nameAr));
  assert.deepEqual([...r.body.gifts].map((g) => g.coins), [...r.body.gifts].map((g) => g.coins).sort((a, b) => a - b));
});

test('demo purchase credits coins once per key, writes the ledger, and respects the daily demo cap', async () => {
  const u = await user('buy');
  assert.equal((await new Client().post('/coins/purchase', { packageId: 'small' })).status, 401);
  assert.equal((await u.post('/coins/purchase', { packageId: 'nope' })).status, 404);
  const k = key();
  const a = await u.post('/coins/purchase', { packageId: 'small', key: k });
  assert.equal(a.status, 201, JSON.stringify(a.body)); assert.equal(a.body.demo, true); assert.equal(a.body.wallet.coins, 100);
  const again = await u.post('/coins/purchase', { packageId: 'small', key: k });
  assert.equal(again.body.duplicate, true); assert.equal(again.body.wallet.coins, 100);
  const l = await u.post('/coins/purchase', { packageId: 'large', key: key() });
  assert.equal(l.body.wallet.coins, 1300);
  assert.equal((await u.post('/coins/purchase', { packageId: 'large', key: key() })).body.wallet.coins, 2500);
  const cap = await u.post('/coins/purchase', { packageId: 'large', key: key() });
  assert.equal(cap.status, 429); assert.equal(cap.body.error, 'demoCap');
  const w = await wallet(u);
  assert.equal(w.coins, 2500); assert.equal(w.demo, true);
  assert.equal(w.ledger.length, 3); assert.ok(w.ledger.every((x) => x.kind === 'purchase' && x.delta > 0));
  assert.equal(await ledgerSum(u.me.id, 'coins'), 2500);
  const rows = (await db.query("select provider, status, price from coin_purchases where user_id = $1 order by created_at", [u.me.id])).rows;
  assert.deepEqual(rows.map((r) => r.provider), ['demo', 'demo', 'demo']);
  // لا مسار لمزوّد حقيقي غير مفعّل
  assert.equal((await new Client().post(`/coins/webhook/tap?p=${crypto.randomUUID()}`)).status, 404);
});

test('sending gifts: server-side prices, 50/50 split into host diamonds, no self gifts, validation', async () => {
  const adm = await admin(); const host = await user('host'); const fan = await user('fan');
  const live = await goLive(host);
  // بدون رصيد
  const poor = await fan.post(`/live/${live}/gifts`, { giftId: 'rose', key: key() });
  assert.equal(poor.status, 402); assert.equal(poor.body.error, 'insufficient');
  assert.equal((await db.query('select count(*)::int as n from live_gifts where sender_id = $1', [fan.me.id])).rows[0].n, 0);
  await grant(adm, fan, 300);
  const r1 = await fan.post(`/live/${live}/gifts`, { giftId: 'rose', qty: 5, key: key(), coins: 0, price: 0 });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body.coins, 5); assert.equal(r1.body.wallet.coins, 295); assert.equal(r1.body.gift.emoji, '🌹');
  assert.equal(r1.body.liveDiamonds, 2);       // floor(5 × 50%)
  const r2 = await fan.post(`/live/${live}/gifts`, { giftId: 'crown', key: key() });
  assert.equal(r2.body.coins, 99); assert.equal(r2.body.wallet.coins, 196); assert.equal(r2.body.liveDiamonds, 2 + 49); assert.equal(r2.body.liveCoins, 104);
  const row = (await db.query("select * from live_gifts where gift_id = 'crown' and sender_id = $1", [fan.me.id])).rows[0];
  assert.equal(row.diamonds, 49); assert.equal(row.platform_coins, 50);
  assert.equal((await wallet(host)).diamonds, 51);
  assert.equal(await ledgerSum(host.me.id, 'diamonds'), 51);
  assert.equal(await ledgerSum(fan.me.id, 'coins'), 196);
  assert.equal((await host.post(`/live/${live}/gifts`, { giftId: 'rose', key: key() })).status, 400);
  assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: 'diamond_ring', key: key() })).status, 404);
  assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: 'rose', qty: 100, key: key() })).status, 400);
  assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: 'rose', qty: 1.5, key: key() })).status, 400);
  assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: 'rose', key: 'x' })).status, 400);
  assert.equal((await new Client().post(`/live/${live}/gifts`, { giftId: 'rose', key: key() })).status, 401);
  // الترتيب
  const top = await new Client().get(`/live/${live}/gifters`);
  assert.equal(top.body.top[0].user.id, fan.me.id); assert.equal(top.body.top[0].coins, 104); assert.equal(top.body.liveCoins, 104);
  // بعد انتهاء البث
  await db.query("update lives set status = 'ended', ended_at = now() where id = $1", [live]);
  assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: 'rose', key: key() })).status, 410);
  assert.equal((await wallet(fan)).coins, 196);
});

test('replaying the same gift request never double-charges', async () => {
  const adm = await admin(); const host = await user('h'); const fan = await user('f');
  const live = await goLive(host); await grant(adm, fan, 100);
  const k = key();
  const rs = await Promise.all([1, 2, 3, 4].map(() => fan.post(`/live/${live}/gifts`, { giftId: 'palm', key: k })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1, JSON.stringify(rs.map((r) => r.status)));
  assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 200 && r.body.duplicate));
  assert.equal((await wallet(fan)).coins, 70);
  assert.equal((await wallet(host)).diamonds, 15);
});

test('concurrent gifts cannot overspend: balance never goes negative', async () => {
  const adm = await admin(); const host = await user('h'); const fan = await user('f');
  const live = await goLive(host); await grant(adm, fan, 100);
  const rs = await Promise.all(Array.from({ length: 10 }, () => fan.post(`/live/${live}/gifts`, { giftId: 'palm', key: key() })));
  assert.equal(rs.filter((r) => r.status === 201).length, 3, JSON.stringify(rs.map((r) => r.status)));
  assert.equal(rs.filter((r) => r.status === 402).length, 7);
  const w = await wallet(fan); assert.equal(w.coins, 10);
  assert.equal(await ledgerSum(fan.me.id, 'coins'), 10);
  assert.equal((await wallet(host)).diamonds, 45);
  const neg = (await db.query('select count(*)::int as n from wallets where coins < 0 or diamonds < 0')).rows[0].n; assert.equal(neg, 0);
  await assert.rejects(db.query("update wallets set coins = -1 where user_id = $1", [fan.me.id]), /check/i);
});

test('gift sends are rate limited per user', async () => {
  const host = await user('h'); const fan = await user('f'); const live = await goLive(host);
  const rs = [];
  for (let i = 0; i < 30; i++) rs.push((await fan.post(`/live/${live}/gifts`, { giftId: 'rose', key: key() })).status);
  assert.ok(rs.includes(429), JSON.stringify(rs)); assert.ok(!rs.includes(201));
});

test('blocked viewers cannot gift and private lives stay hidden', async () => {
  const adm = await admin(); const host = await user('h'); const fan = await user('f');
  const live = await goLive(host); await grant(adm, fan, 50);
  assert.equal((await host.post(`/users/${fan.me.id}/block`)).status < 300, true);
  assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: 'rose', key: key() })).status, 404);
  assert.equal((await wallet(fan)).coins, 50);
});

test('earnings, payout requests (held, one pending, reject refunds, approve keeps) and admin views', async () => {
  const adm = await admin(); const host = await user('cr'); const fan = await user('fa');
  const live = await goLive(host); await grant(adm, fan, 2000);
  for (const g of ['car', 'car']) assert.equal((await fan.post(`/live/${live}/gifts`, { giftId: g, key: key() })).status, 201);
  const e = await host.get('/earnings');
  assert.equal(e.status, 200); assert.equal(e.body.diamonds, 498); assert.equal(e.body.lifetimeDiamonds, 498); assert.equal(e.body.giftsCount, 2);
  assert.equal(e.body.valueKwd, 1.245); assert.equal(e.body.history[0].from.id, fan.me.id); assert.equal(e.body.history[0].gift.id, 'car');
  const form = { accountName: 'وطن النهار', account: 'KW81CBKU0000000000001234560101', method: 'bank' };
  assert.equal((await host.post('/payouts', { ...form, diamonds: 10 })).status, 400);
  const over = await host.post('/payouts', { ...form, diamonds: 600 });
  assert.equal(over.status, 402);
  assert.equal((await db.query('select count(*)::int as n from payout_requests where user_id = $1', [host.me.id])).rows[0].n, 0);
  const p1 = await host.post('/payouts', { ...form, diamonds: 400 });
  assert.equal(p1.status, 201, JSON.stringify(p1.body)); assert.equal(p1.body.wallet.diamonds, 98); assert.equal(p1.body.payout.amount, 1); assert.equal(p1.body.payout.demo, true);
  assert.equal((await host.post('/payouts', { ...form, diamonds: 50 })).status, 409);
  // غير المشرف
  assert.equal((await host.get('/admin/payouts')).status, 403);
  assert.equal((await host.post(`/admin/payouts/${p1.body.payout.id}/approve`)).status, 403);
  assert.equal((await host.post('/admin/coins/grant', { user: host.me.username, coins: 10 })).status, 403);
  const list = await adm.get('/admin/payouts?status=pending');
  assert.ok(list.body.payouts.some((p) => p.id === p1.body.payout.id && p.user.id === host.me.id));
  const rej = await adm.post(`/admin/payouts/${p1.body.payout.id}/reject`, { note: 'بيانات الحساب ناقصة' });
  assert.equal(rej.status, 200); assert.equal(rej.body.payout.status, 'rejected');
  assert.equal((await adm.post(`/admin/payouts/${p1.body.payout.id}/approve`)).status, 409);
  assert.equal((await wallet(host)).diamonds, 498);
  const p2 = await host.post('/payouts', { ...form, diamonds: 300 });
  assert.equal(p2.status, 201);
  assert.equal((await adm.post(`/admin/payouts/${p2.body.payout.id}/approve`, { note: 'تم' })).body.payout.status, 'approved');
  assert.equal((await wallet(host)).diamonds, 198);
  assert.equal(await ledgerSum(host.me.id, 'diamonds'), 198);
  const kinds = (await db.query("select kind from coin_ledger where user_id = $1 and currency = 'diamonds' order by id", [host.me.id])).rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['gift_received', 'gift_received', 'payout_hold', 'payout_refund', 'payout_hold']);
  const notes = (await db.query("select text from notifications where user_id = $1 and type = 'system' order by created_at", [host.me.id])).rows.map((r) => r.text);
  assert.ok(notes.some((t) => /رُفض/.test(t)) && notes.some((t) => /الموافقة/.test(t)));
  const s = await adm.get('/admin/gifts');
  assert.equal(s.status, 200); assert.equal(s.body.demo, true);
  assert.ok(s.body.totals.giftCoins >= 998 && s.body.totals.platformCoins >= 500 && s.body.totals.grantedCoins >= 2000);
  assert.ok(s.body.topHosts.some((x) => x.user.id === host.me.id && x.coins === 998));
  assert.ok(s.body.recent.length > 0);
});

test('admin grant validates input and terms keep "no share of store sales" next to the gifts section', async () => {
  const adm = await admin(); const u = await user('g');
  assert.equal((await adm.post('/admin/coins/grant', { user: u.me.username, coins: 0 })).status, 400);
  assert.equal((await adm.post('/admin/coins/grant', { user: 'no_such_user_x', coins: 5 })).status, 404);
  assert.equal((await adm.post('/admin/coins/grant', { user: '@' + u.me.username, coins: 5 })).body.coins, 5);
  const html = await (await fetch(`http://127.0.0.1:${PORT}/terms`)).text();
  assert.match(html, /العملات والهدايا/); assert.match(html, /غير قابلة للاسترداد/);
  assert.match(html, /لا تأخذ عليها عمولة/); assert.match(html, /جميع الحقوق محفوظة © 2026 وطن النهار/);
});
