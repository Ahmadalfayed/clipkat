// © 2026 وطن النهار — حماية ملفات الفيديو: تشغيل عبر روابط موقّعة قصيرة العمر (Range/206)، ومنع /uploads/videos العام
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { rawUrl } from './helpers/media-url.mjs';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const PORT = 40030 + crypto.randomInt(0, 9);
const ORIGIN = `http://127.0.0.1:${PORT}`; const BASE = `${ORIGIN}/api`;
const SECRET = crypto.randomBytes(32).toString('hex');
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-prot-'));
let srv; let media;

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
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}
const raw = async (url, headers = {}, method = 'GET') => { const res = await fetch(ORIGIN + url, { method, headers }); return { status: res.status, h: res.headers, buf: Buffer.from(await res.arrayBuffer()) }; };
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${crypto.randomBytes(3).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201); c.me = r.body.user; return c;
}
async function upload(c) {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', 'محمي');
  const r = await c.req('POST', '/videos', undefined, { form: fd }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET, UPLOAD_DIR: upl,
    ADMIN_EMAIL: '', ADMIN_PASSWORD: '', RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', LIVEKIT_URL: '', TRANSCODE_POLL_MS: '400' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
  process.env.JWT_SECRET = SECRET; process.env.UPLOAD_DIR = upl; process.env.DATABASE_URL ||= DB;
  media = await import('../src/media-auth.js');      // نفس المفتاح → نصنع روابط منتهية للاختبار
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('API returns signed playback URLs; Range requests get 206 with correct headers (seeking / iOS Safari), full GET 200', async () => {
  const owner = await user('pv'); const v = await upload(owner);
  assert.match(v.src, /^\/vs\/[\w-]+\/[\w-]+\.mp4$/);
  assert.doesNotMatch(JSON.stringify(v), /\/uploads\/videos\//);
  const file = fs.readFileSync(SAMPLE);
  const r = await raw(v.src, { Range: 'bytes=0-99' });
  assert.equal(r.status, 206);
  assert.equal(r.h.get('content-range'), `bytes 0-99/${file.length}`);
  assert.equal(r.h.get('content-length'), '100');
  assert.equal(r.h.get('content-type'), 'video/mp4');
  assert.equal(r.h.get('accept-ranges'), 'bytes');
  assert.match(r.h.get('cache-control'), /^private, max-age=\d+$/);
  assert.equal(r.h.get('content-disposition'), 'inline');
  assert.equal(r.h.get('cross-origin-resource-policy'), 'same-origin');
  assert.ok(r.buf.equals(file.subarray(0, 100)));
  const mid = await raw(v.src, { Range: `bytes=${file.length - 500}-` });
  assert.equal(mid.status, 206); assert.ok(mid.buf.equals(file.subarray(file.length - 500)));
  const full = await raw(v.src); assert.equal(full.status, 200); assert.ok(full.buf.equals(file));
  const head = await raw(v.src, {}, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.h.get('content-length'), String(file.length));
  assert.equal((await raw(v.src, { Range: `bytes=${file.length + 10}-` })).status, 416);
});

test('logged-out viewers get signed URLs from the feed and can play them', async () => {
  const owner = await user('pub'); const v = await upload(owner);
  const guest = new Client();
  const one = await guest.get(`/videos/${v.id}`); assert.equal(one.status, 200); assert.match(one.body.src, /^\/vs\//);
  const list = await guest.get(`/videos?userId=${owner.me.id}`);
  const items = Array.isArray(list.body) ? list.body : list.body.videos;
  assert.ok(items.every((x) => x.src.startsWith('/vs/')));
  assert.equal((await raw(one.body.src, { Range: 'bytes=0-1' })).status, 206);
});

test('expired and tampered tokens are rejected', async () => {
  const owner = await user('tk'); const v = await upload(owner);
  const rawPath = rawUrl(v.src);
  // نفس المفتاح: رابط صدر قبل 3 ساعات → منتهي
  const expired = media.playUrl(rawPath, Math.floor(Date.now() / 1000) - 3 * 3600);
  assert.equal((await raw(expired, { Range: 'bytes=0-9' })).status, 403);
  const fresh = media.playUrl(rawPath); assert.equal((await raw(fresh, { Range: 'bytes=0-9' })).status, 206);
  const [, , payload, sigExt] = v.src.split('/');
  const flip = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  assert.equal((await raw(`/vs/${payload}/${flip(sigExt, 3)}`)).status, 403);                 // توقيع معدّل
  const forged = Buffer.from(JSON.stringify({ p: JSON.parse(Buffer.from(payload, 'base64url')).p, e: 9999999999 })).toString('base64url');
  assert.equal((await raw(`/vs/${forged}/${sigExt}`)).status, 403);                           // تمديد الصلاحية بدون توقيع
  const other = Buffer.from(JSON.stringify({ p: `${owner.me.id}/../../etc/passwd`, e: 9999999999 })).toString('base64url');
  assert.equal((await raw(`/vs/${other}/${sigExt}`)).status, 403);
  assert.equal((await raw('/vs/x/y')).status, 403);
  // رابط موقّع بمفتاح مختلف
  const badKey = crypto.createHmac('sha256', 'wrong').update(payload).digest('base64url');
  assert.equal((await raw(`/vs/${payload}/${badKey}.mp4`)).status, 403);
});

test('old public /uploads/videos paths (and bypass variants) are blocked; thumbnails stay public', async () => {
  const owner = await user('old'); const v = await upload(owner);
  const p = rawUrl(v.src); const rel = p.replace('/uploads/videos/', '');
  assert.ok(fs.existsSync(path.join(upl, 'videos', rel)));
  for (const u of [p, `/uploads//videos/${rel}`, `/uploads/./videos/${rel}`, `/uploads/Videos/${rel}`, `/uploads/%76ideos/${rel}`, `/uploads/images/../videos/${rel}`, `/uploads/videos/${owner.me.id}/`, '/uploads/videos/', '/uploads/_tmp/x', '/uploads/.dlcache/x']) {
    const r = await raw(u); assert.ok([403, 404].includes(r.status), `${u} → ${r.status}`); assert.ok(!r.buf.subarray(4, 8).equals(Buffer.from('ftyp')), u);
  }
  if (v.poster?.startsWith('/uploads/images/')) { const ps = await raw(v.poster); assert.equal(ps.status, 200); assert.match(ps.h.get('content-type'), /^image\//); }
  assert.equal((await raw('/media/videos/coffee.mp4', { Range: 'bytes=0-9' })).status, 206);   // أمثلة الموقع العامة كما هي
});
