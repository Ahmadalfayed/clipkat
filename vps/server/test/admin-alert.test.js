// © 2026 وطن النهار — اختبارات تنبيه المشرف بطلبات إيجار المتاجر (إشعار داخل الموقع + بريد)
// التشغيل: TEST_DATABASE_URL=postgres://.../clipkat_test npm test
// ⚠️ يمسح قاعدة الاختبار بالكامل — لا تشغّله على قاعدة حقيقية (يُرفض أي اسم لا ينتهي بـ _test)
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
const PORT = 39000 + crypto.randomInt(0, 900);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
let srv; let errLog = ''; let outLog = ''; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-test-')); const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-outbox-'));

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, { form, headers = {} } = {}) {
    const h = { 'X-CK': '1', ...headers }; if (this.cookie) h.cookie = this.cookie;
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
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function _unusedUpload(c, caption) {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', caption);
  const r = await c.req('POST', '/videos', undefined, { form: fd }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', MAIL_FROM: 'no-reply@clipkat.live', MAIL_OUTBOX_DIR: outbox, MX_ROUTES: 'support@clipkat.live=owner-inbox@example.com', ADMIN_ALERT_EMAIL: '', PUBLIC_URL: 'https://clipkat.live', DKIM_KEY_FILE: '/nonexistent' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { errLog += d; process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { outLog += d; if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(outbox, { recursive: true, force: true }); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mails = () => fs.readdirSync(outbox).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8')));
async function waitFor(fn, ms = 4000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(50); } }
async function adminClient() { const a = new Client(); const r = await a.post('/auth/login', ADMIN); assert.equal(r.status, 200); return a; }

test('new store rental request notifies every admin in-site (link to #/admin) and emails the alert address', async () => {
  const admin = await adminClient();
  const m = await user('alert_merchant');
  const ver = (await m.get('/policy/store-rental')).body.version;
  const t0 = Date.now();
  const r = await m.post('/stores', { store: { name: 'متجر <ورد> & عود', category: 'perfume', contact: '96551234567' }, planId: 'monthly', payment: { method: 'knet' }, acceptPolicy: ver });
  assert.equal(r.status, 201); assert.equal(r.body.pending, true);
  assert.ok(Date.now() - t0 < 3000, 'request is not delayed by the alert');
  const n = await waitFor(async () => (await admin.get('/notifications')).body.notifications.find((x) => x.type === 'system' && /طلب متجر جديد بانتظار التفعيل/.test(x.text || '')));
  assert.ok(n, 'admin got an in-site notification');
  assert.equal(n.text, 'طلب متجر جديد بانتظار التفعيل: متجر <ورد> & عود (@alert_merchant)');
  assert.equal(n.fromId, m.me.id);
  assert.ok(!(await m.get('/notifications')).body.notifications.some((x) => /بانتظار التفعيل:/.test(x.text || '')), 'merchant does not get the admin alert');
  const mail = await waitFor(() => mails().find((x) => /طلب متجر جديد/.test(x.subject)));
  assert.ok(mail, 'alert email written');
  assert.equal(mail.to, 'owner-inbox@example.com');                 // افتراضياً وجهة MX_ROUTES
  assert.equal(mail.from, 'no-reply@clipkat.live');
  assert.ok(mail.subject.includes('متجر <ورد> & عود'));
  for (const s of ['@alert_merchant', 'شهري', '9.000', 'https://clipkat.live/#/admin']) assert.ok(mail.text.includes(s), s);
  assert.ok(mail.html.includes('href="https://clipkat.live/#/admin"') && mail.html.includes('متجر &lt;ورد&gt; &amp; عود') && !mail.html.includes('<ورد>'), 'html escaped, has admin button');
  assert.ok(!/password|secret|token|JWT|DKIM|@test\.local/i.test(mail.text + mail.html), 'no secrets or merchant email in the alert');
  // التجديد أيضاً ينبّه المشرف (إشعار) — البريد محدود: مرة لكل تاجر كل 10 دقائق
  const before = mails().length;
  assert.equal((await m.post(`/stores/${r.body.id}/rentals`, { planId: 'weekly', acceptPolicy: ver })).status, 201);
  assert.ok(await waitFor(async () => (await admin.get('/notifications')).body.notifications.some((x) => (x.text || '').startsWith('طلب تجديد متجر بانتظار التفعيل: متجر <ورد> & عود'))));
  await waitFor(() => outLog.includes('email skipped (rate limit)'));
  assert.equal(mails().length, before, 'second email to the same merchant within 10 min is rate-limited');
  assert.match(outLog, /\[alert\] rental request store=[0-9a-f-]{36} user=[0-9a-f-]{36} admins_notified=1/);
  // تبقى بانتظار التفعيل
  const rents = (await admin.get('/rentals')).body.filter((x) => x.storeId === r.body.id); assert.equal(rents.length, 2); assert.ok(rents.every((x) => x.status === 'pending'));
});

test('alert failures never break the rental request; inbox shows an admin button', async () => {
  fs.rmSync(outbox, { recursive: true, force: true }); fs.writeFileSync(outbox, 'not a dir');   // يجعل كتابة البريد تفشل
  try {
    const m = await user('alert_merchant2');
    const ver = (await m.get('/policy/store-rental')).body.version;
    const r = await m.post('/stores', { store: { name: 'متجر ثاني' }, planId: 'weekly', acceptPolicy: ver });
    assert.equal(r.status, 201);
    assert.ok(await waitFor(() => errLog.includes('[mail] admin alert failed')), 'failure is logged');
    assert.equal((await m.get('/stores/by-owner/' + m.me.id)).body.pending, true);
  } finally { fs.rmSync(outbox, { force: true }); fs.mkdirSync(outbox); }
  const root = BASE.replace(/\/api$/, '');
  const inbox = await (await fetch(root + '/js/views/inbox.js')).text();
  assert.ok(inbox.includes('href="#/admin"') && inbox.includes('بانتظار التفعيل'));
  const { alertEmailTo } = await import('../src/admin-alert.js');
  const save = { ...process.env };
  try {
    delete process.env.ADMIN_ALERT_EMAIL; delete process.env.MX_ROUTES; assert.equal(alertEmailTo(), 'aaaaaaaasa2112@gmail.com');
    process.env.MX_ROUTES = 'support@clipkat.live=Fwd@Example.com'; assert.equal(alertEmailTo(), 'fwd@example.com');
    process.env.ADMIN_ALERT_EMAIL = 'boss@example.com'; assert.equal(alertEmailTo(), 'boss@example.com');
    process.env.ADMIN_ALERT_EMAIL = 'off'; assert.equal(alertEmailTo(), null);
  } finally { process.env = save; }
});
