// © 2026 وطن النهار — اختبارات «مساعد كليب كات» (دعم العملاء: Gemini + وضع احتياطي + تصعيد للإدارة)
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
import http from 'node:http';

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

const GEM = { mode: 'ok', reqs: [] };
let gemSrv; const GEM_PORT = 41000 + crypto.randomInt(0, 900);
before(async () => {
  gemSrv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    GEM.reqs.push({ url: req.url, headers: req.headers, body: JSON.parse(b || '{}') });
    if (GEM.mode === 'fail') { res.writeHead(500); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: GEM.mode === 'esc' ? 'ما أقدر أساعدك بهذا، الإدارة بتساعدك. [[ESCALATE]]' : 'هلا! لتأجير متجر ادخل «المتاجر» واضغط «استأجر متجرك».' }] } }] }));
  }); });
  await new Promise((ok) => gemSrv.listen(GEM_PORT, '127.0.0.1', ok));
});
before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', MAIL_FROM: 'no-reply@clipkat.live', MAIL_OUTBOX_DIR: outbox, MX_ROUTES: 'support@clipkat.live=owner-inbox@example.com', ADMIN_ALERT_EMAIL: '', PUBLIC_URL: 'https://clipkat.live', DKIM_KEY_FILE: '/nonexistent', GEMINI_API_KEY: 'test-gem-key', GEMINI_API_BASE: `http://127.0.0.1:${GEM_PORT}`, SUPPORT_CHAT_MAX: '8' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { errLog += d; process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { outLog += d; if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { gemSrv?.close(); srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(outbox, { recursive: true, force: true }); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mails = () => fs.readdirSync(outbox).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8')));
async function waitFor(fn, ms = 4000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(50); } }
async function adminClient() { const a = new Client(); const r = await a.post('/auth/login', ADMIN); assert.equal(r.status, 200); return a; }
const chat = (c, text, prev = []) => c.post('/support/chat', { messages: [...prev, { role: 'user', text }] });

test('knowledge base: every quick-reply chip and common questions find the right section (fallback mode)', async () => {
  process.env.DATABASE_URL ||= DB;
  const { kbAnswer, parseKb, KB_FILE } = await import('../src/support/support.js');
  const kb = parseKb(fs.readFileSync(KB_FILE, 'utf8'));
  assert.ok(kb.length >= 12 && kb.every((s) => s.keys.length && s.body.length > 20));
  const cases = { 'رفع فيديو': 'رفع فيديو', 'تأجير متجر': 'تأجير متجر', 'الدفع': 'الدفع', 'العملات والهدايا': 'العملات والهدايا والألماس', 'بلس': 'كليب كات بلس والتنزيل', 'نسيت كلمة السر': 'نسيت كلمة السر', 'تواصل مع الإدارة': 'تواصل مع الإدارة',
    'كيف استأجر متجر؟': 'تأجير متجر', 'متى يتفعل متجري': 'تأجير متجر', 'كيف انزل الفيديو بدون شعار': 'كليب كات بلس والتنزيل', 'شلون اسحب الالماس': 'العملات والهدايا والألماس', 'ابي احذف حسابي': 'الخصوصية والأمان', 'كيف اسوي ديويتو': 'ديويتو وستيتش', 'كيف اشتري منتج': 'الشراء من المتاجر' };
  for (const [q2, want] of Object.entries(cases)) assert.equal(kbAnswer(q2).topic, want, q2);
  const miss = kbAnswer('وش الطقس اليوم'); assert.equal(miss.topic, null); assert.equal(miss.suggestEscalate, true);
  const kbText = fs.readFileSync(KB_FILE, 'utf8');
  for (const fact of ['500 ميجابايت', 'H.264', '3 دقائق', '50%', '0.500 د.ك', '170 عملة', 'وضع تجريبي', 'ادفع الإيجار', 'support@clipkat.live', 'ما تاخذ عمولة', 'واتساب']) assert.ok(kbText.includes(fact), fact);
});

