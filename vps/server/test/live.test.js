// © 2026 وطن النهار — اختبارات البث المباشر والمكالمات (خادم LiveKit حقيقي في وضع التطوير)
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
const LK_BIN = [process.env.LIVEKIT_BIN, '/workspace/tools/livekit-server', '/usr/local/bin/livekit-server'].find((p) => p && fs.existsSync(p));
const PORT = 39100 + crypto.randomInt(0, 800);
const LKP = 47000 + crypto.randomInt(0, 900) * 2;
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const KEY = 'cktestkey', SECRET = crypto.randomBytes(24).toString('hex');
const here = path.dirname(new URL(import.meta.url).pathname);
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-live-'));
const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-live-fx-'));
let srv, lk;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jwtBody = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

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
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); } del(p) { return this.req('DELETE', p); }
  // اشتراك SSE: يجمع الأحداث في مصفوفة
  async events() {
    const ctl = new AbortController(); const got = [];
    const res = await fetch(BASE + '/events', { headers: { cookie: this.cookie }, signal: ctl.signal });
    assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/event-stream/);
    (async () => {
      const dec = new TextDecoder(); let buf = '';
      try { for await (const ch of res.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.+)$/m.exec(blk)?.[1]; const d = /^data: (.+)$/m.exec(blk)?.[1]; if (ev && d) got.push({ type: ev, data: JSON.parse(d) }); } } } catch {}
    })();
    this._sse = ctl;
    return { got, close: () => ctl.abort(), wait: async (type, pred = () => true, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const e = got.find((x) => x.type === type && pred(x.data)); if (e) return e; await sleep(50); } throw new Error('no SSE event ' + type + ' in ' + JSON.stringify(got.map((x) => x.type))); } };
  }
}
let n = 0;
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${++n}${crypto.randomBytes(2).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
const follow = async (a, b) => assert.equal((await a.post(`/users/${b.me.id}/follow`)).status < 300, true);
function seg(name, sec, { size = '360x640', audio = true } = {}) {
  const out = path.join(fx, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${sec}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=500:duration=${sec}`] : []), '-c:v', 'libvpx', '-b:v', '600k', '-deadline', 'realtime', ...(audio ? ['-c:a', 'libopus'] : []), out], { timeout: 60000 });
  return out;
}

const skip = !LK_BIN && 'livekit-server binary not found (set LIVEKIT_BIN)';
before(async () => {
  if (skip) return;
  lk = spawn(LK_BIN, ['--config-body', `port: ${LKP}\nbind_addresses: ["127.0.0.1"]\nrtc:\n  tcp_port: ${LKP + 1}\n  port_range_start: 51000\n  port_range_end: 51200\n  use_external_ip: false\nkeys:\n  ${KEY}: ${SECRET}\nlogging:\n  level: warn\n`], { stdio: ['ignore', 'pipe', 'pipe'] });
  lk.stderr.on('data', () => {});
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${LKP}/`)).ok) break; } catch {} await sleep(100); }
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000',
    LIVEKIT_URL: `ws://127.0.0.1:${LKP}`, LIVEKIT_API_KEY: KEY, LIVEKIT_API_SECRET: SECRET, RTC_REAP_MS: '400', CALL_RING_SEC: '3', LIVE_HOST_GRACE_SEC: '6', MAX_VIDEO_SEC: '3', TRANSCODE_POLL_MS: '500' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); lk?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(fx, { recursive: true, force: true }); });

test('rtc config is exposed and CSP allows the media server', { skip }, async () => {
  const r = await new Client().get('/rtc/config');
  assert.equal(r.body.enabled, true); assert.equal(r.body.url, `ws://127.0.0.1:${LKP}`);
  const res = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.match(res.headers.get('content-security-policy'), new RegExp(`connect-src[^;]*wss://127.0.0.1:${LKP}`));
});

