// © 2026 وطن النهار — «روّج فيديوك»: إنشاء حملة بالعملات، اعتماد/رفض مع إعادة المبلغ، الظهور في «لك»، سقف التكرار، نفاد الميزانية، الإيقاف
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
const PORT = 40100 + crypto.randomInt(0, 40);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-promo-'));
let srv, db;

class Client {
  constructor(ua = 'test') { this.cookie = ''; this.ua = ua; }
  async req(method, p, body) {
    const h = { 'X-CK': '1', 'User-Agent': this.ua }; if (this.cookie) h.cookie = this.cookie;
    let b; if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b, redirect: 'manual' });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); }
}
let n = 0;
async function user(prefix) {
  const c = new Client(); const name = `${prefix}${++n}${crypto.randomBytes(2).toString('hex')}`;
  const r = await c.post('/auth/signup', { email: `${name}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function admin() { const c = new Client(); const r = await c.post('/auth/login', ADMIN); assert.equal(r.status, 200, JSON.stringify(r.body)); return c; }
const grant = async (adm, u, coins) => { const r = await adm.post('/admin/coins/grant', { user: u.me.username, coins, note: 'test' }); assert.equal(r.status, 200, JSON.stringify(r.body)); };
const coins = async (c) => (await c.get('/wallet')).body.coins;
const mkVideo = async (u, caption = 'clip', tags = []) => (await db.query(`insert into videos (user_id, video_path, video_url, caption, hashtags) values ($1, '/uploads/videos/x.mp4', '/uploads/videos/x.mp4', $2, $3) returning id`, [u.me.id, caption, tags])).rows[0].id;
const promo = async (id) => (await db.query('select * from promotions where id = $1', [id])).rows[0];
const create = (c, body) => c.post('/promotions', { objective: 'views', audience: 'smart', budgetType: 'total', totalCoins: 50, days: 3, ...body });

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl,
    ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', TRANSCODE: '0', LIVEKIT_URL: '', PAYMENT_PROVIDER: '',
    PROMO_IMPRESSIONS_PER_COIN: '10', PROMO_EVERY: '7', PROMO_FREQ_CAP: '3', PROMO_MIN_COINS: '20' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { if (!/sendData|LiveKit/.test(String(d))) process.stderr.write(d); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
  db = new pg.Client({ connectionString: DB }); await db.connect();
});
after(async () => { await db?.end(); srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('config + validation: own published video only, minimum budget, enough coins', async () => {
  const cfg = await new Client().get('/promote/config');
  assert.equal(cfg.status, 200); assert.deepEqual(cfg.body.objectives, ['views', 'profile', 'follows', 'messages']); assert.equal(cfg.body.perCoin, 10); assert.equal(cfg.body.governorates.length, 6);
  const adm = await admin(); const u = await user('adv'); const other = await user('oth');
  const vid = await mkVideo(u); const otherVid = await mkVideo(other);
  assert.equal((await new Client().post('/promotions', { videoId: vid })).status, 401);
  assert.equal((await create(u, { videoId: otherVid })).status, 404);
  assert.equal((await create(u, { videoId: vid, objective: 'nope' })).status, 400);
  assert.equal((await create(u, { videoId: vid, totalCoins: 5 })).status, 400);
  assert.equal((await create(u, { videoId: vid, days: 31 })).status, 400);
  const poor = await create(u, { videoId: vid });
  assert.equal(poor.status, 402); assert.equal(poor.body.error, 'insufficient');
  assert.equal((await db.query('select count(*)::int as n from promotions')).rows[0].n, 0, 'failed debit rolls back the campaign row');
  await grant(adm, u, 100);
  const daily = await create(u, { videoId: vid, budgetType: 'daily', dailyCoins: 10, days: 3, audience: 'manual', governorates: ['hawalli', 'bad'], gender: 'female', ageMin: 18, ageMax: 34, interests: ['#طبخ', 'قهوة'] });
  assert.equal(daily.status, 201, JSON.stringify(daily.body));
  const p = daily.body.promotion;
  assert.equal(p.status, 'pending'); assert.equal(p.totalCoins, 30); assert.equal(p.maxImpressions, 300); assert.deepEqual(p.governorates, ['hawalli']); assert.deepEqual(p.interests, ['طبخ', 'قهوة']); assert.deepEqual(p.ageBrackets, ['18-24', '25-34']);
  assert.equal(p.estimate.impressions, 300); assert.equal(p.estimate.low, 240); assert.equal(p.estimate.high, 360);
  assert.equal(daily.body.wallet.coins, 70);
  const led = (await db.query("select * from coin_ledger where user_id = $1 and kind = 'promo'", [u.me.id])).rows;
  assert.equal(led.length, 1); assert.equal(Number(led[0].delta), -30); assert.equal(led[0].ref_id, p.id);
  // صاحب الحملة يلغيها قبل الاعتماد → يرجع كامل المبلغ
  const cancel = await u.post(`/promotions/${p.id}/cancel`);
  assert.equal(cancel.status, 200); assert.equal(cancel.body.refunded, 30); assert.equal(cancel.body.wallet.coins, 100);
  assert.equal((await u.post(`/promotions/${p.id}/cancel`)).status, 400);
});

test('admin reject refunds every coin and notifies the advertiser; non-admins cannot decide', async () => {
  const adm = await admin(); const u = await user('rej'); await grant(adm, u, 200);
  const vid = await mkVideo(u);
  const c = await create(u, { videoId: vid, totalCoins: 80 }); assert.equal(c.status, 201);
  assert.equal(await coins(u), 120);
  assert.equal((await u.post(`/admin/promotions/${c.body.promotion.id}/approve`)).status, 403);
  const list = await adm.get('/admin/promotions?status=pending');
  assert.ok(list.body.promotions.some((x) => x.id === c.body.promotion.id && x.user.username === u.me.username));
  const r = await adm.post(`/admin/promotions/${c.body.promotion.id}/reject`, { reason: 'المحتوى غير مناسب' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.refunded, 80); assert.equal(r.body.promotion.status, 'rejected'); assert.equal(r.body.promotion.rejectReason, 'المحتوى غير مناسب');
  assert.equal(await coins(u), 200);
  assert.equal((await adm.post(`/admin/promotions/${c.body.promotion.id}/reject`)).status, 400, 'cannot reject twice / double refund');
  assert.equal(await coins(u), 200);
  const notes = (await db.query("select text from notifications where user_id = $1 and text like '%رفض حملة%'", [u.me.id])).rows; assert.equal(notes.length, 1);
});

test('approved campaign is injected into For You (labelled), not shown to its owner, and respects the frequency cap', async () => {
  const adm = await admin(); const adv = await user('inj'); await grant(adm, adv, 500);
  const creator = await user('cre');
  for (let i = 0; i < 10; i++) await mkVideo(creator, 'organic ' + i);
  const vid = await mkVideo(adv, 'روّج هذا');
  const c = await create(adv, { videoId: vid, objective: 'follows', totalCoins: 100, days: 2 }); assert.equal(c.status, 201);
  const id = c.body.promotion.id;
  const viewer = await user('vw');
  let page = (await viewer.get('/videos?tab=foryou&limit=8&includeSeen=1')).body;
  assert.ok(!page.promos || !page.promos[vid], 'pending campaigns are not delivered');
  const ap = await adm.post(`/admin/promotions/${id}/approve`); assert.equal(ap.status, 200); assert.equal(ap.body.promotion.status, 'active'); assert.ok(ap.body.promotion.endAt > Date.now());
  page = (await viewer.get('/videos?tab=foryou&limit=8&includeSeen=1')).body;
  assert.equal(page.videos.length, 7, '6 organic + 1 sponsored = one ad every 7');
  assert.equal(page.videos[6].id, vid); assert.deepEqual(page.promos[vid], { campaignId: id, objective: 'follows', cta: 'follow', storeId: null });
  assert.ok(page.hasMore);
  // «أتابعه» ولصاحب الحملة: لا إعلان
  const mine = (await adv.get('/videos?tab=foryou&limit=8&includeSeen=1')).body; assert.ok(!mine.promos[vid]);
  const fol = (await viewer.get('/videos?tab=following&limit=8')).body; assert.ok(!fol.promos);
  // الظهور يُحتسب حتى 3 مرات خلال 24 ساعة ثم يتوقف الإعلان لهذا المشاهد
  for (let i = 0; i < 3; i++) assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, true);
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, false);
  page = (await viewer.get('/videos?tab=foryou&limit=8&includeSeen=1')).body;
  assert.ok(!page.promos[vid], 'frequency cap reached → not served again'); assert.equal(page.videos.length, 8);
  // نقرة ومتابعة ومشاهدة تُحتسب مرة واحدة، والمتابعة فقط إن تمت فعلاً
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'follow' })).body.counted, false);
  await viewer.post(`/users/${adv.me.id}/follow`);
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'follow' })).body.counted, true);
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'follow' })).body.counted, false);
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'click' })).body.counted, true);
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'click' })).body.counted, false);
  assert.equal((await viewer.post(`/promotions/${id}/event`, { kind: 'view' })).body.counted, true);
  // من لم يرَ الإعلان لا تُحتسب نقرته
  const stranger = await user('str'); assert.equal((await stranger.post(`/promotions/${id}/event`, { kind: 'click' })).body.counted, false);
  // صاحب الحملة لا يُحتسب
  assert.equal((await adv.post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, false);
  const stats = (await adv.get('/promotions')).body.promotions.find((x) => x.id === id);
  assert.equal(stats.impressions, 3); assert.equal(stats.clicks, 1); assert.equal(stats.follows, 1); assert.equal(stats.views, 1);
  assert.equal(stats.spentCoins, 1); assert.equal(stats.remainingCoins, 99); assert.equal(stats.status, 'active');
  // زائر بدون حساب يرى الإعلان أيضاً
  const anon = (await new Client('anon-ua').get('/videos?tab=foryou&limit=8')).body; assert.equal(anon.promos[vid]?.campaignId, id);
  // الإيقاف المؤقت يوقف العرض والاستئناف يعيده
  assert.equal((await adm.post(`/admin/promotions/${id}/pause`)).body.promotion.status, 'paused');
  assert.ok(!(await new Client('anon-ua').get('/videos?tab=foryou&limit=8')).body.promos[vid]);
  assert.equal((await new Client('anon-ua').post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, false);
  assert.equal((await adm.post(`/admin/promotions/${id}/resume`)).body.promotion.status, 'active');
  // الإنهاء من المشرف يعيد المتبقي (100 − 1)
  const before = await coins(adv);
  const stop = await adm.post(`/admin/promotions/${id}/stop`); assert.equal(stop.status, 200); assert.equal(stop.body.refunded, 99);
  assert.equal(await coins(adv), before + 99);
  assert.equal(stop.body.promotion.spentCoins, 1); assert.equal(stop.body.promotion.remainingCoins, 0);
});

test('interest targeting: viewers with other interests are skipped, new viewers still see it', async () => {
  const adm = await admin(); const adv = await user('tgt'); await grant(adm, adv, 100);
  const creator = await user('tc'); for (let i = 0; i < 8; i++) await mkVideo(creator, 'x' + i, ['رياضة']);
  const vid = await mkVideo(adv, 'قهوتي', ['قهوة']);
  const c = await create(adv, { videoId: vid, audience: 'manual', interests: ['قهوة'], totalCoins: 30 }); await adm.post(`/admin/promotions/${c.body.promotion.id}/approve`);
  const sporty = await user('sp');
  const someSport = (await db.query("select id from videos where user_id = $1 limit 1", [creator.me.id])).rows[0].id;
  await sporty.post(`/videos/${someSport}/like`);
  assert.ok(!(await sporty.get('/videos?tab=foryou&limit=8&includeSeen=1')).body.promos[vid]);
  const fresh = await user('fr');
  assert.equal((await fresh.get('/videos?tab=foryou&limit=8&includeSeen=1')).body.promos[vid]?.objective, 'views');
  await adm.post(`/admin/promotions/${c.body.promotion.id}/stop`);
});

test('budget exhaustion ends the campaign automatically (spent = total, no refund) and stops delivery', async () => {
  const adm = await admin(); const adv = await user('bud'); await grant(adm, adv, 100);
  const creator = await user('bc'); for (let i = 0; i < 8; i++) await mkVideo(creator, 'b' + i);
  const vid = await mkVideo(adv, 'ميزانية');
  const c = await create(adv, { videoId: vid, totalCoins: 20 }); const id = c.body.promotion.id;
  await adm.post(`/admin/promotions/${id}/approve`);
  // 200 ظهور = 20 عملة؛ نضبط العداد قرب النهاية ثم نكمل بأحداث حقيقية من مشاهدين مختلفين
  await db.query('update promotions set impressions = 198 where id = $1', [id]);
  assert.equal((await new Client('ua-1').post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, true);
  assert.equal((await new Client('ua-2').post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, true);
  const p = await promo(id);
  assert.equal(p.status, 'ended'); assert.equal(p.end_reason, 'budget'); assert.equal(p.impressions, 200); assert.equal(p.spent_coins, 20); assert.equal(p.refunded_coins, 0);
  assert.equal((await new Client('ua-3').post(`/promotions/${id}/event`, { kind: 'impression' })).body.counted, false);
  assert.ok(!(await new Client('ua-3').get('/videos?tab=foryou&limit=8')).body.promos[vid]);
  assert.equal(await coins(adv), 80);
});

test('end date passes → sweeper ends it and refunds the unspent coins; deleted video ends it too', async () => {
  const adm = await admin(); const adv = await user('end'); await grant(adm, adv, 200);
  const v1 = await mkVideo(adv, 'e1'); const v2 = await mkVideo(adv, 'e2');
  const a = (await create(adv, { videoId: v1, totalCoins: 50 })).body.promotion.id;
  const b = (await create(adv, { videoId: v2, totalCoins: 40 })).body.promotion.id;
  await adm.post(`/admin/promotions/${a}/approve`); await adm.post(`/admin/promotions/${b}/approve`);
  await db.query("update promotions set impressions = 95, end_at = now() - interval '1 minute' where id = $1", [a]);
  await db.query('delete from videos where id = $1', [v2]);
  assert.equal(await coins(adv), 110);
  const list = (await adv.get('/promotions')).body.promotions;   // القراءة تُشغّل الإنهاء
  const pa = list.find((x) => x.id === a), pb = list.find((x) => x.id === b);
  assert.equal(pa.status, 'ended'); assert.equal(pa.endReason, 'endDate'); assert.equal(pa.spentCoins, 10); assert.equal(pa.refundedCoins, 40);
  assert.equal(pb.status, 'ended'); assert.equal(pb.endReason, 'videoDeleted'); assert.equal(pb.refundedCoins, 40);
  assert.equal(await coins(adv), 190);
  // سجل العملات متوازن: −50 −40 +40 +40
  const sum = (await db.query("select coalesce(sum(delta),0)::int as s from coin_ledger where user_id = $1 and kind in ('promo','promo_refund')", [adv.me.id])).rows[0].s;
  assert.equal(sum, -10);
});

test('optional ad profile: private, validated, editable; demographic targeting filters viewers and treats unknown as a match', async () => {
  const adm = await admin(); const adv = await user('demo'); await grant(adm, adv, 200);
  const creator = await user('dc'); for (let i = 0; i < 8; i++) await mkVideo(creator, 'd' + i);
  const viewer = await user('dv');
  assert.deepEqual((await viewer.get('/me/ad-profile')).body, { country: null, governorate: null, ageBracket: null, gender: null });
  assert.equal((await new Client().get('/me/ad-profile')).status, 401);
  assert.equal((await viewer.req('PATCH', '/me/ad-profile', { governorate: 'dubai' })).status, 400);
  assert.equal((await viewer.req('PATCH', '/me/ad-profile', { ageBracket: '99+' })).status, 400);
  assert.equal((await viewer.req('PATCH', '/me/ad-profile', { gender: 'other' })).status, 400);
  const set = await viewer.req('PATCH', '/me/ad-profile', { governorate: 'jahra', ageBracket: '25-34', gender: 'female' });
  assert.deepEqual(set.body, { country: 'KW', governorate: 'jahra', ageBracket: '25-34', gender: 'female' }, 'a Kuwait governorate implies country KW');
  // لا تظهر في أي واجهة عامة ولا في /auth/me
  const pub = JSON.stringify((await new Client().get(`/users/${viewer.me.id}`)).body) + JSON.stringify((await viewer.get('/auth/me')).body) + JSON.stringify((await adv.get(`/users/${viewer.me.id}`)).body);
  assert.ok(!/jahra|25-34|female|ad_gov|adGov/.test(pub), pub);
  const vid = await mkVideo(adv, 'استهداف');
  const c = await create(adv, { videoId: vid, audience: 'manual', governorates: ['hawalli'], ageBrackets: ['18-24'], gender: 'male', totalCoins: 50 });
  assert.equal(c.status, 201, JSON.stringify(c.body)); assert.deepEqual(c.body.promotion.ageBrackets, ['18-24']);
  await adm.post(`/admin/promotions/${c.body.promotion.id}/approve`);
  const sees = async (u) => !!(await u.get('/videos?tab=foryou&limit=8&includeSeen=1')).body.promos?.[vid];
  assert.equal(await sees(viewer), false, 'jahra/25-34/female does not match hawalli/18-24/male');
  await viewer.req('PATCH', '/me/ad-profile', { governorate: 'hawalli', ageBracket: '18-24' });
  assert.equal(await sees(viewer), false, 'gender still mismatched');
  await viewer.req('PATCH', '/me/ad-profile', { gender: null });
  assert.equal(await sees(viewer), true, 'unknown gender counts as a match');
  await viewer.req('PATCH', '/me/ad-profile', { gender: 'male', governorate: 'ahmadi' });
  assert.equal(await sees(viewer), false);
  await viewer.req('PATCH', '/me/ad-profile', { governorate: null, ageBracket: null, gender: null });
  assert.equal(await sees(viewer), true, 'empty profile sees every campaign');
  assert.equal(await sees(new Client('anon-demo')), true, 'anonymous visitors are unknown → match');
  // حجم الجمهور: الكل/المطابق/غير المحدد (مقرّب)
  const aud = (await adv.get('/promote/audience?governorates=hawalli&ages=18-24&gender=male')).body;
  assert.equal(aud.filtered, true); assert.ok(aud.total.lt10 || aud.total.n >= aud.matched.n);
  assert.equal((await new Client().get('/promote/audience')).status, 401);
  await adm.post(`/admin/promotions/${c.body.promotion.id}/stop`);
});

test('worldwide: country in the ad profile (governorate only for Kuwait), campaigns target countries, unknown = match', async () => {
  const adm = await admin(); const adv = await user('wadv'); const sa = await user('wsa'); const kw = await user('wkw'); const none = await user('wnone');
  await grant(adm, adv, 300);
  assert.equal((await sa.req('PATCH', '/me/ad-profile', { country: 'XX' })).status, 400);
  assert.equal((await sa.req('PATCH', '/me/ad-profile', { country: 'sa' })).body.country, 'SA', 'normalised to upper case');
  assert.equal((await sa.req('PATCH', '/me/ad-profile', { governorate: 'hawalli' })).status, 400, 'no Kuwait governorate outside Kuwait');
  await kw.req('PATCH', '/me/ad-profile', { country: 'KW', governorate: 'hawalli' });
  assert.deepEqual((await kw.req('PATCH', '/me/ad-profile', { country: 'EG' })).body, { country: 'EG', governorate: null, ageBracket: null, gender: null });
  await kw.req('PATCH', '/me/ad-profile', { country: 'KW', governorate: 'farwaniya' });
  assert.ok(!/"KW"|farwaniya/.test(JSON.stringify((await new Client().get(`/users/${kw.me.id}`)).body)), 'country stays private');
  const cfg = (await new Client().get('/promote/config')).body; assert.ok(cfg.countries.length > 240 && cfg.countries.includes('PS')); assert.equal(cfg.governorateCountry, 'KW');
  const v1 = await mkVideo(adv, 'للسعودية');
  const c1 = await create(adv, { videoId: v1, audience: 'manual', countries: ['SA', 'ae', 'ZZ'], governorates: ['hawalli'], totalCoins: 50 });
  assert.equal(c1.status, 201, JSON.stringify(c1.body)); assert.deepEqual(c1.body.promotion.countries, ['SA', 'AE']); assert.deepEqual(c1.body.promotion.governorates, []);
  await adm.post(`/admin/promotions/${c1.body.promotion.id}/approve`);
  const sees = async (u, vid) => !!(await u.get('/videos?tab=foryou&limit=8&includeSeen=1')).body.promos?.[vid];
  assert.equal(await sees(sa, v1), true); assert.equal(await sees(kw, v1), false, 'Kuwait viewer excluded'); assert.equal(await sees(none, v1), true, 'unknown country = match');
  await adm.post(`/admin/promotions/${c1.body.promotion.id}/stop`);
  const v2 = await mkVideo(adv, 'حولي');
  const c2 = await create(adv, { videoId: v2, audience: 'manual', countries: ['KW'], governorates: ['hawalli'], totalCoins: 50 });
  assert.deepEqual(c2.body.promotion.governorates, ['hawalli']);
  await adm.post(`/admin/promotions/${c2.body.promotion.id}/approve`);
  assert.equal(await sees(kw, v2), false); assert.equal(await sees(sa, v2), false); assert.equal(await sees(none, v2), true);
  await kw.req('PATCH', '/me/ad-profile', { governorate: 'hawalli' });
  assert.equal(await sees(kw, v2), true);
  await adm.post(`/admin/promotions/${c2.body.promotion.id}/stop`);
  const aud = (await adv.get('/promote/audience?countries=SA,KW&governorates=hawalli')).body;
  assert.equal(aud.filtered, true);
  await db.query("update profiles set ad_country = null, ad_governorate = 'jahra' where id = $1", [none.me.id]);
  await db.query(fs.readFileSync(path.join(here, '..', '..', 'db', 'schema.sql'), 'utf8'));
  assert.equal((await db.query('select ad_country from profiles where id = $1', [none.me.id])).rows[0].ad_country, 'KW', 'old governorate-only rows become Kuwait');
});

test('schema migration stays re-runnable with promotion rows and promo ledger entries present', async () => {
  const sql = fs.readFileSync(path.join(here, '..', '..', 'db', 'schema.sql'), 'utf8');
  assert.ok((await db.query("select count(*)::int as n from coin_ledger where kind in ('promo','promo_refund')")).rows[0].n > 0);
  await db.query(sql); await db.query(sql);
});