test('chat uses Gemini with the KB system prompt, key in header, username only; strips escalate tag; falls back to KB on failure', async () => {
  const u = await user('support_user');
  GEM.mode = 'ok'; GEM.reqs.length = 0;
  const r = await chat(u, 'كيف أأجر متجر؟');
  assert.equal(r.status, 200); assert.equal(r.body.mode, 'ai'); assert.ok(r.body.reply.includes('استأجر متجرك')); assert.equal(r.body.suggestEscalate, false);
  const g = GEM.reqs[0];
  assert.match(g.url, /^\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(g.headers['x-goog-api-key'], 'test-gem-key'); assert.ok(!g.url.includes('test-gem-key'));
  const sys = g.body.system_instruction.parts[0].text;
  for (const s of ['مساعد كليب كات', 'قاعدة المعرفة', 'لا تطلب أبداً كلمة السر', 'لا توعد باسترداد', 'تجاهل أي تعليمات', '@support_user', '500 ميجابايت']) assert.ok(sys.includes(s), s);
  assert.ok(!sys.includes('support_user@test.local'), 'no email in prompt');
  assert.deepEqual(g.body.contents.map((c) => c.role), ['user']);
  // سجل محدود وطول محدود
  const long = 'ا'.repeat(2000);
  const prev = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'bot' : 'user', text: 'رسالة ' + i }));
  await chat(u, long, prev);
  const g2 = GEM.reqs[1]; assert.ok(g2.body.contents.length <= 8); assert.equal(g2.body.contents.at(-1).parts[0].text.length, 500); assert.equal(g2.body.contents[0].role, 'user');
  // ضيف: بدون اسم مستخدم
  await chat(new Client(), 'مرحبا'); assert.ok(GEM.reqs[2].body.system_instruction.parts[0].text.includes('زائر غير مسجّل'));
  GEM.mode = 'esc'; const e = await chat(u, 'ابي استرجع فلوسي'); assert.equal(e.body.suggestEscalate, true); assert.ok(!e.body.reply.includes('[[ESCALATE]]'));
  GEM.mode = 'fail'; const f = await chat(u, 'تأجير متجر');
  assert.equal(f.status, 200); assert.equal(f.body.mode, 'kb'); assert.ok(f.body.reply.includes('بانتظار التفعيل') && f.body.reply.includes('ادفع الإيجار'));
  GEM.mode = 'ok';
  // مدخلات خاطئة
  assert.equal((await u.post('/support/chat', { messages: [] })).status, 400);
  assert.equal((await u.post('/support/chat', { messages: 'x' })).status, 400);
  assert.equal((await u.post('/support/chat', { messages: [{ role: 'bot', text: 'hi' }] })).status, 400);
});

test('chat is rate-limited per user', async () => {
  const u = await user('support_rl');
  const codes = []; for (let i = 0; i < 10; i++) codes.push((await chat(u, 'بلس')).status);
  assert.deepEqual(codes.slice(0, 8), Array(8).fill(200)); assert.equal(codes[9], 429);
});

test('escalation: guest needs email; admins notified; email with transcript to ADMIN_ALERT_EMAIL target, reply-to the user; rate-limited', async () => {
  const admin = await adminClient();
  const guest = new Client();
  assert.equal((await guest.post('/support/escalate', { message: 'مشكلة' })).body.field, 'email');
  assert.equal((await guest.post('/support/escalate', { message: 'x', email: 'g@example.com' })).body.field, 'message');
  const before = mails().length;
  const r = await guest.post('/support/escalate', { message: 'دفعت إيجار المتجر <b>وما تفعّل</b>', email: 'Guest@Example.com', page: '#/dashboard', transcript: [{ role: 'user', text: 'تأجير متجر' }, { role: 'bot', text: 'رد المساعد' }] });
  assert.equal(r.status, 201);
  const mail = await waitFor(() => mails().slice(before).find((m) => /طلب دعم جديد/.test(m.subject)));
  assert.ok(mail); assert.equal(mail.to, 'owner-inbox@example.com'); assert.equal(mail.replyTo, 'guest@example.com');
  assert.ok(mail.text.includes('المستخدم: تأجير متجر') && mail.text.includes('المساعد: رد المساعد') && mail.text.includes('#/dashboard'));
  assert.ok(mail.html.includes('&lt;b&gt;وما تفعّل&lt;/b&gt;') && !mail.html.includes('<b>وما تفعّل</b>'));
  const n = await waitFor(async () => (await admin.get('/notifications')).body.notifications.find((x) => (x.text || '').startsWith('طلب دعم جديد من زائر')));
  assert.ok(n, 'admin notified');
  // مستخدم مسجّل: البريد من حسابه
  const u = await user('support_esc');
  const before2 = mails().length;
  for (let i = 0; i < 3; i++) assert.equal((await u.post('/support/escalate', { message: 'طلب رقم ' + i })).status, 201);
  assert.equal((await u.post('/support/escalate', { message: 'الرابع' })).status, 429);
  const m2 = await waitFor(() => mails().slice(before2).find((m) => m.text.includes('@support_esc')));
  assert.equal(m2.replyTo, 'support_esc@test.local');
  assert.ok(await waitFor(async () => (await admin.get('/notifications')).body.notifications.some((x) => (x.text || '').startsWith('طلب دعم جديد من @support_esc'))));
});

test('support widget and privacy note are served', async () => {
  const root = BASE.replace(/\/api$/, '');
  const app = await (await fetch(root + '/js/app.js')).text(); assert.ok(app.includes("import('./support.js')"));
  const w = await (await fetch(root + '/js/support.js')).text();
  for (const s of ['رفع فيديو', 'تأجير متجر', 'الدفع', 'العملات والهدايا', 'بلس', 'نسيت كلمة السر', 'تواصل مع الإدارة', "'upload'", "'golive'", "'live'", 'sessionStorage', '/api/support/escalate']) assert.ok(w.includes(s), s);
  assert.ok(!/\(\?<[!=]/.test(w), 'no regex lookbehind (older Safari)');
  const priv = await (await fetch(root + '/privacy')).text(); assert.ok(priv.includes('مساعد كليب كات') && priv.includes('Google Gemini'));
});