test('going live: host token publishes, followers notified (inbox + SSE), viewers get hidden subscribe-only tokens', { skip }, async () => {
  const host = await user('host'); const fan = await user('fan'); const other = await user('oth');
  await follow(fan, host);
  const sse = await fan.events(); await sleep(150);
  assert.equal((await new Client().post('/live', { title: 'x' })).status, 401);
  const s = await host.post('/live', { title: 'أول بث' });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const g = jwtBody(s.body.token).video;
  assert.equal(g.room, `live-${s.body.live.id}`); assert.equal(g.canPublish, true);
  const ev = await sse.wait('live'); assert.equal(ev.data.live.id, s.body.live.id); sse.close();
  const notes = (await fan.get('/notifications')).body.notifications;
  assert.ok(notes.some((x) => x.type === 'live' && x.fromId === host.me.id && x.text === s.body.live.id));
  // يظهر في صف «مباشر» للجميع
  for (const c of [fan, other, new Client()]) assert.ok((await c.get('/live')).body.lives.some((l) => l.id === s.body.live.id && l.host.id === host.me.id));
  const j = await fan.post(`/live/${s.body.live.id}/join`);
  assert.equal(j.status, 200); const vg = jwtBody(j.body.token).video;
  assert.equal(vg.canPublish, false); assert.equal(vg.canPublishData, false); assert.equal(vg.hidden, true); assert.equal(vg.canSubscribe, true);
  assert.ok(jwtBody(j.body.token).sub.startsWith(fan.me.id + '.'));
  const guest = await new Client().post(`/live/${s.body.live.id}/join`);
  assert.equal(guest.status, 200); assert.ok(jwtBody(guest.body.token).sub.startsWith('g.'));
  // بدء بث ثانٍ ينهي الأول
  const s2 = await host.post('/live', { title: 'ثانٍ' });
  assert.equal((await host.get(`/live/${s.body.live.id}`)).body.live.status, 'ended');
  assert.equal((await fan.post(`/live/${s.body.live.id}/join`)).status, 410);
  await host.post(`/live/${s2.body.live.id}/end`);
});

