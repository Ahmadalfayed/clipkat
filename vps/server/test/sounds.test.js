// © 2026 وطن النهار — اختبارات المرحلة 2: مكتبة الأصوات، التحقق، الخصوصية والحظر
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
const PORT = 39100 + crypto.randomInt(0, 800);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
const fx = path.join(os.tmpdir(), 'ck-sound-fx-' + crypto.randomBytes(4).toString('hex'));
let srv; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-snd-'));

function wav(name, seconds) {
  fs.mkdirSync(fx, { recursive: true });
  const out = path.join(fx, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-ar', '44100', '-ac', '1', out], { timeout: 20000 });
  return out;
}

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, { form, headers = {} } = {}) {
    const h = { 'X-CK': '1', ...headers }; if (this.cookie) h.cookie = ck(this);
    function ck(c) { return c.cookie; }
    let b; if (form) b = form; else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); } patch(p, b) { return this.req('PATCH', p, b); } del(p) { return this.req('DELETE', p); }
}
async function user(name) {
  const c = new Client();
  const r = await c.post('/auth/signup', { email: `${name}-${crypto.randomUUID().slice(0, 8)}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function uploadVideo(c, caption = 'clip') {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', caption);
  const r = await c.req('POST', '/videos', undefined, { form: fd }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
async function uploadSound(c, file, title = 'tone') {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('title', title);
  return c.req('POST', '/sounds', undefined, { form: fd });
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', MAX_SOUND_SEC: '5' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(fx, { recursive: true, force: true }); });

test('unauthenticated users cannot upload sounds or extract', async () => {
  const anon = new Client();
  assert.equal((await anon.post('/sounds', { title: 'x' })).status, 401);
  assert.equal((await anon.post('/videos/' + crypto.randomUUID() + '/extract-sound', { title: 'x' })).status, 401);
});

test('sound upload validates type, duration and records the clip', async () => {
  const a = await user('snd_ok');
  const bad = path.join(fx, 'nope.txt'); fs.mkdirSync(fx, { recursive: true }); fs.writeFileSync(bad, 'not audio');
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(bad)]), 'nope.txt'); fd.append('title', 'bad');
  assert.equal((await a.req('POST', '/sounds', undefined, { form: fd })).status, 400);

  const long = wav('long.wav', 8); // MAX_SOUND_SEC=5 في هذا الاختبار
  assert.equal((await uploadSound(a, long, 'too long')).status, 400);

  const short = wav('ok.wav', 1.2);
  const r = await uploadSound(a, short, 'نغمة اختبار');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.title, 'نغمة اختبار');
  assert.ok(r.body.durationMs > 1000 && r.body.durationMs < 2000);
  assert.ok(r.body.src.startsWith('/uploads/sounds/'));
  assert.equal((await a.get('/sounds/' + r.body.id)).body.id, r.body.id);
  assert.ok((await a.get('/sounds')).body.some((s) => s.id === r.body.id));
});

test('can attach a sound when publishing and list clips that use it', async () => {
  const a = await user('snd_use');
  const s = (await uploadSound(a, wav('use.wav', 1), 'للاستخدام')).body;
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', 'with sound'); fd.append('soundId', s.id);
  const v = await a.req('POST', '/videos', undefined, { form: fd });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  assert.equal(v.body.soundId, s.id);
  assert.equal(v.body.sound, 'للاستخدام');
  const list = (await a.get('/videos?soundId=' + s.id)).body;
  assert.ok(list.some((x) => x.id === v.body.id));
  assert.equal((await a.get('/sounds/' + s.id)).body.usesCount, 1);
  const page = (await a.get('/sounds/' + s.id + '/videos')).body;
  assert.ok(page.some((x) => x.id === v.body.id));
});

test('regular user can publish with "save as sound" ticked (sound saved, linked, no 500)', async () => {
  const u = await user('saver' + crypto.randomBytes(2).toString('hex'));
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', 'with sound'); fd.append('saveSound', '1');
  const r = await u.req('POST', '/videos', undefined, { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.soundId, 'video should link to the extracted sound');
  const so = await u.get('/sounds/' + r.body.soundId);
  assert.equal(so.status, 200, JSON.stringify(so.body));
  const snd = so.body.sound || so.body;
  assert.equal(snd.sourceVideoId, r.body.id);
  assert.equal(snd.userId, u.me.id);
});

test('upload with an empty or wrong MIME type (phone .mov) is accepted by content sniffing', async () => {
  const u = await user('mover' + crypto.randomBytes(2).toString('hex'));
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)]), 'VID_2026.MOV'); fd.append('caption', 'no mime');
  const r = await u.req('POST', '/videos', undefined, { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('extract-sound from a visible video is idempotent and owned by the video owner', async () => {
  const o = await user('snd_own'); const f = await user('snd_fan');
  const v = await uploadVideo(o, 'extract me');
  const first = await f.post(`/videos/${v.id}/extract-sound`, { title: 'صوت المقطع' });
  assert.ok(first.status === 201 || first.status === 200, JSON.stringify(first.body));
  assert.equal(first.body.userId, o.me.id);
  const again = await o.post(`/videos/${v.id}/extract-sound`, {});
  assert.equal(again.body.id, first.body.id);
});

test('private and blocked sounds are hidden; invalid soundId is rejected', async () => {
  const o = await user('snd_priv'); const x = await user('snd_x'); const y = await user('snd_y');
  const snd = (await uploadSound(o, wav('priv.wav', 1), 'خاص')).body;
  await o.patch('/me/settings', { isPrivate: true });
  assert.equal((await x.get('/sounds/' + snd.id)).body, null);
  assert.ok(!(await x.get('/sounds')).body.some((s) => s.id === snd.id));
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('soundId', snd.id);
  assert.equal((await x.req('POST', '/videos', undefined, { form: fd })).status, 404);

  const pub = await user('snd_pub');
  const ps = (await uploadSound(pub, wav('pub.wav', 1), 'عام')).body;
  await pub.post(`/users/${x.me.id}/block`); // wait, pub blocks x? we need x blocked from seeing pub
  await pub.post(`/users/${x.me.id}/block`);
  // x is blocked by pub — pub's content hidden from x
  assert.equal((await x.get('/sounds/' + ps.id)).body, null);
  assert.equal((await y.get('/sounds/' + ps.id)).body.id, ps.id);

  const fake = crypto.randomUUID();
  const fd2 = new FormData(); fd2.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd2.append('soundId', fake);
  assert.equal((await y.req('POST', '/videos', undefined, { form: fd2 })).status, 404);
});

test('can report a sound; admin can hide it', async () => {
  const o = await user('snd_rep_o'); const r = await user('snd_rep_r');
  const s = (await uploadSound(o, wav('rep.wav', 1), 'مزعج')).body;
  assert.equal((await r.post('/reports', { type: 'sound', id: s.id, reason: 'spam' })).status, 201);
  assert.equal((await r.post('/reports', { type: 'sound', id: s.id, reason: 'spam' })).status, 409);
  const admin = new Client(); assert.equal((await admin.post('/auth/login', ADMIN)).status, 200);
  const open = (await admin.get('/admin/reports')).body.reports.find((x) => x.soundId === s.id);
  assert.ok(open); assert.equal(open.type, 'sound');
  assert.equal((await admin.post(`/admin/reports/${open.id}/resolve`, { action: 'hide_sound' })).status, 200);
  assert.equal((await r.get('/sounds/' + s.id)).body, null);
});

test('studio and sound library pages are served', async () => {
  const root = BASE.replace(/\/api$/, '');
  for (const p of ['/js/views/studio.js', '/js/views/sound.js', '/js/studio-export.js']) assert.equal((await fetch(root + p)).status, 200, p);
  const app = await (await fetch(root + '/js/app.js')).text();
  assert.ok(app.includes("upload: () => import('./views/studio.js')"));
  assert.ok(app.includes("sound: () => import('./views/sound.js')"));
  const st = await (await fetch(root + '/js/views/studio.js')).text();
  assert.ok(st.includes('MediaRecorder') && st.includes('getUserMedia'));
  const exp = await (await fetch(root + '/js/studio-export.js')).text();
  assert.ok(exp.includes('captureStream') && exp.includes('FILTERS'));
});
