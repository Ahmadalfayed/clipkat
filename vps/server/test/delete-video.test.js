// © 2026 وطن النهار — حذف الفيديو: صاحبه فقط، حذف الصف وما يرتبط به، حذف الملفات من القرص، أثناء التحويل، والريمكس المبني عليه
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
const PORT = 39990 + crypto.randomInt(0, 9);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-del-'));
const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-del-fx-'));
let srv, db;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
}
let n = 0;
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${++n}${crypto.randomBytes(2).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function upload(c, caption, { file = SAMPLE, type = 'video/mp4', name = 'v.mp4', ...extra } = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)], { type }), name);
  fd.append('caption', caption);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const r = await c.req('POST', '/videos', undefined, { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
// كل ملفات المقطع على القرص (باسم معرّفه) في مجلدي الفيديو والصور لصاحبه
const filesOf = (v) => ['videos', 'images'].flatMap((k) => { const d = path.join(upl, k, v.userId); try { return fs.readdirSync(d).filter((f) => f.includes(v.id)).map((f) => `${k}/${f}`); } catch { return []; } });
const count = async (table, id) => Number((await db.query(`select count(*) as n from ${table} where video_id = $1`, [id])).rows[0].n);

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl,
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', LIVEKIT_URL: '', TRANSCODE_POLL_MS: '400' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
  db = new pg.Client({ connectionString: DB }); await db.connect();
});
after(async () => { await db?.end(); srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(fx, { recursive: true, force: true }); });

test('only the owner can delete: others get 403, guests 401, missing 404', async () => {
  const owner = await user('own'); const other = await user('oth');
  const v = await upload(owner, 'مقطعي');
  await sleep(300);
  const before = filesOf(v); assert.ok(before.length >= 1, JSON.stringify(before));
  assert.equal((await new Client().del(`/videos/${v.id}`)).status, 401);
  const r = await other.del(`/videos/${v.id}`);
  assert.equal(r.status, 403); assert.equal(r.body.error, 'forbidden');
  assert.ok((await other.get(`/videos/${v.id}`)).body?.id === v.id);
  assert.deepEqual(filesOf(v), before);
  assert.equal((await owner.del(`/videos/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await owner.del('/videos/not-a-uuid')).status, 400);
});

test('owner delete removes the row, likes/comments/saves/notifications, and the video + thumbnail files', async () => {
  const owner = await user('own'); const fan = await user('fan');
  const v = await upload(owner, 'يحذف');
  await sleep(500);
  assert.equal((await fan.post(`/videos/${v.id}/like`)).status < 300, true);
  assert.equal((await fan.post(`/videos/${v.id}/save`)).status < 300, true);
  assert.equal((await fan.post(`/videos/${v.id}/comments`, { text: 'حلو' })).status, 201);
  assert.ok(await count('likes', v.id) === 1 && await count('saves', v.id) === 1 && await count('comments', v.id) === 1);
  assert.ok(await count('notifications', v.id) >= 1);
  const files = filesOf(v);
  assert.ok(files.some((f) => f.startsWith('videos/')) && files.some((f) => f.startsWith('images/')), JSON.stringify(files));
  const r = await owner.del(`/videos/${v.id}`);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true); assert.ok(r.body.filesRemoved >= 2);
  assert.deepEqual(filesOf(v), []);
  for (const f of files) assert.equal(fs.existsSync(path.join(upl, f.split('/')[0], v.userId, f.split('/')[1])), false);
  assert.equal((await fan.get(`/videos/${v.id}`)).body, null);
  for (const t of ['likes', 'saves', 'comments', 'notifications']) assert.equal(await count(t, v.id), 0, t);
  assert.equal((await owner.del(`/videos/${v.id}`)).status, 404);
  const feed = await fan.get(`/users/${owner.me.id}/videos`);
  if (feed.status === 200) assert.ok(!JSON.stringify(feed.body).includes(v.id));
  // ملفات المستخدم الأخرى لا تُمس
  const keep = await upload(owner, 'يبقى'); await sleep(300);
  const keepFiles = filesOf(keep); const v2 = await upload(owner, 'يحذف ٢'); await sleep(300);
  assert.equal((await owner.del(`/videos/${v2.id}`)).status, 200);
  assert.deepEqual(filesOf(keep), keepFiles); assert.deepEqual(filesOf(v2), []);
});

test('deleting while the clip is still converting removes the original and any conversion output', async () => {
  const owner = await user('proc');
  const webm = path.join(fx, 'rec.webm');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=480x854:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=4', '-c:v', 'libvpx', '-b:v', '800k', '-deadline', 'realtime', '-c:a', 'libopus', webm], { timeout: 60000 });
  const v = await upload(owner, 'قيد التحويل', { file: webm, type: 'video/webm', name: 'rec.webm' });
  assert.equal(v.mediaStatus, 'processing');
  await sleep(150);          // التحويل بدأ غالباً
  assert.equal((await owner.del(`/videos/${v.id}`)).status, 200);
  for (let i = 0; i < 60 && filesOf(v).length; i++) await sleep(250);
  await sleep(2500);         // مهمة التحويل الجارية تنتهي وتكتشف الحذف
  assert.deepEqual(filesOf(v), []);
  const left = fs.readdirSync(path.join(upl, 'videos', v.userId)).filter((f) => f.includes(v.id)); assert.deepEqual(left, []);
  assert.equal((await owner.get('/health')).status, 200);
  assert.equal((await db.query('select count(*)::int as n from videos where id = $1', [v.id])).rows[0].n, 0);
});

test('duets/stitches of a deleted clip stay up and show the source as unavailable; admin moderation still works', async () => {
  const author = await user('src'); const fan = await user('duo');
  const src = await upload(author, 'الأصل'); await sleep(300);
  const duet = await upload(fan, 'ديويتو', { sourceClipId: src.id, remixType: 'duet' });
  assert.equal((await fan.get(`/videos/${duet.id}`)).body.source.available, true);
  assert.equal((await author.del(`/videos/${src.id}`)).status, 200);
  const after = (await fan.get(`/videos/${duet.id}`)).body;
  assert.equal(after.id, duet.id); assert.equal(after.remixType, 'duet'); assert.deepEqual(after.source, { available: false });
  assert.ok(filesOf(duet).length >= 1);
  // المشرف يبقى قادراً على حذف مقطع مخالف
  const adm = new Client(); assert.equal((await adm.post('/auth/login', ADMIN)).status, 200);
  assert.equal((await adm.del(`/videos/${duet.id}`)).status, 200);
  assert.deepEqual(filesOf(duet), []);
});
