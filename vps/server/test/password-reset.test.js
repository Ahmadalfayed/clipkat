// © 2026 وطن النهار — «نسيت كلمة السر؟»: طلب الرابط، الرد المحايد، حدود الطلبات، الرمز المُجزّأ لمرة واحدة، انتهاء الصلاحية، حساب Google
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
const PORT = 40000 + crypto.randomInt(0, 400);
const BASE = `http://127.0.0.1:${PORT}/api`;
const here = path.dirname(new URL(import.meta.url).pathname);
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-rtest-'));
const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-outbox-'));
let srv, db, ipN = 1;
const freshIp = () => `203.0.113.${ipN++}`;

class Client {
  constructor(ip = freshIp()) { this.cookie = ''; this.ip = ip; }
  async req(method, p, body) {
    const h = { 'X-CK': '1', 'X-Forwarded-For': this.ip }; if (this.cookie) h.cookie = this.cookie;
    let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}
const mails = () => fs.readdirSync(outbox).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8')));
const mailsTo = (to) => mails().filter((m) => m.to.toLowerCase() === to.toLowerCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitMail(to, n = 1) { for (let i = 0; i < 60; i++) { const m = mailsTo(to); if (m.length >= n) return m; await sleep(50); } return mailsTo(to); }
const linkToken = (m) => (m.text.match(/#\/reset\?t=([A-Za-z0-9_-]{43})/) || [])[1];
let seq = 0;
async function signup(pw = 'OldPass#123') {
  const c = new Client(); seq++;
  const email = `reset${seq}.${crypto.randomBytes(3).toString('hex')}@example.com`;
  const r = await c.post('/auth/signup', { email, username: `rst${seq}_${crypto.randomBytes(2).toString('hex')}`, password: pw, name: 'مختبر' });
  assert.equal(r.status, 201);
  return { c, email, pw };
}
async function requestToken(email) {
  const before = mailsTo(email).length;
  const r = await new Client().post('/auth/forgot', { email });
  assert.equal(r.status, 200);
  const m = await waitMail(email, before + 1);
  assert.equal(m.length, before + 1, 'reset mail expected');
  return linkToken(m.at(-1));
}

before(async () => {
  db = new pg.Client({ connectionString: DB }); await db.connect();
  await db.query('drop schema public cascade; create schema public;');
  srv = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(here, '..'),
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000',
      MAIL_FROM: 'no-reply@clipkat.test', MAIL_OUTBOX_DIR: outbox, PUBLIC_URL: 'https://clipkat.test', RESET_RATE_IP_MAX: '5', RESET_RATE_EMAIL_MAX: '3', MAIL_DIRECT: '', SMTP_HOST: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(async () => { srv?.kill('SIGTERM'); await db?.end(); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(outbox, { recursive: true, force: true }); });

test('forgot: same neutral answer for registered and unknown emails; mail only to the registered one', async () => {
  const { email } = await signup();
  const a = await new Client().post('/auth/forgot', { email: email.toUpperCase() });
  const unknown = `nobody.${crypto.randomBytes(3).toString('hex')}@example.com`;
  const b = await new Client().post('/auth/forgot', { email: unknown });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(a.body, b.body);
  assert.match(a.body.message, /إذا كان هذا البريد مسجّلاً/);
  const m = await waitMail(email);
  assert.equal(m.length, 1);
  assert.equal(mailsTo(unknown).length, 0);
  assert.equal(m[0].from, 'no-reply@clipkat.test');
  assert.match(m[0].subject, /استعادة كلمة المرور/);
  assert.match(m[0].html, /dir="rtl"/);
  assert.match(m[0].text, /https:\/\/clipkat\.test\/#\/reset\?t=[A-Za-z0-9_-]{43}/);
  assert.match(m[0].text, /30 دقيقة/);
});

test('forgot: malformed email and missing CSRF header are rejected', async () => {
  assert.equal((await new Client().post('/auth/forgot', { email: 'not-an-email' })).status, 400);
  const res = await fetch(BASE + '/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co' }) });
  assert.equal(res.status, 403);
});

test('token is random, stored only as sha256, expires in 30 minutes', async () => {
  const { email } = await signup();
  const tok = await requestToken(email);
  assert.ok(tok);
  const { rows } = await db.query("select pr.token_hash, extract(epoch from pr.expires_at - pr.created_at)::int ttl from password_resets pr join profiles p on p.id = pr.user_id where lower(p.email) = $1 and pr.kind = 'reset'", [email]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, tok);
  assert.equal(rows[0].token_hash, crypto.createHash('sha256').update(tok).digest('hex'));
  assert.ok(Math.abs(rows[0].ttl - 1800) <= 2, `ttl ${rows[0].ttl}`);
  const all = JSON.stringify((await db.query('select * from password_resets')).rows);
  assert.ok(!all.includes(tok), 'plain token must never be stored');
});

test('reset: validates, changes password, logs out every session, single use', async () => {
  const { c, email, pw } = await signup();
  const other = new Client(); assert.equal((await other.post('/auth/login', { email, password: pw })).status, 200);
  assert.ok((await other.get('/auth/me')).body.user);
  const tok = await requestToken(email);
  const r = new Client();
  assert.equal((await r.post('/auth/reset/check', { token: tok })).body.valid, true);
  assert.equal((await r.post('/auth/reset/check', { token: 'x'.repeat(43) })).body.valid, false);
  assert.equal((await r.post('/auth/reset', { token: tok, password: 'short', confirm: 'short' })).body.error, 'password');
  assert.equal((await r.post('/auth/reset', { token: tok, password: 'NewPass#456', confirm: 'Different#1' })).body.error, 'mismatch');
  const ok = await r.post('/auth/reset', { token: tok, password: 'NewPass#456', confirm: 'NewPass#456' });
  assert.equal(ok.status, 200); assert.equal(ok.body.ok, true);
  // كل الجلسات القديمة خرجت (token_version + 1)
  assert.equal((await c.get('/auth/me')).body.user, null);
  assert.equal((await other.get('/auth/me')).body.user, null);
  assert.equal((await new Client().post('/auth/login', { email, password: pw })).status, 401);
  assert.equal((await new Client().post('/auth/login', { email, password: 'NewPass#456' })).status, 200);
  // لمرة واحدة فقط
  assert.equal((await r.post('/auth/reset/check', { token: tok })).body.valid, false);
  const again = await r.post('/auth/reset', { token: tok, password: 'Another#789', confirm: 'Another#789' });
  assert.equal(again.status, 400); assert.equal(again.body.error, 'resetInvalid');
});

test('reset: two concurrent uses of one token → exactly one succeeds', async () => {
  const { email } = await signup();
  const tok = await requestToken(email);
  const [x, y] = await Promise.all([new Client().post('/auth/reset', { token: tok, password: 'RaceOne#111' }), new Client().post('/auth/reset', { token: tok, password: 'RaceTwo#222' })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 400]);
});

test('expired token is refused', async () => {
  const { email } = await signup();
  const tok = await requestToken(email);
  await db.query("update password_resets set expires_at = now() - interval '1 second' where token_hash = $1", [crypto.createHash('sha256').update(tok).digest('hex')]);
  assert.equal((await new Client().post('/auth/reset/check', { token: tok })).body.valid, false);
  assert.equal((await new Client().post('/auth/reset', { token: tok, password: 'Expired#123' })).body.error, 'resetInvalid');
});

test('a newer link invalidates the older one', async () => {
  const { email } = await signup();
  const t1 = await requestToken(email);
  const t2 = await requestToken(email);
  assert.notEqual(t1, t2);
  assert.equal((await new Client().post('/auth/reset/check', { token: t1 })).body.valid, false);
  assert.equal((await new Client().post('/auth/reset/check', { token: t2 })).body.valid, true);
});

test('per-email limit: at most 3 mails an hour, answer stays neutral', async () => {
  const { email } = await signup();
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push((await new Client().post('/auth/forgot', { email })).body);
  await sleep(400);
  assert.equal(mailsTo(email).length, 3);
  for (const a of answers) assert.deepEqual(a, answers[0]);
});

test('per-IP limit: 429 after 5 requests in 15 minutes', async () => {
  const c = new Client();
  const st = [];
  for (let i = 0; i < 6; i++) st.push((await c.post('/auth/forgot', { email: `ip${i}@example.com` })).status);
  assert.deepEqual(st, [200, 200, 200, 200, 200, 429]);
  assert.equal((await new Client().post('/auth/forgot', { email: 'ip9@example.com' })).status, 200);   // IP آخر غير متأثر
});

test('Google-only account gets a "sign in with Google" mail and no reset token', async () => {
  const email = `g.${crypto.randomBytes(3).toString('hex')}@example.com`;
  await db.query("insert into profiles (email, password_hash, username, name, google_sub) values ($1, 'google$unusable', $2, 'جوجل', $3)", [email, `g_${crypto.randomBytes(3).toString('hex')}`, 'sub-' + crypto.randomBytes(4).toString('hex')]);
  const r = await new Client().post('/auth/forgot', { email });
  assert.equal(r.status, 200);
  const m = await waitMail(email);
  assert.equal(m.length, 1);
  assert.match(m[0].text, /Google/);
  assert.match(m[0].text, /https:\/\/clipkat\.test\/#\/login/);
  assert.equal(linkToken(m[0]), undefined);
  const { rows } = await db.query("select kind, token_hash from password_resets pr join profiles p on p.id = pr.user_id where lower(p.email) = $1", [email]);
  assert.deepEqual(rows.map((x) => [x.kind, x.token_hash]), [['google', null]]);
});

test('banned accounts get no mail', async () => {
  const { email } = await signup();
  await db.query('update profiles set is_banned = true where lower(email) = $1', [email]);
  assert.equal((await new Client().post('/auth/forgot', { email })).status, 200);
  await sleep(300);
  assert.equal(mailsTo(email).length, 0);
});

test('login screen links to the forgot-password page', async () => {
  const src = fs.readFileSync(path.join(here, '../../web/js/views/auth.js'), 'utf8');
  assert.match(src, /href="#\/forgot"/);
  const app = fs.readFileSync(path.join(here, '../../web/js/app.js'), 'utf8');
  assert.match(app, /forgot: \(\) => import\('\.\/views\/reset\.js'\)/);
  assert.match(app, /reset: \(\) => import\('\.\/views\/reset\.js'\)/);
});
