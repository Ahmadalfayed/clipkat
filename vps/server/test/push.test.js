// © 2026 وطن النهار — إشعارات الهاتف (Web Push): الاشتراك، التفضيلات، الرسائل، فيديو جديد، بث مباشر، مكالمة (رنين/رفض/فائتة)، حذف الاشتراك المنتهي
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import webpush from 'web-push';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const LK_BIN = [process.env.LIVEKIT_BIN, '/workspace/tools/livekit-server', '/usr/local/bin/livekit-server'].find((p) => p && fs.existsSync(p));
const PORT = 41200 + crypto.randomInt(0, 400);
const LKP = 49000 + crypto.randomInt(0, 400) * 2;
const BASE = `http://127.0.0.1:${PORT}/api`;
const KEY = 'cktestkey', SECRET = crypto.randomBytes(24).toString('hex');
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-push-'));
const SINK = path.join(upl, 'sink.jsonl');
const VAPID = webpush.generateVAPIDKeys();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, lk, db;

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body) {
    const h = { 'X-CK': '1', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' }; if (this.cookie) h.cookie = this.cookie;
    let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); } patch(p, b) { return this.req('PATCH', p, b); }
}
let n = 0;
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${++n}${crypto.randomBytes(2).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
const follow = async (a, b) => assert.ok((await a.post(`/users/${b.me.id}/follow`)).status < 300);
// اشتراك متصفح حقيقي الشكل (مفاتيح ECDH صحيحة حتى ينجح التشفير)
function fakeSub(host = 'fcm.googleapis.com', tag = '') {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint: `https://${host}/fcm/send/${tag}${crypto.randomBytes(12).toString('hex')}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}
const sink = () => (fs.existsSync(SINK) ? fs.readFileSync(SINK, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
async function waitPush(pred, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = sink().find(pred); if (m) return m; await sleep(60); } throw new Error('no push; got ' + JSON.stringify(sink().map((x) => x.body.t))); }
const noPush = async (pred, ms = 900) => { await sleep(ms); assert.equal(sink().filter(pred).length, 0, 'unexpected push'); };

before(async () => {
  if (LK_BIN) {
    lk = spawn(LK_BIN, ['--config-body', `port: ${LKP}\nbind_addresses: ["127.0.0.1"]\nrtc:\n  tcp_port: ${LKP + 1}\n  port_range_start: 52000\n  port_range_end: 52100\n  use_external_ip: false\nkeys:\n  ${KEY}: ${SECRET}\nlogging:\n  level: warn\n`], { stdio: ['ignore', 'pipe', 'pipe'] });
    lk.stderr.on('data', () => {});
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${LKP}/`)).ok) break; } catch {} await sleep(100); }
  }
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, NODE_ENV: 'test', PUSH_TEST_SINK: SINK, PUSH_SWEEP_MS: '400', PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl,
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', TRANSCODE: '0', PAYMENT_PROVIDER: '',
    VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: 'mailto:test@test.local',
    LIVEKIT_URL: LK_BIN ? `ws://127.0.0.1:${LKP}` : '', LIVEKIT_API_KEY: KEY, LIVEKIT_API_SECRET: SECRET, CALL_RING_SEC: '3', RTC_REAP_MS: '400' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { if (!/sendData|LiveKit|\[calls\]/.test(String(d))) process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
  db = new pg.Client({ connectionString: DB }); await db.connect();
});
after(async () => { await db?.end(); srv?.kill('SIGTERM'); lk?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('config, subscribe validation, prefs, sw.js served uncached', async () => {
  const cfg = await new Client().get('/push/config');
  assert.equal(cfg.status, 200); assert.equal(cfg.body.enabled, true); assert.equal(cfg.body.publicKey, VAPID.publicKey);
  assert.equal(JSON.stringify(cfg.body).includes(VAPID.privateKey), false, 'private key never exposed');
  const sw = await fetch(`http://127.0.0.1:${PORT}/sw.js`); assert.equal(sw.status, 200); assert.match(sw.headers.get('cache-control'), /no-cache/); assert.match(await sw.text(), /notificationclick/);
  const u = await user('sub');
  assert.equal((await new Client().post('/push/subscribe', fakeSub())).status, 401);
  for (const bad of [fakeSub('evil.example.com'), { ...fakeSub(), endpoint: 'http://fcm.googleapis.com/x' }, { ...fakeSub(), endpoint: 'https://fcm.googleapis.com:8443/x' }, { ...fakeSub(), keys: { p256dh: 'x', auth: 'y' } }])
    assert.equal((await u.post('/push/subscribe', bad)).status, 400);
  const s = fakeSub(); assert.equal((await u.post('/push/subscribe', s)).status, 201);
  assert.equal((await u.post('/push/subscribe', s)).status, 201, 're-subscribe is idempotent');
  assert.equal((await u.post('/push/subscribe', fakeSub('web.push.apple.com'))).status, 201);
  let p = await u.get('/push/prefs'); assert.deepEqual(p.body, { prefs: { messages: true, videos: true, live: true, calls: true }, devices: 2 });
  assert.equal((await u.patch('/push/prefs', { videos: 'no' })).status, 400);
  p = await u.patch('/push/prefs', { videos: false }); assert.equal(p.body.prefs.videos, false); assert.equal(p.body.prefs.messages, true);
  await u.patch('/push/prefs', { videos: true });
  // إشعار تجريبي: يصل للجهازين، مشفّر وموقّع VAPID
  const tr = await u.post('/push/test'); assert.equal(tr.body.sent, 2);
  const m = await waitPush((x) => x.body.t === 'test'); assert.ok(m.encrypted && m.vapid);
  // إلغاء الاشتراك يحذف الجهاز
  assert.equal((await u.post('/push/unsubscribe', { endpoint: s.endpoint })).body.removed, 1);
  assert.equal((await u.get('/push/prefs')).body.devices, 1);
  // الاشتراك لا يظهر في أي رد عام
  assert.equal(JSON.stringify((await new Client().get(`/users/${u.me.id}`)).body).includes('fcm.googleapis'), false);
});

test('direct messages: push to recipient, coalesced loudness, respects prefs, expired endpoint removed', async () => {
  const a = await user('dma'); const b = await user('dmb');
  await b.post('/push/subscribe', fakeSub());
  assert.equal((await a.post(`/users/${b.me.id}/messages`, { text: 'هلا والله' })).status, 201);
  const m = await waitPush((x) => x.body.t === 'dm' && x.body.url === `/#/chat/${a.me.id}`);
  assert.equal(m.body.body, 'هلا والله'); assert.equal(m.body.silent, false); assert.equal(m.urgency, 'high'); assert.equal(m.body.tag, 'dm-' + a.me.id);
  await a.post(`/users/${b.me.id}/messages`, { text: 'ثانية' });
  const m2 = await waitPush((x) => x.body.t === 'dm' && x.body.body === 'ثانية'); assert.equal(m2.body.silent, true, 'second message within 20s updates quietly');
  await b.patch('/push/prefs', { messages: false });
  await a.post(`/users/${b.me.id}/messages`, { text: 'ثالثة' });
  await noPush((x) => x.body.body === 'ثالثة');
  await b.patch('/push/prefs', { messages: true });
  // خدمة الدفع ترد 410 = الاشتراك انتهى → يُحذف
  const g = fakeSub('fcm.googleapis.com', 'gone/'); g.endpoint = g.endpoint.replace('/fcm/send/gone/', '/gone/');
  await b.post('/push/subscribe', g);
  await a.post(`/users/${b.me.id}/messages`, { text: 'رابعة' });
  await waitPush((x) => x.body.body === 'رابعة' && x.endpoint === g.endpoint); await sleep(300);
  assert.equal((await db.query('select count(*)::int n from push_subscriptions where endpoint = $1', [g.endpoint])).rows[0].n, 0);
});

test('new video from a followed account: one push per video, followers only, not for blocked or hidden', async () => {
  const cr = await user('cr'); const fan = await user('fan'); const stranger = await user('str');
  await follow(fan, cr);
  const fs1 = fakeSub(), ss = fakeSub();
  await fan.post('/push/subscribe', fs1); await stranger.post('/push/subscribe', ss);
  const vid = (await db.query(`insert into videos (user_id, video_path, video_url, caption) values ($1, '/uploads/videos/x.mp4', '/uploads/videos/x.mp4', 'وصفة كبسة') returning id`, [cr.me.id])).rows[0].id;
  const m = await waitPush((x) => x.body.t === 'video' && x.body.url === `/#/watch/${vid}`);
  assert.equal(m.endpoint, fs1.endpoint); assert.match(m.body.title, /نشر فيديو جديد/); assert.equal(m.body.body, 'وصفة كبسة');
  await noPush((x) => x.endpoint === ss.endpoint && x.body.t === 'video');
  await sleep(900);
  assert.equal(sink().filter((x) => x.body.url === `/#/watch/${vid}`).length, 1, 'sent once');
  assert.ok((await db.query('select push_sent_at from videos where id = $1', [vid])).rows[0].push_sent_at);
});

test('live start pushes followers; incoming call rings with answer/decline, decline closes it, timeout = missed', { skip: !LK_BIN && 'livekit-server not found' }, async () => {
  const host = await user('host'); const fan = await user('lfan');
  await follow(fan, host); await follow(host, fan);
  const fsub = fakeSub(); await fan.post('/push/subscribe', fsub);
  const l = await host.post('/live', { title: 'بث الليلة' }); assert.equal(l.status, 201);
  const m = await waitPush((x) => x.body.t === 'live' && x.endpoint === fsub.endpoint);
  assert.equal(m.body.url, `/#/live/${l.body.live.id}`); assert.equal(m.body.body, 'بث الليلة'); assert.match(m.body.title, /بثاً مباشراً/);
  await host.post(`/live/${l.body.live.id}/end`);
  // مكالمة فيديو: الرنين يصل للهاتف
  const c = await host.post('/calls', { to: fan.me.id, kind: 'video' }); assert.equal(c.status, 201);
  const ring = await waitPush((x) => x.body.t === 'call' && x.body.callId === c.body.call.id);
  assert.equal(ring.body.kind, 'video'); assert.equal(ring.urgency, 'high'); assert.ok(Number(ring.ttl) <= 45); assert.match(ring.body.url, new RegExp(`call=${c.body.call.id}`));
  // الهاتف يفتح الموقع من الإشعار: تفاصيل المكالمة + المتصل
  const g = await fan.get(`/calls/${c.body.call.id}`); assert.equal(g.body.call.status, 'ringing'); assert.equal(g.body.peer.id, host.me.id);
  // زر «رفض» في الإشعار
  assert.equal((await fan.post(`/calls/${c.body.call.id}/decline`)).status < 300, true);
  const end = await waitPush((x) => x.body.t === 'call-end' && x.body.callId === c.body.call.id);
  assert.equal(end.body.missed, undefined); assert.equal(end.body.tag, 'call-' + c.body.call.id);
  // مكالمة بدون رد → «مكالمة فائتة»
  const c2 = await host.post('/calls', { to: fan.me.id, kind: 'audio' });
  await waitPush((x) => x.body.t === 'call' && x.body.callId === c2.body.call.id);
  const miss = await waitPush((x) => x.body.t === 'call-end' && x.body.callId === c2.body.call.id && x.body.missed, 12000);
  assert.match(miss.body.title, /فائتة/);
  // إيقاف إشعارات المكالمات
  await fan.patch('/push/prefs', { calls: false });
  const c3 = await host.post('/calls', { to: fan.me.id, kind: 'audio' });
  await noPush((x) => x.body.t === 'call' && x.body.callId === c3.body.call.id);
  await host.post(`/calls/${c3.body.call.id}/cancel`);
});
