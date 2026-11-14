// © 2026 وطن النهار — طلبات شراء العملات يدوياً + واتساب الإدارة (الرقم لا يُسرَّب للعامة)
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
import { normAdminWhatsApp } from '../src/util.js';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const PORT = 39100 + crypto.randomInt(0, 800);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ROOT = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
let srv; let errLog = ''; let outLog = ''; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-coinpay-')); const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-coinpay-out-'));
const WA = '96551119991';

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, { headers = {}, redirect = 'manual' } = {}) {
    const h = { 'X-CK': '1', ...headers }; if (this.cookie) h.cookie = this.cookie;
    let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b, redirect });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json, location: res.headers.get('location'), headers: res.headers, text: json == null ? await res.text().catch(() => '') : null };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}
async function user(name) {
  const c = new Client();
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mails = () => { try { return fs.readdirSync(outbox).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8'))); } catch { return []; } };
async function waitFor(fn, ms = 4000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(50); } }
async function adminClient() { const a = new Client(); const r = await a.post('/auth/login', ADMIN); assert.equal(r.status, 200, JSON.stringify(r.body)); return a; }

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', MAIL_FROM: 'no-reply@clipkat.live', MAIL_OUTBOX_DIR: outbox, MX_ROUTES: 'support@clipkat.live=owner-inbox@example.com', ADMIN_ALERT_EMAIL: '', PUBLIC_URL: 'https://clipkat.live', DKIM_KEY_FILE: '/nonexistent', TRANSCODE: '0', LIVEKIT_URL: '', PAYMENT_PROVIDER: '', GIFT_RATE_MAX: '25' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { errLog += d; process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { outLog += d; if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(outbox, { recursive: true, force: true }); });

test('normAdminWhatsApp: Arabic digits, local 8-digit KW prefix, wa.me only — instagram and javascript rejected', () => {
  assert.equal(normAdminWhatsApp(''), null);
  assert.equal(normAdminWhatsApp(null), null);
  assert.equal(normAdminWhatsApp('51119991'), 'https://wa.me/96551119991');
  assert.equal(normAdminWhatsApp('٥١١١٩٩٩١'), 'https://wa.me/96551119991');
  assert.equal(normAdminWhatsApp('+965 5111 9991'), 'https://wa.me/96551119991');
  assert.equal(normAdminWhatsApp('https://wa.me/96551119991'), 'https://wa.me/96551119991');
  assert.throws(() => normAdminWhatsApp('@mystore'), (e) => e.status === 400 && e.field === 'adminWhatsapp');
  assert.throws(() => normAdminWhatsApp('javascript:alert(1)'), (e) => e.status === 400);
  assert.throws(() => normAdminWhatsApp('https://example.com/pay'), (e) => e.status === 400);
});

test('coin request: creates pending row, notifies admins + emails, one pending per user, demo purchase still works', async () => {
  const admin = await adminClient();
  const u = await user('ckreq_user');
  assert.equal((await new Client().post('/coins/request', { packageId: 'small' })).status, 401);
  assert.equal((await u.post('/coins/request', { packageId: 'nope' })).status, 404);
  const t0 = Date.now();
  const r = await u.post('/coins/request', { packageId: 'small' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(Date.now() - t0 < 3000, 'request is not delayed by the alert');
  assert.equal(r.body.request.status, 'pending');
  assert.equal(r.body.request.coins, 100);
  assert.equal(r.body.request.price, 0.3);
  assert.equal(r.body.request.paymentUrl, null);
  assert.equal(typeof r.body.whatsappEnabled, 'boolean');
  assert.ok(!JSON.stringify(r.body).includes(WA));

  const n = await waitFor(async () => (await admin.get('/notifications')).body.notifications.find((x) => x.type === 'system' && /طلب شراء عملات بانتظار الدفع/.test(x.text || '')));
  assert.ok(n, 'admin got an in-site notification');
  assert.ok(n.text.includes('@ckreq_user') && n.text.includes('100'));
  assert.ok(!(await u.get('/notifications')).body.notifications.some((x) => /بانتظار الدفع:/.test(x.text || '')), 'user does not get the admin alert');

  const mail = await waitFor(() => mails().find((x) => /طلب شراء عملات/.test(x.subject)));
  assert.ok(mail, 'alert email written');
  assert.equal(mail.to, 'owner-inbox@example.com');
  for (const s of ['@ckreq_user', '100', '0.300', 'https://clipkat.live/#/admin']) assert.ok(mail.text.includes(s), s);
  assert.ok(!/password|secret|token|JWT|DKIM|@test\.local/i.test(mail.text + mail.html), 'no secrets or user email in the alert');

  const again = await u.post('/coins/request', { packageId: 'medium' });
  assert.equal(again.status, 409); assert.equal(again.body.error, 'pendingExists');
  assert.equal(again.body.request.id, r.body.request.id);

  const before = mails().length;
  // demo purchase path remains intact (does not conflict with a pending manual request)
  const demo = await u.post('/coins/purchase', { packageId: 'small', key: crypto.randomBytes(12).toString('hex') });
  assert.equal(demo.status, 201, JSON.stringify(demo.body));
  assert.equal(demo.body.purchase.status, 'paid');
  assert.equal(demo.body.wallet.coins, 100);

  const w = await u.get('/wallet');
  assert.equal(w.status, 200);
  assert.equal(w.body.pendingRequests.length, 1);
  assert.equal(w.body.pendingRequests[0].id, r.body.request.id);
  assert.equal(typeof w.body.whatsappEnabled, 'boolean');
  u.reqId = r.body.request.id;
  u.demoCoins = 100;
  // stash for later tests via global
  globalThis.__ck = { admin, u, rid: r.body.request.id };
  assert.equal(mails().length, before, 'demo purchase does not email the admin');
});

test('manual payment link: admin only, pending only, owner notified + emailed, javascript rejected', async () => {
  const { admin, u, rid } = globalThis.__ck;
  const other = await user('ckreq_other');
  const link = (c, body) => c.post(`/admin/coin-requests/${rid}/payment-link`, body);
  assert.equal((await link(u, { url: 'https://evil.example/pay' })).status, 403);
  assert.equal((await link(other, { url: 'https://evil.example/pay' })).status, 403);
  assert.equal((await link(new Client(), { url: 'https://x.com' })).status, 401);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a link']) {
    const r = await link(admin, { url: bad }); assert.equal(r.status, 400, bad); assert.equal(r.body.field, 'paymentUrl', bad);
  }
  const before = mails().length;
  const ok = await link(admin, { url: 'https://pay.example/coin', note: 'حوّل ثم أرسل الإيصال' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.paymentUrl, 'https://pay.example/coin');
  assert.equal(ok.body.paymentNote, 'حوّل ثم أرسل الإيصال');
  assert.ok(ok.body.paymentLinkSentAt > 0);
  assert.equal(ok.body.status, 'pending');
  const n = await waitFor(async () => (await u.get('/notifications')).body.notifications.find((x) => x.text === 'رابط دفع شراء العملات جاهز'));
  assert.ok(n, 'owner notified');
  const mail = await waitFor(() => mails().slice(before).find((x) => x.to === 'ckreq_user@test.local'));
  assert.ok(mail, 'owner emailed');
  assert.ok(mail.subject.includes('رابط دفع شراء العملات جاهز') && mail.text.includes('0.300') && mail.text.includes('https://clipkat.live/#/coins'));
  const mine = (await u.get('/wallet')).body.pendingRequests[0];
  assert.equal(mine.paymentUrl, 'https://pay.example/coin');
  assert.ok(!(await other.get('/wallet')).body.pendingRequests?.some((x) => x.id === rid));
  const cl = await link(admin, { url: '' });
  assert.equal(cl.status, 200); assert.equal(cl.body.paymentUrl, null);
  await link(admin, { url: 'https://pay.example/coin2' });
});

test('approve credits coins exactly once (idempotent, transactional) and reject works', async () => {
  const { admin, u, rid } = globalThis.__ck;
  const other = await user('ckreq_rej');
  const req2 = await other.post('/coins/request', { packageId: 'medium' });
  assert.equal(req2.status, 201);
  assert.equal((await other.post(`/admin/coin-requests/${req2.body.request.id}/approve`, {})).status, 403);

  const before = (await u.get('/wallet')).body.coins;
  const a1 = await admin.post(`/admin/coin-requests/${rid}/approve`, {});
  assert.equal(a1.status, 200, JSON.stringify(a1.body));
  assert.equal(a1.body.request.status, 'paid');
  assert.equal(a1.body.already, false);
  assert.equal(a1.body.wallet.coins, before + 100);
  const a2 = await admin.post(`/admin/coin-requests/${rid}/approve`, {});
  assert.equal(a2.status, 200);
  assert.equal(a2.body.already, true);
  assert.equal(a2.body.wallet.coins, before + 100);
  const w = await u.get('/wallet');
  assert.equal(w.body.coins, before + 100);
  assert.equal((w.body.pendingRequests || []).length, 0);
  const purchases = w.body.ledger.filter((x) => x.kind === 'purchase' && x.note === 'manual');
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].delta, 100);
  const n = await waitFor(async () => (await u.get('/notifications')).body.notifications.find((x) => /تم شحن 100 عملة/.test(x.text || '')));
  assert.ok(n, 'user notified of credit');
  assert.equal((await admin.post(`/admin/coin-requests/${rid}/payment-link`, { url: 'https://pay.example/x' })).status, 409);
  assert.equal((await admin.post(`/admin/coin-requests/${rid}/reject`, {})).status, 409);

  const rj = await admin.post(`/admin/coin-requests/${req2.body.request.id}/reject`, {});
  assert.equal(rj.status, 200);
  assert.equal(rj.body.request.status, 'rejected');
  assert.equal((await other.get('/wallet')).body.coins, 0);
  const rjN = await waitFor(async () => (await other.get('/notifications')).body.notifications.find((x) => x.text === 'رُفض طلب شراء العملات'));
  assert.ok(rjN);
  // idempotent reject
  assert.equal((await admin.post(`/admin/coin-requests/${req2.body.request.id}/reject`, {})).status, 200);
  assert.equal((await admin.post(`/admin/coin-requests/${req2.body.request.id}/approve`, {})).status, 409);
});

test('admin WhatsApp number is never leaked in public responses or JS/HTML; redirect builds wa.me server-side', async () => {
  const admin = await adminClient();
  const u = await user('ckwa_user');
  const other = await user('ckwa_othr');
  const req = await u.post('/coins/request', { packageId: 'large' });
  assert.equal(req.status, 201);
  const id = req.body.request.id;

  // empty by default — button hidden
  assert.equal((await u.get('/contact/status')).body.whatsappEnabled, false);
  const off = await u.get(`/contact/whatsapp?ctx=coins&id=${id}`);
  assert.equal(off.status, 302);
  assert.ok((off.location || '').includes('#/coins?wa=0'));
  assert.ok(!(off.location || '').includes('wa.me'));

  assert.equal((await u.post('/admin/settings/whatsapp', { number: WA })).status, 403);
  const saved = await admin.post('/admin/settings/whatsapp', { number: '٥١١١٩٩٩١' }); // Arabic 8-digit
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.adminWhatsapp, `https://wa.me/${WA}`);
  assert.equal(saved.body.whatsappEnabled, true);
  const set = await admin.get('/admin/settings');
  assert.equal(set.body.adminWhatsapp, `https://wa.me/${WA}`);

  const anon = await new Client().get('/contact/status');
  assert.equal(anon.status, 200);
  assert.deepEqual(Object.keys(anon.body).sort(), ['whatsappEnabled']);
  assert.equal(anon.body.whatsappEnabled, true);

  const leakNeedle = [WA, '51119991', 'https://wa.me/96551119991'];
  const publicPaths = ['/coins/config', '/contact/status', '/wallet', '/slots', '/config', '/health'];
  for (const pth of publicPaths) {
    const r = pth === '/wallet' ? await u.get(pth) : await new Client().get(pth);
    const raw = JSON.stringify(r.body || {});
    for (const n of leakNeedle) assert.ok(!raw.includes(n), `${pth} leaked ${n}`);
    if (r.body && 'whatsappEnabled' in (r.body || {})) assert.equal(typeof r.body.whatsappEnabled, 'boolean');
    assert.ok(!('adminWhatsapp' in (r.body || {})), pth + ' has adminWhatsapp');
  }
  const list = await admin.get('/admin/coin-requests?status=pending');
  const rawList = JSON.stringify(list.body || {});
  for (const n of leakNeedle) assert.ok(!rawList.includes(n), 'admin coin list leaked number');

  // static JS/HTML must not contain the number (and user-facing views must go through the redirect endpoint)
  for (const file of ['/js/views/wallet.js', '/js/views/dashboard.js', '/js/views/admin.js', '/js/gifts.js', '/js/i18n.js', '/index.html', '/css/app.css']) {
    const txt = await (await fetch(ROOT + file)).text();
    for (const n of leakNeedle) assert.ok(!txt.includes(n), file + ' leaked ' + n);
  }
  const walletJs = await (await fetch(ROOT + '/js/views/wallet.js')).text();
  const dashJs = await (await fetch(ROOT + '/js/views/dashboard.js')).text();
  const giftsJs = await (await fetch(ROOT + '/js/gifts.js')).text();
  const adminJs = await (await fetch(ROOT + '/js/views/admin.js')).text();
  const i18n = await (await fetch(ROOT + '/js/i18n.js')).text();
  assert.ok(giftsJs.includes('/api/contact/whatsapp') && giftsJs.includes('waAdminBtn'));
  assert.ok(walletJs.includes('whatsappEnabled') && dashJs.includes('whatsappEnabled'));
  assert.ok(walletJs.includes("t('payWaiting')") && walletJs.includes('waAdminBtn') && walletJs.includes("t('payNow')"));
  assert.ok(dashJs.includes('waAdminBtn') && dashJs.includes('/contact/status') && dashJs.includes("t('payWaiting')"));
  assert.ok(adminJs.includes("t('coinReqs')") && adminJs.includes("t('paySendUser')") && adminJs.includes("t('coinApprove')") && adminJs.includes('/admin/settings/whatsapp'));
  for (const s of ['ادفع الآن', 'طلبات شراء العملات', 'إرسال للمشترك', 'اعتماد وإضافة العملات', 'تواصل مع الإدارة عبر واتساب', 'بانتظار رابط الدفع من الإدارة', 'رقم واتساب الإدارة']) {
    assert.ok(i18n.includes(s), s);
  }

  // owner redirect
  const go = await u.get(`/contact/whatsapp?ctx=coins&id=${id}`);
  assert.equal(go.status, 302);
  const loc = go.location || '';
  assert.ok(loc.startsWith(`https://wa.me/${WA}?text=`), loc);
  const text = decodeURIComponent(loc.split('text=')[1] || '');
  assert.ok(text.includes('@ckwa_user') && text.includes('3.000') && text.includes('1200') && text.includes(id.slice(0, 8)), text);
  // other user / unauthenticated do not receive the number
  const oth = await other.get(`/contact/whatsapp?ctx=coins&id=${id}`);
  assert.equal(oth.status, 302);
  assert.ok((oth.location || '').includes('#/coins?wa=0'));
  assert.ok(!(oth.location || '').includes(WA));
  const un = await new Client().get(`/contact/whatsapp?ctx=coins&id=${id}`);
  assert.equal(un.status, 401);
  assert.ok(!JSON.stringify(un.body || {}).includes(WA));

  // rental ctx also works
  const ver = (await u.get('/policy/store-rental')).body.version;
  const st = await u.post('/stores', { store: { name: 'متجر واتساب' }, planId: 'weekly', acceptPolicy: ver });
  assert.equal(st.status, 201, JSON.stringify(st.body));
  const rentId = (await u.get('/rentals')).body[0].id;
  const rg = await u.get(`/contact/whatsapp?ctx=rental&id=${rentId}`);
  assert.equal(rg.status, 302);
  const rloc = rg.location || '';
  assert.ok(rloc.startsWith(`https://wa.me/${WA}?text=`));
  const rtext = decodeURIComponent(rloc.split('text=')[1] || '');
  assert.ok(rtext.includes('@ckwa_user') && rtext.includes('3.000') && rtext.includes(rentId.slice(0, 8)), rtext);
  const rents = await u.get('/rentals');
  const rawR = JSON.stringify(rents.body);
  for (const n of leakNeedle) assert.ok(!rawR.includes(n), 'rentals list leaked number');

  // clear the number
  const cleared = await admin.post('/admin/settings/whatsapp', { number: '' });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.adminWhatsapp, null);
  assert.equal(cleared.body.whatsappEnabled, false);
  assert.equal((await u.get('/contact/status')).body.whatsappEnabled, false);
});
