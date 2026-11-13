// © 2026 وطن النهار — تنزيل الفيديو (مجاني بالشعار / بدون شعار) واشتراك «كليب كات بلس» (مال تجريبي أو 170 عملة)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const PORT = 40010 + crypto.randomInt(0, 9);
const ORIGIN = `http://127.0.0.1:${PORT}`; const BASE = `${ORIGIN}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-dl-'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-dl-out-'));
let srv, db;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, { form } = {}) {
    const h = { 'X-CK': '1' }; if (this.cookie) h.cookie = this.cookie;
    let b; if (form) b = form; else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); } patch(p, b = {}) { return this.req('PATCH', p, b); } del(p) { return this.req('DELETE', p); }
  // تنزيل ملف (بدون ترويسة x-ck: مثل رابط <a download>)
  async raw(url) { const res = await fetch(ORIGIN + url, { headers: this.cookie ? { cookie: this.cookie } : {} }); return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) }; }
}
let n = 0;
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${++n}${crypto.randomBytes(2).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function admin() { const c = new Client(); const r = await c.post('/auth/login', ADMIN); assert.equal(r.status, 200, JSON.stringify(r.body)); return c; }
async function upload(c, caption = 'تنزيل') {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', caption);
  const r = await c.req('POST', '/videos', undefined, { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
const grantCoins = async (adm, u, coins) => { const r = await adm.post('/admin/coins/grant', { user: u.me.username, coins, note: 'test' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.coins; };
const coinsOf = async (u) => (await u.get('/wallet')).body.coins;
const plusOf = async (u) => (await u.get('/plus')).body.status;
const cacheFiles = (id) => { try { return fs.readdirSync(path.join(upl, '.dlcache')).filter((f) => f.includes(id)); } catch { return []; } };
async function waitWm(c, id) {
  for (let i = 0; i < 120; i++) { const r = await c.get(`/videos/${id}/download/status`); if (r.status === 200) return r.body; assert.equal(r.status, 202, JSON.stringify(r.body)); await sleep(250); }
  throw new Error('watermark timeout');
}
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl,
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', LIVEKIT_URL: '', TRANSCODE_POLL_MS: '400', PAYMENT_PROVIDER: '',
    PLUS_MONTHLY_KWD: '', PLUS_MONTHLY_COINS: '', DOWNLOAD_RATE_MAX: '500', DEMO_COINS_DAILY_MAX: '3000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
  db = new pg.Client({ connectionString: DB }); await db.connect();
});
after(async () => { await db?.end(); srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }); });

test('free watermarked download: logged-in only, H.264/AAC faststart attachment via short-lived link, cached, counted, removed with the video', async () => {
  const owner = await user('cr'); const fan = await user('fan');
  const v = await upload(owner);
  assert.equal((await new Client().post(`/videos/${v.id}/download`, { kind: 'wm' })).status, 401);   // الزوار لا
  const first = await fan.post(`/videos/${v.id}/download`, { kind: 'wm' });
  assert.ok([200, 202].includes(first.status), JSON.stringify(first.body));
  const r = first.status === 200 ? first.body : await waitWm(fan, v.id);
  assert.equal(r.status, 'ready'); assert.equal(r.kind, 'wm'); assert.equal(r.via, 'free');
  assert.match(r.url, /^\/api\/dl\/[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(r.filename, `clipkat-${owner.me.username}-${v.id.slice(0, 8)}.mp4`);
  const f = await fan.raw(r.url);
  assert.equal(f.status, 200);
  assert.match(f.headers.get('content-disposition'), /^attachment; filename="clipkat-/);
  assert.equal(f.headers.get('content-type'), 'video/mp4');
  assert.match(f.headers.get('cache-control'), /no-store/);
  const out = path.join(tmp, 'wm.mp4'); fs.writeFileSync(out, f.buf);
  const info = probe(out);
  assert.equal(info.streams.find((s) => s.codec_type === 'video').codec_name, 'h264');
  assert.equal(info.streams.find((s) => s.codec_type === 'audio').codec_name, 'aac');           // الصوت محفوظ
  assert.ok(Math.abs(Number(info.format.duration) - 6) < 0.5, info.format.duration);
  assert.ok(f.buf.indexOf('moov') < f.buf.indexOf('mdat'), 'faststart: moov before mdat');
  assert.notEqual(crypto.createHash('sha1').update(f.buf).digest('hex'), crypto.createHash('sha1').update(fs.readFileSync(SAMPLE)).digest('hex'));
  // الرابط مربوط بالمستخدم وموقّع
  assert.equal((await new Client().raw(r.url)).status, 403);
  assert.equal((await owner.raw(r.url)).status, 403);
  assert.equal((await fan.raw(r.url.slice(0, -3) + 'abc')).status, 403);
  // الملف المخزّن لا يُخدم من /uploads
  const cached = cacheFiles(v.id); assert.equal(cached.length, 1, JSON.stringify(cached));
  assert.notEqual((await fan.raw(`/uploads/.dlcache/${cached[0]}`)).status, 200);
  // المرة الثانية فورية من التخزين
  const t0 = Date.now(); const again = await fan.post(`/videos/${v.id}/download`, { kind: 'wm' });
  assert.equal(again.status, 200); assert.equal(again.body.status, 'ready'); assert.ok(Date.now() - t0 < 1500);
  assert.equal(cacheFiles(v.id).length, 1);
  // العدّاد: يراه صاحب المقطع فقط
  const ov = (await owner.get(`/videos/${v.id}`)).body; assert.equal(ov.downloads, 2);
  assert.equal((await fan.get(`/videos/${v.id}`)).body.downloads, undefined);
  assert.equal(Number((await db.query("select count(*) from video_downloads where video_id = $1 and kind = 'wm' and via = 'free'", [v.id])).rows[0].count), 2);
  // حذف المقطع يحذف النسخة المخزّنة ويُبطل الرابط
  assert.equal((await owner.del(`/videos/${v.id}`)).status, 200);
  assert.deepEqual(cacheFiles(v.id), []);
  assert.equal((await fan.raw(again.body.url)).status, 404);
});

test('owner downloads own video without watermark for free (original file); non-subscriber is blocked with plusRequired', async () => {
  const owner = await user('own'); const fan = await user('nos');
  const v = await upload(owner);
  const r = await owner.post(`/videos/${v.id}/download`, { kind: 'nowm' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.via, 'owner');
  const f = await owner.raw(r.body.url);
  assert.equal(f.status, 200); assert.match(f.headers.get('content-disposition'), /attachment/);
  assert.ok(f.buf.equals(fs.readFileSync(SAMPLE)), 'no-watermark = original bytes');
  assert.equal(await coinsOf(owner), 0);
  const b = await fan.post(`/videos/${v.id}/download`, { kind: 'nowm' });
  assert.equal(b.status, 402); assert.equal(b.body.error, 'plusRequired');
  assert.equal((await fan.post(`/videos/${v.id}/download`, { kind: 'bogus' })).status, 400);
  assert.equal((await plusOf(fan)).active, false);
});

test('coin-paid ClipKat Plus: charges exactly 170 coins (platform revenue), 30 days, no double charge, insufficient balance, renew early extends', async () => {
  const adm = await admin(); const u = await user('sub'); const owner = await user('ow');
  const v = await upload(owner);
  // رصيد غير كافٍ
  await grantCoins(adm, u, 100);
  const low = await u.post('/plus/subscribe', { method: 'coins', key: 'low-balance-1' });
  assert.equal(low.status, 402); assert.equal(low.body.error, 'insufficient');
  assert.equal(await coinsOf(u), 100); assert.equal((await plusOf(u)).active, false);
  assert.equal(Number((await db.query('select count(*) from plus_subscriptions where user_id = $1', [u.me.id])).rows[0].count), 0);
  // اشتراك بالعملات
  await grantCoins(adm, u, 300);   // 400
  const t0 = Date.now();
  const s1 = await u.post('/plus/subscribe', { method: 'coins', key: 'plus-coins-key-1' });
  assert.equal(s1.status, 201, JSON.stringify(s1.body));
  assert.equal(s1.body.coins, 230); assert.equal(s1.body.sub.coins, 170); assert.equal(s1.body.sub.method, 'coins');
  assert.equal(s1.body.status.active, true);
  assert.ok(Math.abs(s1.body.status.expiresAt - (t0 + 30 * DAY)) < 60000, 'expires in 30 days');
  const led = (await db.query("select delta, balance_after, kind, ref_id from coin_ledger where user_id = $1 and kind = 'subscription'", [u.me.id])).rows;
  assert.equal(led.length, 1); assert.equal(Number(led[0].delta), -170); assert.equal(Number(led[0].balance_after), 230); assert.equal(led[0].ref_id, s1.body.sub.id);
  // نفس المفتاح مرة ثانية → لا خصم مزدوج
  const dup = await u.post('/plus/subscribe', { method: 'coins', key: 'plus-coins-key-1' });
  assert.equal(dup.status, 200); assert.equal(dup.body.duplicate, true);
  assert.equal(await coinsOf(u), 230);
  // طلبان متزامنان بنفس المفتاح → خصم واحد
  const [a, b] = await Promise.all([u.post('/plus/subscribe', { method: 'coins', key: 'plus-race-key-2' }), u.post('/plus/subscribe', { method: 'coins', key: 'plus-race-key-2' })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(await coinsOf(u), 60);
  // التجديد المبكر يمدّ تاريخ الانتهاء (30 + 30 يوماً)
  const st = await plusOf(u);
  assert.ok(Math.abs(st.expiresAt - (s1.body.status.expiresAt + 30 * DAY)) < 5000, `${st.expiresAt} vs ${s1.body.status.expiresAt}`);
  assert.equal(Number((await db.query("select coalesce(sum(-delta),0) as s from coin_ledger where user_id = $1 and kind = 'subscription'", [u.me.id])).rows[0].s), 340);
  // الآن 60 عملة فقط → رصيد غير كافٍ، ولا تغيير
  const low2 = await u.post('/plus/subscribe', { method: 'coins', key: 'plus-low-key-3' });
  assert.equal(low2.status, 402); assert.equal(await coinsOf(u), 60); assert.equal((await plusOf(u)).expiresAt, st.expiresAt);
  // المشترك: تنزيل بدون شعار بلا حدود ولا خصم
  for (let i = 0; i < 4; i++) {
    const d = await u.post(`/videos/${v.id}/download`, { kind: 'nowm' });
    assert.equal(d.status, 200, JSON.stringify(d.body)); assert.equal(d.body.via, 'plus');
    if (i === 0) { const f = await u.raw(d.body.url); assert.equal(f.status, 200); assert.ok(f.buf.equals(fs.readFileSync(SAMPLE))); }
  }
  assert.equal(await coinsOf(u), 60);
  assert.equal((await owner.get(`/videos/${v.id}`)).body.downloads, 4);
  // الإيراد في لوحة الإدارة (العملات للمنصة، لا تُضاف لصاحب المقطع)
  const ad = await adm.get('/admin/plus');
  assert.equal(ad.status, 200); assert.ok(ad.body.totals.coins >= 340); assert.ok(ad.body.subscribers.some((x) => x.id === u.me.id));
  assert.equal(await coinsOf(owner), 0);
  assert.equal((await u.get('/admin/plus')).status, 403);
});

test('money-paid ClipKat Plus (demo provider) activates for 30 days at 0.500 KWD; no coins touched', async () => {
  const u = await user('mon');
  const cfg = (await u.get('/plus')).body;
  assert.deepEqual(cfg.price, { kwd: 0.5, coins: 170, days: 30 }); assert.equal(cfg.demo, true);
  const r = await u.post('/plus/subscribe', { method: 'money', key: 'plus-money-key-1' });
  assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.demo, true);
  assert.equal(r.body.sub.price, 0.5); assert.equal(r.body.sub.provider, 'demo'); assert.equal(r.body.status.active, true);
  assert.equal((await u.post('/plus/subscribe', { method: 'money', key: 'plus-money-key-1' })).body.duplicate, true);
  assert.equal(Number((await db.query('select count(*) from plus_subscriptions where user_id = $1', [u.me.id])).rows[0].count), 1);
  assert.equal(await coinsOf(u), 0);
  assert.equal((await u.post('/plus/subscribe', { method: 'card' })).status, 400);
});

test('subscription expiry: after expires_at the user is blocked again', async () => {
  const adm = await admin(); const u = await user('exp'); const owner = await user('ow');
  const v = await upload(owner);
  await grantCoins(adm, u, 170);
  assert.equal((await u.post('/plus/subscribe', { method: 'coins', key: 'plus-exp-key-1' })).status, 201);
  assert.equal((await u.post(`/videos/${v.id}/download`, { kind: 'nowm' })).status, 200);
  await db.query("update plus_subscriptions set starts_at = now() - interval '31 days', expires_at = now() - interval '1 second' where user_id = $1", [u.me.id]);
  assert.equal((await plusOf(u)).active, false);
  const b = await u.post(`/videos/${v.id}/download`, { kind: 'nowm' });
  assert.equal(b.status, 402); assert.equal(b.body.error, 'plusRequired');
  // التجديد بعد الانتهاء يبدأ من الآن
  await grantCoins(adm, u, 170); const t0 = Date.now();
  const s = await u.post('/plus/subscribe', { method: 'coins', key: 'plus-exp-key-2' });
  assert.ok(Math.abs(s.body.status.expiresAt - (t0 + 30 * DAY)) < 60000);
});

test('admin can grant and revoke ClipKat Plus', async () => {
  const adm = await admin(); const u = await user('gr'); const owner = await user('ow');
  const v = await upload(owner);
  const g = await adm.post('/admin/plus/grant', { user: '@' + u.me.username, days: 7 });
  assert.equal(g.status, 201, JSON.stringify(g.body)); assert.equal(g.body.status.active, true);
  assert.ok(Math.abs(g.body.status.expiresAt - (Date.now() + 7 * DAY)) < 60000);
  assert.equal((await u.post(`/videos/${v.id}/download`, { kind: 'nowm' })).body.via, 'plus');
  assert.equal((await u.post('/admin/plus/grant', { user: u.me.username, days: 7 })).status, 403);
  assert.equal((await adm.post('/admin/plus/grant', { user: u.me.username, days: 0 })).status, 400);
  const rv = await adm.post('/admin/plus/revoke', { user: u.me.username });
  assert.equal(rv.status, 200); assert.equal(rv.body.status.active, false);
  assert.equal((await u.post(`/videos/${v.id}/download`, { kind: 'nowm' })).status, 402);
});

test('owner setting «allow downloading my videos» off → 403 for others (both kinds), hidden flag, owner still can', async () => {
  const adm = await admin(); const owner = await user('off'); const fan = await user('fan');
  const v = await upload(owner);
  assert.equal((await owner.get('/me/settings')).body.allowDownload, true);
  assert.equal((await fan.get(`/videos/${v.id}`)).body.canDownload, true);
  const p = await owner.patch('/me/settings', { allowDownload: false });
  assert.equal(p.status, 200); assert.equal(p.body.allowDownload, false);
  assert.equal((await owner.patch('/me/settings', { allowDownload: 'no' })).status, 400);
  assert.equal((await fan.get(`/videos/${v.id}`)).body.canDownload, false);
  await adm.post('/admin/plus/grant', { user: fan.me.username, days: 30 });
  for (const kind of ['wm', 'nowm']) {
    const r = await fan.post(`/videos/${v.id}/download`, { kind });
    assert.equal(r.status, 403, kind); assert.equal(r.body.error, 'downloadOff');
  }
  assert.equal((await fan.get(`/videos/${v.id}/download/status`)).status, 403);
  assert.equal((await owner.post(`/videos/${v.id}/download`, { kind: 'nowm' })).status, 200);
  await owner.patch('/me/settings', { allowDownload: true });
  assert.equal((await fan.post(`/videos/${v.id}/download`, { kind: 'nowm' })).status, 200);
});
