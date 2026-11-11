// © 2026 وطن النهار — الدخول والاشتراك بحساب Google (مع محاكاة التحقق)
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
const PORT = 39500 + crypto.randomInt(0, 400);
const BASE = `http://127.0.0.1:${PORT}/api`;
const here = path.dirname(new URL(import.meta.url).pathname);
const hook = path.join(here, 'helpers/google-verify-stub.mjs');
const CLIENT_ID = 'test-clipkat-google-client';
let srv; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-gtest-'));

const tok = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, { headers = {}, raw = false } = {}) {
    const h = { ...headers }; if (!raw) h['X-CK'] = h['X-CK'] || '1'; if (this.cookie) h.cookie = this.cookie;
    let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json, cookie: this.cookie };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(here, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: DB,
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      UPLOAD_DIR: upl,
      RATE_AUTH_MAX: '500',
      RATE_API_MAX: '5000',
      GOOGLE_CLIENT_ID: CLIENT_ID,
      CLIPKAT_GOOGLE_VERIFY_MODULE: hook
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('server start timeout')), 30000);
    srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } });
    srv.on('exit', (c) => no(new Error('server exited ' + c)));
  });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('config reports googleClientId when configured', async () => {
  const r = await new Client().get('/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.googleClientId, CLIENT_ID);
});

test('Google sign-in requires the CSRF header', async () => {
  const r = await new Client().req('POST', '/auth/google', { credential: 'x' }, { raw: true, headers: {} });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'csrf');
});

test('invalid or unverified Google tokens are rejected', async () => {
  const c = new Client();
  assert.equal((await c.post('/auth/google', {})).status, 400);
  assert.equal((await c.post('/auth/google', { credential: 'not-valid' })).status, 401);
  assert.equal((await c.post('/auth/google', { credential: tok({ sub: 'g1', email: 'a@gmail.com', email_verified: false, name: 'A' }) })).status, 401);
  assert.equal((await c.post('/auth/google', { credential: tok({ sub: 'g1', email: 'a@gmail.com', name: 'A' }) })).status, 401);
  assert.equal((await c.post('/auth/google', { credential: tok({ sub: '', email: 'a@gmail.com', email_verified: true }) })).status, 401);
  assert.equal((await c.post('/auth/google', { credential: tok({ sub: 'g1', email: '', email_verified: true }) })).status, 401);
});

test('a new Google account is created with a unique username and a session, and has no usable password', async () => {
  const c = new Client();
  const r = await c.post('/auth/google', { credential: tok({ sub: 'sub-new-1', email: 'new.user@gmail.com', email_verified: true, name: 'New User' }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.username, 'new.user');
  assert.equal(r.body.user.name, 'New User');
  const db = new pg.Client({ connectionString: DB }); await db.connect();
  const stored = (await db.query('select email, google_sub, password_hash from profiles where id = $1', [r.body.user.id])).rows[0];
  await db.end();
  assert.equal(stored.email, 'new.user@gmail.com');
  assert.equal(stored.google_sub, 'sub-new-1');
  assert.equal(stored.password_hash, 'google$unusable');
  assert.ok(c.cookie.startsWith('ck_token='));
  assert.equal((await c.get('/auth/me')).body.user.username, 'new.user');
  const pw = await new Client().post('/auth/login', { email: 'new.user@gmail.com', password: 'any-password-123' });
  assert.equal(pw.status, 401);
});

test('signing in again with the same Google account logs into the existing profile', async () => {
  const first = new Client();
  const a = await first.post('/auth/google', { credential: tok({ sub: 'sub-again', email: 'again@gmail.com', email_verified: true, name: 'Again' }) });
  assert.equal(a.status, 201);
  const second = new Client();
  const b = await second.post('/auth/google', { credential: tok({ sub: 'sub-again', email: 'again@gmail.com', email_verified: true, name: 'Again' }) });
  assert.equal(b.status, 200);
  assert.equal(b.body.user.id, a.body.user.id);
  assert.equal((await second.get('/auth/me')).body.user.id, a.body.user.id);
});

test('an existing email/password account is linked and can still log in with the password', async () => {
  const email = 'linked@test.local';
  const password = 'pass-keep-12345';
  const c = new Client();
  const s = await c.post('/auth/signup', { email, username: 'linked_pw', name: 'Linked', password });
  assert.equal(s.status, 201);
  const g = await new Client().post('/auth/google', { credential: tok({ sub: 'sub-link-1', email, email_verified: true, name: 'Linked' }) });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.user.id, s.body.user.id);
  assert.equal(g.body.user.username, 'linked_pw');
  const again = await new Client().post('/auth/login', { email, password });
  assert.equal(again.status, 200);
  assert.equal(again.body.user.id, s.body.user.id);
});

test('a colliding username gets a numeric suffix', async () => {
  const taken = new Client();
  assert.equal((await taken.post('/auth/signup', { email: 'taken-own@test.local', username: 'samename', password: 'pass-12345678' })).status, 201);
  const g = await new Client().post('/auth/google', { credential: tok({ sub: 'sub-collide', email: 'samename@gmail.com', email_verified: true, name: 'Same' }) });
  assert.equal(g.status, 201, JSON.stringify(g.body));
  assert.equal(g.body.user.username, 'samename1');
  const db = new pg.Client({ connectionString: DB }); await db.connect();
  const stored = (await db.query('select email, google_sub from profiles where id = $1', [g.body.user.id])).rows[0];
  await db.end();
  assert.equal(stored.email, 'samename@gmail.com');
  assert.equal(stored.google_sub, 'sub-collide');
});

test('a banned profile cannot sign in with Google', async () => {
  const email = 'banned.g@test.local';
  const c = new Client();
  const s = await c.post('/auth/signup', { email, username: 'bannedg', password: 'pass-12345678' });
  assert.equal(s.status, 201);
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('update profiles set is_banned = true where id = $1', [s.body.user.id]);
  await cl.end();
  const g = await new Client().post('/auth/google', { credential: tok({ sub: 'sub-banned', email, email_verified: true, name: 'Banned' }) });
  assert.equal(g.status, 401);
});

test('a profile already linked to another Google account is rejected', async () => {
  const email = 'mismatch@test.local';
  const s = await new Client().post('/auth/signup', { email, username: 'mismatchu', password: 'pass-12345678' });
  assert.equal(s.status, 201);
  const first = await new Client().post('/auth/google', { credential: tok({ sub: 'sub-mm-a', email, email_verified: true, name: 'M' }) });
  assert.equal(first.status, 200);
  const second = await new Client().post('/auth/google', { credential: tok({ sub: 'sub-mm-b', email, email_verified: true, name: 'M' }) });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'googleLinked');
});

test('email and password signup and login still work unchanged', async () => {
  const email = 'classic@test.local';
  const password = 'classic-pass-99';
  const c = new Client();
  const s = await c.post('/auth/signup', { email, username: 'classic_u', name: 'Classic', password });
  assert.equal(s.status, 201);
  assert.equal(s.body.user.username, 'classic_u');
  const login = await new Client().post('/auth/login', { email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, s.body.user.id);
  assert.equal((await loginWait(login)).body.user.username, 'classic_u');
});

async function loginWait(login) {
  const c = new Client();
  c.cookie = login.cookie;
  return c.get('/auth/me');
}