test('live comments, hearts, host moderation (delete + block viewer) and admin end', { skip }, async () => {
  const host = await user('mod'); const v1 = await user('v'); const v2 = await user('v');
  const l = (await host.post('/live', { title: 'تعليقات' })).body.live;
  assert.equal((await new Client().post(`/live/${l.id}/comments`, { text: 'hi' })).status, 401);
  const c1 = await v1.post(`/live/${l.id}/comments`, { text: 'مرحبا 👋' });
  assert.equal(c1.status, 201); assert.equal(c1.body.user.id, v1.me.id);
  const c2 = await v2.post(`/live/${l.id}/comments`, { text: 'سبام' });
  assert.equal((await v1.post(`/live/${l.id}/comments`, { text: '' })).status, 400);
  assert.equal((await v1.post(`/live/${l.id}/hearts`, { n: 5 })).status, 200);
  assert.equal((await new Client().post(`/live/${l.id}/hearts`, { n: 999 })).status, 200);   // الضيف يرسل قلوباً (بحد أقصى 20)
  let d = (await v1.get(`/live/${l.id}`)).body;
  assert.equal(d.comments.length, 2); assert.equal(d.live.hearts, 25); assert.equal(d.canModerate, false);
  assert.equal((await v1.del(`/live/${l.id}/comments/${c2.body.id}`)).status, 403);     // لا يحذف تعليق غيره
  assert.equal((await host.del(`/live/${l.id}/comments/${c1.body.id}`)).status, 200);    // المضيف يحذف
  assert.equal((await v1.post(`/live/${l.id}/block`, { userId: v2.me.id })).status, 403);
  const b = await host.post(`/live/${l.id}/block`, { userId: v2.me.id });
  assert.equal(b.status, 200); assert.equal(b.body.removedComments, 1);
  assert.equal((await host.get(`/live/${l.id}`)).body.comments.length, 0);
  assert.equal((await v2.post(`/live/${l.id}/join`)).status, 404);       // المحظور لا يرى البث
  assert.equal((await v2.post(`/live/${l.id}/comments`, { text: 'x' })).status, 404);
  assert.ok(!(await v2.get('/live')).body.lives.some((x) => x.id === l.id));
  // المشرف ينهي أي بث
  assert.equal((await v1.post(`/live/${l.id}/end`)).status, 403);
  const admin = new Client(); assert.equal((await admin.post('/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
  assert.equal((await admin.get(`/live/${l.id}`)).body.canModerate, true);
  const e = await admin.post(`/live/${l.id}/end`);
  assert.equal(e.status, 200); assert.equal(e.body.live.endReason, 'admin');
  assert.equal((await v1.post(`/live/${l.id}/comments`, { text: 'late' })).status, 410);
});

test('private host: only followers can watch', { skip }, async () => {
  const host = await user('priv'); const stranger = await user('str'); const fan = await user('pf');
  await follow(fan, host);
  assert.ok((await host.req('PATCH', '/me/settings', { isPrivate: true })).status < 300);
  const l = (await host.post('/live', {})).body.live;
  assert.equal((await fan.post(`/live/${l.id}/join`)).status, 200);
  assert.ok((await fan.get('/live')).body.lives.some((x) => x.id === l.id));
  assert.ok(!(await stranger.get('/live')).body.lives.some((x) => x.id === l.id));
  assert.equal((await stranger.post(`/live/${l.id}/join`)).status, 404);
  assert.equal((await new Client().get(`/live/${l.id}`)).status, 404);
  await host.post(`/live/${l.id}/end`);
});

test('host that never connects (or drops) is ended gracefully after the grace period', { skip }, async () => {
  const host = await user('drop');
  const l = (await host.post('/live', { title: 'انقطاع' })).body.live;
  let st; for (let i = 0; i < 40; i++) { st = (await host.get(`/live/${l.id}`)).body.live; if (st.status === 'ended') break; await sleep(400); }
  assert.equal(st.status, 'ended'); assert.equal(st.endReason, 'disconnect');
});

test('end + save as clip: last segments are joined, trimmed to the cap, and published through the transcode pipeline', { skip }, async () => {
  const host = await user('save');
  const l = (await host.post('/live', { title: 'حفظ البث' })).body.live;
  const sse = await host.events(); await sleep(150);
  const fd = new FormData();
  fd.append('seg', new Blob([fs.readFileSync(seg('a.webm', 2))], { type: 'video/webm' }), 'a.webm');
  fd.append('seg', new Blob([fs.readFileSync(seg('b.webm', 2, { audio: false }))], { type: 'video/webm' }), 'b.webm');
  fd.append('durs', JSON.stringify([2, 2]));
  const other = await user('x'); assert.equal((await other.req('POST', `/live/${l.id}/save`, undefined, { form: fd })).status, 403);
  const r = await host.req('POST', `/live/${l.id}/save`, undefined, { form: fd });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  const ev = await sse.wait('live-saved', () => true, 60000); sse.close();
  assert.ok(ev.data.videoId, JSON.stringify(ev.data));
  let v; for (let i = 0; i < 60; i++) { v = (await host.get(`/videos/${ev.data.videoId}`)).body; if (v?.mediaStatus === 'ready') break; await sleep(500); }
  assert.equal(v.mediaStatus, 'ready'); assert.equal(v.status, 'published'); assert.equal(v.caption, 'حفظ البث');
  assert.ok(v.poster);
  const file = path.join(upl, v.src.replace('/uploads/', ''));
  const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const vs = pr.streams.find((s) => s.codec_type === 'video'); const as = pr.streams.find((s) => s.codec_type === 'audio');
  assert.equal(vs.codec_name, 'h264'); assert.equal(as.codec_name, 'aac'); assert.equal(vs.width, 360); assert.equal(vs.height, 640);
  const dur = Number(pr.format.duration); assert.ok(dur > 2.5 && dur < 3.7, 'capped to MAX_VIDEO_SEC=3, got ' + dur);
  const live = (await host.get(`/live/${l.id}`)).body.live;
  assert.equal(live.status, 'ended'); assert.equal(live.savedVideoId, v.id);
  assert.equal((await host.req('POST', `/live/${l.id}/save`, undefined, { form: fd })).status, 409);
});

test('calls: only mutual followers / existing conversation, ring → accept → end, with SSE signalling', { skip }, async () => {
  const a = await user('ca'); const b = await user('cb');
  assert.equal((await a.get(`/calls/can/${b.me.id}`)).body.can, false);
  assert.equal((await a.post('/calls', { to: b.me.id, kind: 'video' })).status, 403);
  await follow(a, b); assert.equal((await a.get(`/calls/can/${b.me.id}`)).body.can, false);   // متابعة من طرف واحد لا تكفي
  await follow(b, a); assert.equal((await a.get(`/calls/can/${b.me.id}`)).body.can, true);
  const sb = await b.events(); const sa = await a.events(); await sleep(150);
  const c = await a.post('/calls', { to: b.me.id, kind: 'video' });
  assert.equal(c.status, 201, JSON.stringify(c.body)); assert.equal(c.body.delivered, true);
  assert.equal(jwtBody(c.body.token).video.room, `call-${c.body.call.id}`);
  const ring = await sb.wait('call'); assert.equal(ring.data.call.id, c.body.call.id); assert.equal(ring.data.from.id, a.me.id); assert.equal(ring.data.call.kind, 'video');
  assert.equal((await a.post(`/calls/${c.body.call.id}/accept`)).status, 403);     // المتصل لا يقبل مكالمته
  const acc = await b.post(`/calls/${c.body.call.id}/accept`);
  assert.equal(acc.status, 200); assert.equal(acc.body.call.status, 'active'); assert.equal(jwtBody(acc.body.token).sub, b.me.id);
  await sa.wait('call-accepted', (d) => d.id === c.body.call.id);
  assert.equal((await new Client().get(`/calls/${c.body.call.id}`)).status, 401);
  assert.equal((await a.post(`/calls/${c.body.call.id}/end`)).status, 200);
  const end = await sb.wait('call-end', (d) => d.id === c.body.call.id); assert.equal(end.data.status, 'ended');
  assert.ok(!(await b.get('/notifications')).body.notifications.some((x) => x.type === 'call'));    // مكالمة مُجابة ليست فائتة
  sa.close(); sb.close();
});

test('calls: decline and ring timeout create missed-call entries; busy and blocks are respected', { skip }, async () => {
  const a = await user('da'); const b = await user('db'); const d = await user('dd');
  await follow(a, b); await follow(b, a);
  const sa = await a.events(); await sleep(150);
  const c1 = (await a.post('/calls', { to: b.me.id, kind: 'audio' })).body.call;
  assert.equal((await b.post(`/calls/${c1.id}/decline`)).status, 200);
  assert.equal((await sa.wait('call-end', (x) => x.id === c1.id)).data.status, 'declined');
  let notes = (await b.get('/notifications')).body.notifications.filter((x) => x.type === 'call');
  assert.equal(notes.length, 1); assert.equal(notes[0].text, 'missed:audio'); assert.equal(notes[0].fromId, a.me.id);
  // لم يُجب: ينتهي الرنين بعد CALL_RING_SEC=3 ويُسجَّل فائتاً
  const c2 = (await a.post('/calls', { to: b.me.id, kind: 'video' })).body.call;
  assert.equal((await sa.wait('call-end', (x) => x.id === c2.id, 10000)).data.status, 'missed');
  notes = (await b.get('/notifications')).body.notifications.filter((x) => x.type === 'call');
  assert.equal(notes.length, 2); assert.ok(notes.some((x) => x.text === 'missed:video'));
  assert.equal((await b.post(`/calls/${c2.id}/accept`)).status, 410);
  // مشغول: د يتصل بـ ب أثناء مكالمة نشطة (محادثة سابقة تسمح بالاتصال)
  assert.equal((await d.post(`/users/${b.me.id}/messages`, { text: 'مرحبا' })).status, 201);
  assert.equal((await d.get(`/calls/can/${b.me.id}`)).body.can, true);
  const c3 = (await a.post('/calls', { to: b.me.id })).body.call;
  await b.post(`/calls/${c3.id}/accept`);
  assert.equal((await d.post('/calls', { to: b.me.id })).status, 409);
  await a.post(`/calls/${c3.id}/end`);
  // الحظر يمنع الاتصال حتى مع متابعة متبادلة
  assert.equal((await b.post(`/users/${a.me.id}/block`)).status < 300, true);
  assert.equal((await a.post('/calls', { to: b.me.id })).status, 403);
  assert.equal((await a.get(`/calls/can/${b.me.id}`)).body.reason, 'blocked');
  sa.close();
});
