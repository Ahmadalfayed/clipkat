// © 2026 وطن النهار — المرحلة 3: صلاحيات الرسائل، استبعاد الفيد، التصفح، المسودات والجدولة
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
const PORT = 39200 + crypto.randomInt(0, 700);
const BASE = `http://127.0.0.1:${PORT}/api`;
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
let srv; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-p3-'));

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
  if (extra.scheduledAt) fd.append('scheduledAt', extra.scheduledAt);
  if (extra.hashtags) fd.append('hashtags', JSON.stringify(extra.hashtags));
  const r = await c.req('POST', '/videos', undefined, { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('unauthenticated users cannot use DMs, drafts or watch tracking', async () => {
  const a = new Client();
  assert.equal((await a.get('/conversations')).status, 401);
  assert.equal((await a.post('/users/' + crypto.randomUUID() + '/messages', { text: 'hi' })).status, 401);
  assert.equal((await a.get('/me/drafts')).status, 401);
  assert.equal((await a.post('/videos/' + crypto.randomUUID() + '/watch', {})).status, 401);
});

test('DM policies, privacy and blocking are enforced', async () => {
  const a = await user('dm_a'); const b = await user('dm_b'); const c = await user('dm_c');
  // everyone (default)
  const s1 = await a.post(`/users/${b.me.id}/messages`, { type: 'text', text: 'مرحبا' });
  assert.equal(s1.status, 201, JSON.stringify(s1.body));
  assert.equal(s1.body.message.text, 'مرحبا');
  // nobody
  await b.patch('/me/settings', { messagePolicy: 'nobody' });
  assert.equal((await a.post(`/users/${b.me.id}/messages`, { text: 'again' })).status, 403);
  await b.patch('/me/settings', { messagePolicy: 'everyone' });
  // followers only
  await b.patch('/me/settings', { messagePolicy: 'followers' });
  assert.equal((await c.post(`/users/${b.me.id}/messages`, { text: 'x' })).status, 403);
  await c.post(`/users/${b.me.id}/follow`);
  assert.equal((await c.post(`/users/${b.me.id}/messages`, { text: 'من متابع' })).status, 201);
  // mutual
  await b.patch('/me/settings', { messagePolicy: 'mutual' });
  assert.equal((await c.post(`/users/${b.me.id}/messages`, { text: 'no' })).status, 403);
  await b.post(`/users/${c.me.id}/follow`);
  assert.equal((await c.post(`/users/${b.me.id}/messages`, { text: 'تبادل' })).status, 201);
  // private account: non-follower cannot message even if policy is everyone
  const p = await user('dm_priv');
  await p.patch('/me/settings', { isPrivate: true, messagePolicy: 'everyone' });
  assert.equal((await a.post(`/users/${p.me.id}/messages`, { text: 'x' })).status, 403);
  // block
  await b.patch('/me/settings', { messagePolicy: 'everyone' });
  await b.post(`/users/${a.me.id}/block`);
  assert.equal((await a.post(`/users/${b.me.id}/messages`, { text: 'بعد الحظر' })).status, 403);
  assert.ok(!(await a.get('/conversations')).body.conversations.some((x) => x.otherId === b.me.id));
});

test('DM clip share, unread, delete own message, report', async () => {
  const a = await user('dm2_a'); const b = await user('dm2_b');
  const v = await upload(a, 'clip to share');
  const sent = await a.post(`/users/${b.me.id}/messages`, { type: 'clip', videoId: v.id });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.message.type, 'clip');
  assert.equal(sent.body.message.videoId, v.id);
  const cid = sent.body.conversationId;
  const unread = (await b.get('/notifications/unread-count')).body;
  assert.ok(unread.messages >= 1);
  assert.equal((await b.get(`/conversations/${cid}/messages`)).body.messages.some((m) => m.videoId === v.id), true);
  await b.post(`/conversations/${cid}/read`, {});
  assert.equal((await b.get('/notifications/unread-count')).body.messages, 0);
  // cannot delete the other's message
  assert.equal((await b.del('/messages/' + sent.body.message.id)).status, 403);
  assert.equal((await a.del('/messages/' + sent.body.message.id)).status, 200);
  const after = (await b.get(`/conversations/${cid}/messages`)).body.messages.find((m) => m.id === sent.body.message.id);
  assert.equal(after.deleted, true);
  assert.equal(after.text, '');
  const t = await a.post(`/users/${b.me.id}/messages`, { text: 'رسالة للتبليغ' });
  assert.equal((await b.post('/reports', { type: 'message', id: t.body.message.id, reason: 'spam' })).status, 201);
  assert.equal((await b.post('/reports', { type: 'message', id: t.body.message.id, reason: 'spam' })).status, 409);
  assert.equal((await a.post('/reports', { type: 'message', id: t.body.message.id, reason: 'spam' })).status, 400); // self
});

test('For you feed excludes private, blocked, hidden, drafts and scheduled, and paginates without overlap', async () => {
  const viewer = await user('fy_view');
  const pub = await user('fy_pub');
  const priv = await user('fy_priv');
  const blk = await user('fy_blk');
  const v1 = await upload(pub, 'public one #قهوة');
  const v2 = await upload(pub, 'public two');
  const v3 = await upload(pub, 'public three');
  const hidden = await upload(pub, 'will hide');
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('update videos set is_hidden = true where id = $1', [hidden.id]);
  await cl.end();
  const draft = await upload(pub, 'draft clip', { status: 'draft' });
  const sched = await upload(pub, 'later clip', { status: 'scheduled', scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  await priv.patch('/me/settings', { isPrivate: true });
  const secret = await upload(priv, 'secret');
  const blockedVid = await upload(blk, 'from blocked');
  await viewer.post(`/users/${blk.me.id}/block`);

  const page = (await viewer.get('/videos?tab=foryou&limit=20')).body;
  assert.ok(page.videos && Array.isArray(page.videos), JSON.stringify(page));
  const ids = page.videos.map((x) => x.id);
  assert.ok(ids.includes(v1.id) && ids.includes(v2.id) && ids.includes(v3.id));
  assert.ok(!ids.includes(hidden.id));
  assert.ok(!ids.includes(draft.id));
  assert.ok(!ids.includes(sched.id));
  assert.ok(!ids.includes(secret.id));
  assert.ok(!ids.includes(blockedVid.id));
  // owner can still open their draft
  assert.equal((await pub.get('/videos/' + draft.id)).body.id, draft.id);
  assert.equal((await viewer.get('/videos/' + draft.id)).body, null);

  // pagination: no overlap
  const p1 = (await viewer.get('/videos?tab=foryou&limit=2')).body;
  assert.equal(p1.videos.length, 2);
  assert.equal(p1.hasMore, true);
  const p2 = (await viewer.get('/videos?tab=foryou&limit=2&cursor=' + encodeURIComponent(p1.cursor))).body;
  const set = new Set([...p1.videos, ...p2.videos].map((x) => x.id));
  assert.equal(set.size, p1.videos.length + p2.videos.length);

  // seen excluded
  await viewer.post(`/videos/${v1.id}/watch`, { completed: true });
  const after = (await viewer.get('/videos?tab=foryou&limit=20')).body.videos.map((x) => x.id);
  assert.ok(!after.includes(v1.id));
  const withSeen = (await viewer.get('/videos?tab=foryou&limit=20&includeSeen=1')).body.videos.map((x) => x.id);
  assert.ok(withSeen.includes(v1.id));
});

test('drafts stay private until published; scheduled videos go public when due (including after a simulated restart)', async () => {
  const u = await user('dr_owner'); const other = await user('dr_oth');
  const d = await upload(u, 'مسودة', { status: 'draft' });
  assert.equal(d.status, 'draft');
  assert.ok((await u.get('/me/drafts')).body.some((x) => x.id === d.id));
  assert.ok(!(await other.get('/videos?tab=foryou&limit=30')).body.videos.some((x) => x.id === d.id));
  assert.equal((await other.get('/videos/' + d.id)).body, null);
  assert.equal((await u.patch('/videos/' + d.id, { status: 'published' })).body.status, 'published');
  assert.ok((await other.get('/videos/' + d.id)).body.id === d.id);

  const s = await upload(u, 'مجدول', { status: 'scheduled', scheduledAt: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(s.status, 'scheduled');
  assert.equal((await other.get('/videos/' + s.id)).body, null);
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query("update videos set scheduled_at = now() - interval '1 minute' where id = $1", [s.id]);
  await cl.end();
  process.env.DATABASE_URL = DB;
  const { publishDue } = await import('../src/publisher.js');
  const n = await publishDue();
  assert.ok(n >= 1);
  assert.equal((await other.get('/videos/' + s.id)).body.status, 'published');
});
