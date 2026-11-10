// © 2026 وطن النهار — المرحلة 4: صلاحيات الديويتو والستيتش، الخصوصية/الحظر، الإسناد والقائمة
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
const PORT = 39400 + crypto.randomInt(0, 500);
const BASE = `http://127.0.0.1:${PORT}/api`;
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
let srv; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-p4-'));

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
  patch(p, b) { return this.req('PATCH', p, b); } del(p) { return this.req('DELETE', p); }
}
async function user(name) {
  const c = new Client();
  const r = await c.post('/auth/signup', { email: `${name}-${crypto.randomUUID().slice(0, 8)}@test.local`, username: name.slice(0, 24), name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function upload(c, caption, extra = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4');
  fd.append('caption', caption);
  if (extra.status) fd.append('status', extra.status);
  if (extra.sourceClipId) fd.append('sourceClipId', extra.sourceClipId);
  if (extra.remixType) fd.append('remixType', extra.remixType);
  const r = await c.req('POST', '/videos', undefined, { form: fd });
  return r;
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('remix settings default on and are persisted', async () => {
  const a = await user('rs_owner');
  assert.deepEqual((await a.get('/me/settings')).body, { isPrivate: false, commentPolicy: 'everyone', messagePolicy: 'everyone', allowDuet: true, allowStitch: true });
  const p = await a.patch('/me/settings', { allowDuet: false, allowStitch: false });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.allowDuet, false);
  assert.equal(p.body.allowStitch, false);
  assert.equal((await a.patch('/me/settings', { allowDuet: 'yes' })).status, 400);
  await a.patch('/me/settings', { allowDuet: true, allowStitch: true });
});

test('permission settings enforced: remixOff, incomplete pair, stitch independent of duet', async () => {
  const owner = await user('rm_own'); const fan = await user('rm_fan'); const stranger = await user('rm_str');
  const up = await upload(owner, 'مصدر');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const src = up.body;
  assert.equal(src.canDuet, true);
  assert.equal(src.canStitch, true);

  const okD = await upload(fan, 'ديويتو', { sourceClipId: src.id, remixType: 'duet' });
  assert.equal(okD.status, 201, JSON.stringify(okD.body));
  assert.equal(okD.body.remixType, 'duet');
  assert.equal(okD.body.sourceClipId, src.id);
  assert.equal(okD.body.source?.available, true);
  assert.equal(okD.body.source?.username, owner.me.username);

  await owner.patch('/me/settings', { allowDuet: false });
  const off = await upload(stranger, 'ممنوع', { sourceClipId: src.id, remixType: 'duet' });
  assert.equal(off.status, 403);
  assert.equal(off.body?.error, 'remixOff');
  assert.equal((await upload(stranger, 'ستيتش مسموح', { sourceClipId: src.id, remixType: 'stitch' })).status, 201);
  await owner.patch('/me/settings', { allowDuet: true, allowStitch: false });
  assert.equal((await upload(stranger, 'ستيتش ممنوع', { sourceClipId: src.id, remixType: 'stitch' })).status, 403);
  await owner.patch('/me/settings', { allowStitch: true });

  assert.equal((await upload(fan, 'ناقص', { sourceClipId: src.id })).status, 400);
  assert.equal((await upload(fan, 'ناقص2', { remixType: 'duet' })).status, 400);
});

test('privacy and blocking: private hidden until follow approved; block hides source', async () => {
  const owner = await user('pv_own'); const fan = await user('pv_fan'); const blocked = await user('pv_blk');
  const src = (await upload(owner, 'خاص مصدر')).body;
  await owner.patch('/me/settings', { isPrivate: true });
  assert.equal((await upload(fan, 'قبل الموافقة', { sourceClipId: src.id, remixType: 'duet' })).status, 404);

  const fol = await fan.post(`/users/${owner.me.id}/follow`);
  assert.ok(fol.status === 200 || fol.status === 201, JSON.stringify(fol.body));
  const acc = await owner.post(`/me/follow-requests/${fan.me.id}/accept`, {});
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  const after = await upload(fan, 'بعد الموافقة', { sourceClipId: src.id, remixType: 'duet' });
  assert.equal(after.status, 201, JSON.stringify(after.body));

  await owner.post(`/users/${blocked.me.id}/block`, {});
  assert.equal((await upload(blocked, 'محظور', { sourceClipId: src.id, remixType: 'duet' })).status, 404);
});

test('attribution, remix listing, notification, and unavailable after source delete', async () => {
  const owner = await user('at_own'); const fan = await user('at_fan');
  const src = (await upload(owner, 'مصدر القائمة')).body;
  const duet = await upload(fan, 'ديويتو ظاهر', { sourceClipId: src.id, remixType: 'duet' });
  assert.equal(duet.status, 201, JSON.stringify(duet.body));
  const got = await owner.get('/videos/' + duet.body.id);
  assert.equal(got.status, 200);
  assert.equal(got.body.source?.available, true);
  assert.equal(got.body.source?.username, owner.me.username);
  assert.equal(got.body.remixType, 'duet');

  const list = await owner.get('/videos/' + src.id + '/remixes');
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const ids = (Array.isArray(list.body) ? list.body : list.body.videos || []).map((v) => v.id);
  assert.ok(ids.includes(duet.body.id));
  const srcGot = await owner.get('/videos/' + src.id);
  assert.ok(srcGot.body.remixCount >= 1);

  const notes = await owner.get('/notifications');
  const arr = notes.body?.notifications || notes.body || [];
  assert.ok(arr.some((n) => n.type === 'remix' && n.fromId === fan.me.id && n.videoId === duet.body.id && n.text === 'duet'), JSON.stringify(notes.body));

  const del = await owner.del('/videos/' + src.id);
  assert.equal(del.status, 200, JSON.stringify(del.body));
  const after = await fan.get('/videos/' + duet.body.id);
  assert.equal(after.status, 200);
  assert.equal(after.body.sourceClipId, null);
  assert.equal(after.body.remixType, 'duet');
  assert.equal(after.body.source?.available, false);
});
