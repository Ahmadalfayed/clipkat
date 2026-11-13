// © 2026 وطن النهار — اختبارات المرحلة 1: الخصوصية، طلبات المتابعة، الحظر، التبليغ، ملكية الردود
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
let srv; let errLog = ''; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-test-'));

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
async function upload(c, caption) {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', caption);
  const r = await c.req('POST', '/videos', undefined, { form: fd }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { errLog += d; process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('CSP and COOP allow Google Identity Services', async () => {
  const res = await fetch(BASE + '/health');
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src[^;]*https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(csp, /style-src[^;]*https:\/\/accounts\.google\.com\/gsi\/style/);
  assert.match(csp, /frame-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
  assert.match(csp, /connect-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
  assert.ok(csp.includes('https://*.googleusercontent.com'));
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('config hides Google sign-in when GOOGLE_CLIENT_ID is unset', async () => {
  const r = await new Client().get('/config');
  assert.equal(r.status, 200);
  assert.ok(!r.body.googleClientId);
});

test('unauthenticated users cannot change data or read private endpoints', async () => {
  const anon = new Client();
  for (const [m, p] of [['GET', '/me/settings'], ['PATCH', '/me/settings'], ['GET', '/me/blocks'], ['GET', '/me/follow-requests'], ['POST', '/reports'], ['GET', '/admin/reports'], ['POST', '/auth/password']]) {
    const r = await anon.req(m, p, m === 'GET' ? undefined : {}); assert.equal(r.status, 401, `${m} ${p}`);
  }
  // CSRF: طلب بدون الترويسة المخصصة يُرفض
  const raw = await fetch(BASE + '/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(raw.status, 403);
});

test('settings persist and are validated', async () => {
  const a = await user('set_alice');
  assert.deepEqual((await a.get('/me/settings')).body, { isPrivate: false, commentPolicy: 'everyone', messagePolicy: 'everyone', allowDuet: true, allowStitch: true, allowDownload: true });
  assert.equal((await a.patch('/me/settings', { commentPolicy: 'hackers' })).status, 400);
  assert.equal((await a.patch('/me/settings', { isPrivate: 'yes' })).status, 400);
  assert.deepEqual((await a.patch('/me/settings', { isPrivate: true, commentPolicy: 'followers', messagePolicy: 'everyone', allowDuet: true, allowStitch: true })).body, { isPrivate: true, commentPolicy: 'followers', messagePolicy: 'everyone', allowDuet: true, allowStitch: true, allowDownload: true });
  assert.deepEqual((await a.get('/me/settings')).body, { isPrivate: true, commentPolicy: 'followers', messagePolicy: 'everyone', allowDuet: true, allowStitch: true, allowDownload: true });
});

test('password change requires current password and revokes old sessions', async () => {
  const pw = 'original-pass-123';
  const c = new Client(); await c.post('/auth/signup', { email: 'pw_user@test.local', username: 'pw_user', password: pw });
  const other = new Client(); await other.post('/auth/login', { email: 'pw_user@test.local', password: pw });
  assert.equal((await c.post('/auth/password', { current: 'wrong-pass', next: 'new-pass-12345' })).status, 401);
  assert.equal((await c.post('/auth/password', { current: pw, next: 'short' })).status, 400);
  assert.equal((await c.post('/auth/password', { current: pw, next: 'new-pass-12345' })).status, 200);
  assert.equal((await c.get('/auth/me')).body.user.username, 'pw_user');       // الجهاز الحالي يبقى مسجلاً
  assert.equal((await other.get('/auth/me')).body.user, null);                   // الجلسة القديمة أُبطلت
  assert.equal((await new Client().post('/auth/login', { email: 'pw_user@test.local', password: pw })).status, 401);
});

test('private account: content hidden until follow request is approved', async () => {
  const owner = await user('priv_owner'); const fan = await user('priv_fan'); const anon = new Client();
  const v = await upload(owner, 'secret clip #hidden');
  await owner.patch('/me/settings', { isPrivate: true });
  const hidden = async (c) => {
    assert.equal((await c.get('/videos/' + v.id)).body, null);
    assert.ok(!(await c.get('/videos')).body.some((x) => x.id === v.id));
    assert.deepEqual((await c.get('/videos?userId=' + owner.me.id)).body, []);
    assert.ok(!(await c.get('/search?q=secret')).body.videos.length);
    assert.equal((await c.get(`/videos/${v.id}/comments`)).status, 404);
  };
  await hidden(anon); await hidden(fan);
  assert.equal((await fan.post(`/videos/${v.id}/like`)).status, 404);
  assert.equal((await fan.req('POST', `/videos/${v.id}/comments`, { text: 'hi' })).status, 404);
  assert.equal((await owner.get('/videos/' + v.id)).body.id, v.id);            // صاحب المحتوى يراه
  const prof = (await fan.get('/users/' + owner.me.id)).body; assert.equal(prof.isPrivate, true); assert.equal(prof.relation.canView, false);
  // طلب متابعة
  const f = (await fan.post(`/users/${owner.me.id}/follow`)).body; assert.deepEqual(f, { following: false, requested: true });
  await hidden(fan);
  const reqs = (await owner.get('/me/follow-requests')).body; assert.deepEqual(reqs.map((u) => u.id), [fan.me.id]);
  assert.equal((await fan.post(`/me/follow-requests/${owner.me.id}/accept`)).status, 404);   // لا يقبل الطلب إلا صاحب الحساب
  assert.equal((await owner.post(`/me/follow-requests/${fan.me.id}/accept`)).status, 200);
  assert.equal((await fan.get('/videos/' + v.id)).body.id, v.id);
  assert.equal((await fan.get('/users/' + owner.me.id)).body.relation.canView, true);
  await hidden(anon);                                                          // الزائر ما زال لا يرى
  // إزالة المتابع تعيد الإخفاء
  await owner.del('/me/followers/' + fan.me.id); await hidden(fan);
});

test('saved/liked lists are private to their owner', async () => {
  const a = await user('lists_a'); const b = await user('lists_b');
  assert.equal((await b.get('/videos?savedBy=' + a.me.id)).status, 403);
  assert.equal((await b.get('/videos?likedBy=' + a.me.id)).status, 403);
  assert.equal((await a.get('/videos?savedBy=' + a.me.id)).status, 200);
});

test('blocking hides content both ways and stops interactions', async () => {
  const a = await user('blk_a'); const b = await user('blk_b');
  const va = await upload(a, 'from a'); const vb = await upload(b, 'from b');
  await b.post(`/users/${a.me.id}/follow`); await a.post(`/users/${b.me.id}/follow`);
  await b.req('POST', `/videos/${va.id}/comments`, { text: 'b comment before block' });
  assert.equal((await a.post(`/users/${b.me.id}/block`)).status, 200);
  // b لا يرى a
  assert.equal((await b.get('/users/' + a.me.id)).body, null);
  assert.equal((await b.get('/videos/' + va.id)).body, null);
  assert.equal((await b.post(`/videos/${va.id}/like`)).status, 404);
  assert.equal((await b.post(`/users/${a.me.id}/follow`)).status, 403);
  assert.ok(!(await b.get('/search?q=blk_a')).body.users.length);
  // a لا يرى b أيضاً والمتابعات حُذفت
  assert.equal((await a.get('/videos/' + vb.id)).body, null);
  assert.equal((await a.get('/users/' + b.me.id)).body.relation.blockedByMe, true);
  assert.equal((await a.get(`/users/${a.me.id}/stats`)).body.followers, 0);
  assert.ok(!(await a.get(`/videos/${va.id}/comments`)).body.comments.length);   // تعليقات المحظور مخفية
  assert.deepEqual((await a.get('/me/blocks')).body.map((u) => u.id), [b.me.id]);
  // فك الحظر
  await a.del(`/users/${b.me.id}/block`);
  assert.equal((await b.get('/videos/' + va.id)).body.id, va.id);
  assert.equal((await b.post(`/users/${a.me.id}/follow`)).body.following, true);
});

test('comment policy is enforced server-side', async () => {
  const o = await user('cp_owner'); const x = await user('cp_x');
  const v = await upload(o, 'policy');
  await o.patch('/me/settings', { commentPolicy: 'nobody' });
  assert.equal((await x.req('POST', `/videos/${v.id}/comments`, { text: 'no' })).status, 403);
  assert.equal((await o.req('POST', `/videos/${v.id}/comments`, { text: 'owner ok' })).status, 201);
  await o.patch('/me/settings', { commentPolicy: 'followers' });
  assert.equal((await x.req('POST', `/videos/${v.id}/comments`, { text: 'no' })).status, 403);
  await x.post(`/users/${o.me.id}/follow`);
  assert.equal((await x.req('POST', `/videos/${v.id}/comments`, { text: 'yes' })).status, 201);
});

test('replies: same-video parent, one level, delete ownership', async () => {
  const o = await user('rp_owner'); const a = await user('rp_a'); const b = await user('rp_b');
  const v = await upload(o, 'thread'); const v2 = await upload(o, 'other');
  const root = (await a.req('POST', `/videos/${v.id}/comments`, { text: 'root' })).body;
  const r1 = await b.req('POST', `/videos/${v.id}/comments`, { text: 'reply', parentId: root.id }); assert.equal(r1.status, 201); assert.equal(r1.body.parentId, root.id);
  const r2 = (await a.req('POST', `/videos/${v.id}/comments`, { text: 'reply to reply', parentId: r1.body.id })).body; assert.equal(r2.parentId, root.id);
  assert.equal((await b.req('POST', `/videos/${v2.id}/comments`, { text: 'x', parentId: root.id })).status, 400);  // أب من مقطع آخر
  assert.equal((await b.req('POST', `/videos/${v.id}/comments`, { text: 'x', parentId: 'nope' })).status, 400);
  assert.ok((await a.get('/notifications')).body.notifications.some((n) => n.type === 'reply'));
  assert.equal((await a.del('/comments/' + r1.body.id)).status, 403);        // ليس كاتبه ولا صاحب المقطع
  assert.equal((await b.del('/comments/' + r1.body.id)).status, 200);        // كاتبه
  assert.equal((await o.del('/comments/' + r2.id)).status, 200);             // صاحب المقطع
  assert.equal((await new Client().del('/comments/' + root.id)).status, 401);
  assert.equal((await b.del('/comments/' + root.id)).status, 403);
});

test('reports: submission rules and admin-only review', async () => {
  const o = await user('rep_owner'); const r = await user('rep_reporter');
  const v = await upload(o, 'reportable');
  const c = (await o.req('POST', `/videos/${v.id}/comments`, { text: 'bad words' })).body;
  assert.equal((await r.post('/reports', { type: 'video', id: v.id, reason: 'invalid' })).status, 400);
  assert.equal((await o.post('/reports', { type: 'video', id: v.id, reason: 'spam' })).status, 400);     // لا تبليغ عن نفسك
  assert.equal((await r.post('/reports', { type: 'video', id: v.id, reason: 'spam', details: 'x' })).status, 201);
  assert.equal((await r.post('/reports', { type: 'video', id: v.id, reason: 'spam' })).status, 409);    // مكرر
  assert.equal((await r.post('/reports', { type: 'comment', id: c.id, reason: 'harassment' })).status, 201);
  assert.equal((await r.post('/reports', { type: 'user', id: o.me.id, reason: 'scam' })).status, 201);
  assert.equal((await r.get('/admin/reports')).status, 403);
  const admin = new Client(); assert.equal((await admin.post('/auth/login', ADMIN)).status, 200);
  const list = (await admin.get('/admin/reports')).body.reports; assert.equal(list.length, 3);
  const byType = Object.fromEntries(list.map((x) => [x.type, x]));
  assert.equal((await r.post(`/admin/reports/${byType.video.id}/resolve`, { action: 'hide_video' })).status, 403);
  assert.equal((await admin.post(`/admin/reports/${byType.user.id}/resolve`, { action: 'hide_video' })).status, 400);  // إجراء لا يناسب النوع
  assert.equal((await admin.post(`/admin/reports/${byType.video.id}/resolve`, { action: 'hide_video' })).body.status, 'actioned');
  assert.equal((await new Client().get('/videos/' + v.id)).body, null);
  assert.equal((await admin.post(`/admin/reports/${byType.video.id}/resolve`, { action: 'dismiss' })).status, 409);   // سبق حسمه
  assert.equal((await admin.post(`/admin/reports/${byType.comment.id}/resolve`, { action: 'delete_comment' })).status, 200);
  assert.equal((await admin.post(`/admin/reports/${byType.user.id}/resolve`, { action: 'ban_user' })).status, 200);
  assert.equal((await o.get('/auth/me')).body.user, null);                    // المحظور خرج من جلساته
  assert.equal((await admin.get('/admin/reports?status=open')).body.reports.length, 0);
});

// ===== سياسة تأجير المتاجر =====
test('store rental requires accepting the current policy version and records it server-side', async () => {
  const m = await user('policy_merchant');
  const ver = (await m.get('/policy/store-rental')).body.version;
  assert.match(ver, /^store-rental-/);
  assert.equal((await m.get('/config')).body.storePolicyVersion, ver);
  const web = fs.readFileSync(path.join(here, '../../web/js/policy-text.js'), 'utf8');
  assert.ok(web.includes(`"version": "${ver}"`), 'web policy version must match server');
  const store = { name: 'متجر اختبار', category: 'other' };
  assert.equal((await m.post('/stores', { store, planId: 'weekly' })).body.error, 'policyRequired');
  assert.equal((await m.post('/stores', { store, planId: 'weekly', acceptPolicy: 'old-version' })).status, 400);
  const created = await m.post('/stores', { store, planId: 'weekly', acceptPolicy: ver });
  assert.equal(created.status, 201);
  assert.equal((await m.post(`/stores/${created.body.id}/rentals`, { planId: 'weekly' })).status, 400);
  assert.equal((await m.post(`/stores/${created.body.id}/rentals`, { planId: 'weekly', acceptPolicy: ver })).status, 201);
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  try {
    const acc = (await cl.query("select version, store_id, rental_id from policy_acceptances where user_id = $1 and policy = 'store-rental'", [m.me.id])).rows;
    assert.equal(acc.length, 2); assert.ok(acc.every((a) => a.version === ver && a.store_id === created.body.id && a.rental_id));
    const rents = (await cl.query('select policy_version from rentals where owner_id = $1', [m.me.id])).rows;
    assert.ok(rents.length === 2 && rents.every((r) => r.policy_version === ver));
  } finally { await cl.end(); }
  // لا يوجد مسار دفع لمشتريات المنتجات في الخادم
  assert.equal((await m.post('/payments/checkout', {})).status, 404);
  assert.equal((await m.post('/orders', {})).status, 404);
});

test('policy page and links are served', async () => {
  const root = BASE.replace(/\/api$/, '');
  for (const p of ['/js/views/policy.js', '/js/policy-text.js']) assert.equal((await fetch(root + p)).status, 200, p);
  const app = await (await fetch(root + '/js/app.js')).text(); assert.ok(app.includes("policy: () => import('./views/policy.js')"));
  const text = await (await fetch(root + '/js/policy-text.js')).text();
  assert.ok(text.includes('لا تستلم أموال المشتريات'));
  for (const v of ['stores.js', 'checkout.js', 'settings.js', 'feed.js']) assert.ok((await (await fetch(root + '/js/views/' + v)).text()).includes('#/policy'), v);
});

test('privacy and terms pages are served at pretty and .html URLs and linked from the app', async () => {
  const root = BASE.replace(/\/api$/, '');
  for (const p of ['/privacy', '/privacy.html', '/terms', '/terms.html']) {
    const res = await fetch(root + p);
    assert.equal(res.status, 200, p);
    const html = await res.text();
    assert.ok(html.includes('جميع الحقوق محفوظة © 2026 وطن النهار'), p);
    assert.ok(html.includes('lang="en"') && html.includes('dir="ltr"'), p);
  }
  const privacy = await (await fetch(root + '/privacy')).text();
  for (const s of ['البريد الإلكتروني', 'اسم المستخدم', 'Google', 'صورة الملف الشخصي', 'المقاطع', 'التعليقات', 'المتاجر', 'لا تبيع', 'خادمنا', 'aaaaaaaasa2112@gmail.com', 'كوكيز', 'Deletion requests', 'We do not sell']) {
    assert.ok(privacy.includes(s), 'privacy missing: ' + s);
  }
  const terms = await (await fetch(root + '/terms')).text();
  assert.ok(terms.includes('شروط الاستخدام') && terms.includes('Terms of Use') && terms.includes('تؤجّر مساحة المتجر فقط'));
  const settings = await (await fetch(root + '/js/views/settings.js')).text();
  assert.ok(settings.includes('href="/privacy"') && settings.includes('href="/terms"'));
  const app = await (await fetch(root + '/js/app.js')).text();
  assert.ok(app.includes('/privacy') && app.includes('/terms'));
  const auth = await (await fetch(root + '/js/views/auth.js')).text();
  assert.ok(auth.includes('legalLinksHTML'));
});

test('homepage SEO tags, robots, sitemap and og image are served', async () => {
  const root = BASE.replace(/\/api$/, '');
  const res = await fetch(root + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const s of [
    'lang="ar"', 'dir="rtl"',
    'كليب كات — مقاطع قصيرة ومتاجر للصنّاع في الكويت والخليج',
    'منصة مقاطع فيديو قصيرة للصنّاع في الكويت والخليج',
    'rel="canonical" href="https://clipkat.live/"',
    'property="og:image" content="https://clipkat.live/assets/og.png"',
    'name="twitter:card" content="summary_large_image"',
    'name="theme-color" content="#0b1020"',
    'rel="apple-touch-icon" href="/assets/apple-touch-icon.png"',
    'application/ld+json',
    '"@type":"WebSite"',
    '"@type":"Organization"',
    'https://clipkat.live/',
    'SearchAction'
  ]) {
    if (s === 'SearchAction') assert.ok(!html.includes(s), 'SearchAction should be absent without a real search URL');
    else assert.ok(html.includes(s), 'homepage missing: ' + s);
  }
  assert.ok(html.includes('<noscript>') && html.includes('منصة مقاطع فيديو قصيرة'), 'noscript intro');
  assert.ok(html.includes('class="sr-only"'), 'crawlable intro');

  const robots = await fetch(root + '/robots.txt');
  assert.equal(robots.status, 200);
  const rtxt = await robots.text();
  assert.ok(rtxt.includes('Disallow: /api/'));
  assert.ok(rtxt.includes('Disallow: /admin'));
  assert.ok(rtxt.includes('Sitemap: https://clipkat.live/sitemap.xml'));

  const sm = await fetch(root + '/sitemap.xml');
  assert.equal(sm.status, 200);
  const sxml = await sm.text();
  for (const loc of ['https://clipkat.live/', 'https://clipkat.live/privacy', 'https://clipkat.live/terms']) {
    assert.ok(sxml.includes('<loc>' + loc + '</loc>'), loc);
  }

  const og = await fetch(root + '/assets/og.png');
  assert.equal(og.status, 200);
  assert.ok((og.headers.get('content-type') || '').startsWith('image/png'));
  const buf = Buffer.from(await og.arrayBuffer());
  assert.ok(buf.length > 10000, 'og image too small');

  const ico = await fetch(root + '/assets/apple-touch-icon.png');
  assert.equal(ico.status, 200);
});

// ===== رابط التواصل للمتجر: قبول الصيغ الشائعة ورسائل حقول واضحة =====
const CONTACT_CASES = [
  ['96512345678', 'https://wa.me/96512345678'], ['+965 5123 4567', 'https://wa.me/96551234567'], ['٩٦٥٥١٢٣٤٥٦٧', 'https://wa.me/96551234567'],
  ['51234567', 'https://wa.me/96551234567'], ['00965-5123-4567', 'https://wa.me/96551234567'], ['wa.me/96551234567', 'https://wa.me/96551234567'],
  ['@anwar.perfume', 'https://instagram.com/anwar.perfume'], ['instagram.com/anwar', 'https://instagram.com/anwar'], ['www.instagram.com/anwar', 'https://www.instagram.com/anwar'],
  ['t.me/anwar', 'https://t.me/anwar'], ['https://wa.me/96551234567', 'https://wa.me/96551234567'], ['', null],
  ['javascript:alert(1)', 'X'], ['JavaScript://x.com/%0aalert(1)', 'X'], ['data:text/html,hi', 'X'], ['vbscript:x', 'X'], ['http://u:p@x.com', 'X'], ['anwarperfume', 'X'], ['123', 'X'], ['https://x', 'X'], ['a'.repeat(301), 'X']
];
test('contact normalizer: server and web agree, output is only http/https', async () => {
  const { normContact } = await import('../src/util.js');
  const web = await import('../../web/js/contact-url.js');
  for (const [inp, want] of CONTACT_CASES) {
    let got; try { got = normContact(inp); } catch (e) { assert.equal(e.field, 'contact'); got = 'X'; }
    assert.equal(got, want, inp);
    const w = web.normContact(inp); assert.equal(w === null ? 'X' : w === '' ? null : w, want, 'web ' + inp);
    if (got && got !== 'X') assert.match(got, /^https?:\/\//);
  }
});

test('store rental accepts phone/WhatsApp/@handle contacts, stays pending, and names the wrong field', async () => {
  const m = await user('contact_merchant');
  const ver = (await m.get('/policy/store-rental')).body.version;
  const base = { name: 'متجر أنوار للعطور', category: 'perfume', description: 'عطور ودهن عود 🌹' };
  const post = (store) => m.post('/stores', { store: { ...base, ...store }, planId: 'monthly', payment: { method: 'knet', ref: 'DEMO-X' }, acceptPolicy: ver });
  for (const [store, fieldName] of [[{ contact: 'javascript:alert(1)' }, 'contact'], [{ contact: 'anwarperfume' }, 'contact'], [{ name: 'م'.repeat(41) }, 'name'], [{ name: '  ' }, 'name'],
    [{ description: 'و'.repeat(201) }, 'description'], [{ logo: 'https://evil.example/x.png' }, 'logo'], [{ banner: '/uploads/images/../../etc/passwd' }, 'banner']]) {
    const r = await post(store); assert.equal(r.status, 400, JSON.stringify(store)); assert.equal(r.body.error, 'bad'); assert.equal(r.body.field, fieldName, JSON.stringify(store));
  }
  for (let i = 0; i < 40 && !errLog.includes('[stores] POST /api/stores 400'); i++) await new Promise((r) => setTimeout(r, 50));
  assert.match(errLog, new RegExp(`\\[stores\\] POST /api/stores 400 err=bad field=contact user=${m.me.id}`));
  assert.ok(!errLog.includes('javascript:alert'), 'request bodies are not logged');
  const ok = await post({ contact: '+965 5123 4567' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body)); assert.equal(ok.body.contact, 'https://wa.me/96551234567'); assert.equal(ok.body.pending, true);
  const again = await post({ contact: '' }); assert.equal(again.status, 409); assert.equal(again.body.error, 'exists');
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  try { const rt = (await cl.query('select status from rentals where owner_id = $1', [m.me.id])).rows; assert.deepEqual(rt.map((x) => x.status), ['pending']); } finally { await cl.end(); }
  const p1 = await m.patch(`/stores/${ok.body.id}`, { contact: '@anwar.perfume' }); assert.equal(p1.status, 200); assert.equal(p1.body.contact, 'https://instagram.com/anwar.perfume');
  const p2 = await m.patch(`/stores/${ok.body.id}`, { contact: 'data:text/html,x' }); assert.equal(p2.status, 400); assert.equal(p2.body.field, 'contact');
  const p3 = await m.patch(`/stores/${ok.body.id}`, { contact: '' }); assert.equal(p3.status, 200); assert.equal(p3.body.contact || '', '');
});

test('store form: contact input is free text with hint, clear field errors, matching length limits', async () => {
  const root = BASE.replace(/\/api$/, '');
  const co = await (await fetch(root + '/js/views/checkout.js')).text();
  assert.ok(co.includes('name="contact" type="text"') && !co.includes('name="contact" type="url"'));
  assert.ok(co.includes('maxlength="40"') && co.includes('maxlength="200"') && co.includes('storeErrorMessage'));
  const i18n = await (await fetch(root + '/js/i18n.js')).text();
  for (const k of ['storeErr_name', 'storeErr_description', 'storeErr_contact', 'storeErr_logo', 'storeErr_banner', 'storeErr_exists', 'contactHint']) assert.ok(i18n.split(k + ':').length === 3, k);
  const { storeErrorMessage } = await import('../../web/js/contact-url.js');
  const tt = (k) => ({ storeErr_contact: 'C', storeErr_exists: 'E', storeErr_generic: 'G', storeErr_logo: 'L' }[k] ?? k);
  assert.equal(storeErrorMessage(Object.assign(new Error('bad'), { field: 'contact' }), tt), 'C');
  assert.equal(storeErrorMessage(Object.assign(new Error('badFile'), { field: 'logo' }), tt), 'L');
  assert.equal(storeErrorMessage(new Error('exists'), tt), 'E');
  assert.equal(storeErrorMessage(new Error('bad'), tt), 'G');              // لا نعرض «bad» الخام للمستخدم أبداً
});
