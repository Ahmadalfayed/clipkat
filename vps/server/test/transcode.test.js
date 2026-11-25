// © 2026 وطن النهار — اختبارات تجهيز المقاطع: تحويل HEVC/WebM/HDR إلى MP4 H.264 في الخلفية
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { rawUrl } from './helpers/media-url.mjs';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const PORT = 39100 + crypto.randomInt(0, 800);
const BASE = `http://127.0.0.1:${PORT}/api`;
const ADMIN = { email: `admin-${crypto.randomUUID()}@test.local`, password: crypto.randomBytes(18).toString('base64url') };
const here = path.dirname(new URL(import.meta.url).pathname);
const SAMPLE = path.join(here, '../../web/media/videos/coffee.mp4');
const fx = path.join(os.tmpdir(), 'ck-tx-fx-' + crypto.randomBytes(4).toString('hex'));
let srv; const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-tx-'));

function wav(name, seconds) {
  fs.mkdirSync(fx, { recursive: true });
  const out = path.join(fx, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-ar', '44100', '-ac', '1', out], { timeout: 20000 });
  return out;
}

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, { form, headers = {} } = {}) {
    const h = { 'X-CK': '1', ...headers }; if (this.cookie) h.cookie = ck(this);
    function ck(c) { return c.cookie; }
    let b; if (form) b = form; else if (body !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + p, { method, headers: h, body: b });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); } post(p, b = {}) { return this.req('POST', p, b); } patch(p, b) { return this.req('PATCH', p, b); } del(p) { return this.req('DELETE', p); }
}
async function user(name) {
  const c = new Client();
  const r = await c.post('/auth/signup', { email: `${name}-${crypto.randomUUID().slice(0, 8)}@test.local`, username: name, name, password: 'pass-' + crypto.randomBytes(8).toString('hex') });
  assert.equal(r.status, 201, JSON.stringify(r.body)); c.me = r.body.user; return c;
}
async function uploadVideo(c, caption = 'clip') {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'v.mp4'); fd.append('caption', caption);
  const r = await c.req('POST', '/videos', undefined, { form: fd }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
async function uploadSound(c, file, title = 'tone') {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('title', title);
  return c.req('POST', '/sounds', undefined, { form: fd });
}

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, RATE_AUTH_MAX: '500', RATE_API_MAX: '5000', MAX_SOUND_SEC: '5', TRANSCODE_POLL_MS: '1000', TRANSCODE_PRESET: 'veryfast' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); fs.rmSync(fx, { recursive: true, force: true }); });


const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: 60000 });
const probeJson = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', f]).toString());
function makeIphoneHdr(name = 'iphone.mov') {
  fs.mkdirSync(fx, { recursive: true });
  const raw = path.join(fx, 'raw-' + name), out = path.join(fx, name);
  // HEVC 10-bit HLG أفقي 640×360 + تدوير 90° (مثل آيفون في الوضع الطولي)
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=60', '-f', 'lavfi', '-i', 'sine=frequency=500', '-t', '2.5', '-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le',
    '-x265-params', 'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', '-tag:v', 'hvc1', '-c:a', 'aac', '-shortest', raw]);
  ff(['-display_rotation', '90', '-i', raw, '-c', 'copy', '-tag:v', 'hvc1', out]);
  return out;
}
function makeWebm(name = 'studio.webm') {
  const out = path.join(fx, name); fs.mkdirSync(fx, { recursive: true });
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=300', '-t', '2', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '300k', '-c:a', 'libopus', '-shortest', out]);
  return out;
}
async function upload(c, file, extra = {}) {
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('caption', extra.caption || 'tx');
  for (const [k, v] of Object.entries(extra)) if (k !== 'caption') fd.append(k, v);
  return c.req('POST', '/videos', undefined, { form: fd });
}
async function waitStatus(c, id, want = ['ready', 'failed'], ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    const r = await c.get('/videos/' + id);
    if (r.body && want.includes(r.body.mediaStatus)) return r.body;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + want + ' got ' + JSON.stringify(r.body?.mediaStatus));
    await new Promise((x) => setTimeout(x, 400));
  }
}
const onDisk = (url) => path.join(upl, rawUrl(url).replace(/^\/uploads\/?/, ''));

test('plan(): safe H.264 MP4 is left alone; HEVC, WebM and H.264-in-MOV are converted', async () => {
  const { analyze, plan } = await import('../src/transcode.js');
  assert.equal(plan(await analyze(SAMPLE), SAMPLE), 'ready');
  const hevc = makeIphoneHdr('plan.mov'); assert.equal(plan(await analyze(hevc), hevc), 'transcode');
  const webm = makeWebm('plan.webm'); assert.equal(plan(await analyze(webm), webm), 'transcode');
  const mov = path.join(fx, 'h264.mov'); ff(['-i', SAMPLE, '-c', 'copy', '-t', '1', mov]);
  assert.equal(plan(await analyze(mov), mov), 'remux');
});

test('iPhone HEVC 10-bit HDR rotated .mov → hidden while processing, then H.264 MP4 portrait, original deleted', async () => {
  const owner = await user('txown' + crypto.randomBytes(2).toString('hex'));
  const other = await user('txoth' + crypto.randomBytes(2).toString('hex'));
  const r = await upload(owner, makeIphoneHdr(), { caption: 'آيفون HDR' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.mediaStatus, 'processing');
  const origUrl = r.body.src; const origPoster = r.body.poster;
  // صاحبه يراه، والآخرون لا يرونه حتى يجهز (قد يكون قد جهز بالفعل لصغر الملف)
  const peek = await other.get('/videos/' + r.body.id);
  if (peek.body && peek.body.mediaStatus === 'processing') assert.fail('processing clip visible to others');
  const done = await waitStatus(owner, r.body.id);
  assert.equal(done.mediaStatus, 'ready');
  assert.match(done.src, /\.mp4$/);
  assert.ok(!fs.existsSync(onDisk(origUrl)), 'original .mov should be deleted');
  const j = probeJson(onDisk(done.src));
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264'); assert.equal(v.pix_fmt, 'yuv420p'); assert.equal(v.profile, 'High');
  assert.equal(v.width, 360); assert.equal(v.height, 640, 'rotation applied → portrait');
  assert.ok(!(v.side_data_list || []).some((d) => d.rotation), 'no leftover rotation');
  assert.equal(a.codec_name, 'aac');
  assert.ok(eval(v.r_frame_rate) <= 30.01, 'fps capped at 30');
  assert.ok(done.poster && done.poster !== origPoster && fs.existsSync(onDisk(done.poster)), 'poster refreshed');
  const { moovFirst } = await import('../src/transcode.js');
  assert.ok(moovFirst(onDisk(done.src)), 'faststart (moov before mdat)');
  const pub = await other.get('/videos?userId=' + owner.me.id);
  assert.ok(pub.body.some((x) => x.id === r.body.id), 'visible to others once ready');
});

test('studio WebM with "save as sound" → converted to MP4 and sound still saved', async () => {
  const u = await user('txweb' + crypto.randomBytes(2).toString('hex'));
  const r = await upload(u, makeWebm(), { saveSound: '1' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.soundId, 'sound extracted');
  const done = await waitStatus(u, r.body.id);
  assert.equal(done.mediaStatus, 'ready'); assert.match(done.src, /\.mp4$/);
  assert.equal(done.soundId, r.body.soundId);
  const so = await u.get('/sounds/' + r.body.soundId); assert.equal(so.status, 200);
});

test('browser-safe H.264 MP4 is ready immediately (no re-encode)', async () => {
  const u = await user('txmp4' + crypto.randomBytes(2).toString('hex'));
  const r = await upload(u, SAMPLE);
  assert.equal(r.status, 201); assert.equal(r.body.mediaStatus, 'ready');
  assert.equal(fs.statSync(onDisk(r.body.src)).size, fs.statSync(SAMPLE).size);
});

test('unconvertible file → failed, original kept and still shown', async () => {
  const u = await user('txbad' + crypto.randomBytes(2).toString('hex'));
  const bad = path.join(fx, 'broken.mp4'); const b = Buffer.alloc(4096, 7); Buffer.from([0, 0, 0, 0x18]).copy(b, 0); Buffer.from('ftypisom').copy(b, 4); fs.writeFileSync(bad, b);
  const r = await upload(u, bad);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const done = await waitStatus(u, r.body.id);
  assert.equal(done.mediaStatus, 'failed');
  assert.ok(fs.existsSync(onDisk(done.src)), 'original kept');
  const anon = new Client();
  assert.ok((await anon.get('/videos?userId=' + u.me.id)).body.some((x) => x.id === r.body.id), 'failed clip still shown');
});

test('pending jobs are picked up without a new upload (resume after restart)', async () => {
  const u = await user('txres' + crypto.randomBytes(2).toString('hex'));
  // نرفع MP4 آمناً ثم نستبدل ملفه بـ WebM ونعلّمه «قيد التحويل» مباشرة في القاعدة (كأن الخادم توقف أثناء المهمة)
  const r = await upload(u, SAMPLE); assert.equal(r.body.mediaStatus, 'ready');
  const webmUrl = rawUrl(r.body.src).replace(/\.mp4$/, '.webm'); fs.copyFileSync(makeWebm('resume.webm'), onDisk(webmUrl)); fs.unlinkSync(onDisk(r.body.src));
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  await cl.query("update videos set video_path = $2, video_url = $2, media_status = 'reprocess' where id = $1", [r.body.id, webmUrl]); await cl.end();
  const done = await waitStatus(u, r.body.id, ['ready', 'failed'], 30000);
  assert.equal(done.mediaStatus, 'ready'); assert.match(done.src, /\.mp4$/);
  assert.ok(!fs.existsSync(onDisk(webmUrl)));
});

// تسجيل كاميرا الاستوديو حتى 3 دقائق: WebM «حي» بلا مدة في الترويسة (مثل MediaRecorder)
function makeLiveWebm(name, sec) {
  const out = path.join(fx, name); fs.mkdirSync(fx, { recursive: true });
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=160x284:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=400', '-t', String(sec), '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '150k', '-c:a', 'libopus', '-b:a', '32k', '-live', '1', '-shortest', out]);
  return out;
}
// نولّد الملفات الطويلة قبل أي طلب HTTP: execFileSync يجمّد حلقة الأحداث فيُعاد استخدام اتصال keep-alive مغلق (EPIPE)
let REC180, REC200;
before(() => { REC180 = makeLiveWebm('rec-180.webm', 180); REC200 = makeLiveWebm('rec-200.webm', 200); });
test('3-minute camera recording (WebM without duration) publishes and converts to a full 180 s MP4', async () => {
  const u = await user('rec180' + crypto.randomBytes(2).toString('hex'));
  const r = await upload(u, REC180, { saveSound: '1' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.mediaStatus, 'processing');
  const done = await waitStatus(u, r.body.id, ['ready', 'failed'], 120000);
  assert.equal(done.mediaStatus, 'ready'); assert.match(done.src, /\.mp4$/);
  const d = Number(probeJson(onDisk(done.src)).format.duration);
  assert.ok(d > 179 && d < 180.8, 'duration ' + d);
  const vs = probeJson(onDisk(done.src)).streams.find((x) => x.codec_type === 'video');
  assert.equal(vs.pix_fmt, 'yuv420p', 'limited (TV) range 4:2:0');
  assert.ok(!vs.sample_aspect_ratio || vs.sample_aspect_ratio === '1:1', 'square pixels: ' + vs.sample_aspect_ratio);
});
test('recording longer than the limit is capped at 180 s during conversion', async () => {
  const u = await user('rec200' + crypto.randomBytes(2).toString('hex'));
  const r = await upload(u, REC200);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const done = await waitStatus(u, r.body.id, ['ready', 'failed'], 120000);
  assert.equal(done.mediaStatus, 'ready');
  const d = Number(probeJson(onDisk(done.src)).format.duration);
  assert.ok(d <= 180.8 && d > 179, 'capped duration ' + d);
});

test('iPhone Safari MediaRecorder file (fragmented MP4, H.264/AAC, .mp4) is accepted and playable', async () => {
  const u = await user('iosrec' + crypto.randomBytes(2).toString('hex'));
  const f = path.join(fx, 'rec-ios.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=600', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', f]);
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(f)], { type: 'video/mp4' }), 'rec-1794490000000.mp4'); fd.append('caption', 'ios');
  const r = await u.req('POST', '/videos', undefined, { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const done = await waitStatus(u, r.body.id);
  assert.equal(done.mediaStatus, 'ready'); assert.match(done.src, /\.mp4$/);
  const v = probeJson(onDisk(done.src)).streams.find((s) => s.codec_type === 'video');
  assert.equal(v.codec_name, 'h264');
});

// ---------- المسار السريع: تعديلات الاستوديو تُطبَّق على الخادم (لا إعادة ترميز في المتصفح) ----------
function makeClip(name, { size = '540x960', seconds = 6 } = {}) {
  const out = path.join(fx, name); fs.mkdirSync(fx, { recursive: true });
  ff(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out]);
  return out;
}
function makeOverlay(name = 'ov.png') {
  const out = path.join(fx, name); fs.mkdirSync(fx, { recursive: true });
  // شفاف بالكامل عدا شريط أبيض معتم (مثل نص الاستوديو)
  ff(['-f', 'lavfi', '-i', "color=c=black:s=540x960,format=rgba,geq=r=255:g=255:b=255:a='if(between(Y\\,700\\,780)*between(X\\,40\\,500)\\,255\\,0)'", '-frames:v', '1', out]);
  return out;
}

test('normalizeEdit(): no real edit → null (original published as is); bad values are clamped', async () => {
  const { normalizeEdit, editedDuration, editDims } = await import('../src/transcode.js');
  assert.equal(normalizeEdit({ start: 0, end: 6, speed: 1, filter: 'none', volOrig: 1 }, 6), null);
  assert.equal(normalizeEdit('not json', 6), null);
  const e = normalizeEdit({ start: -3, end: 99, speed: 7, filter: '"; rm -rf', volOrig: 5 }, 6, { overlay: true });
  assert.deepEqual([e.start, e.end, e.speed, e.filter, e.volOrig], [0, 6, 1, 'none', 1], 'clamped; overlay alone is an edit');
  const t = normalizeEdit({ start: 1, end: 5, speed: 2, filter: 'warm' }, 6);
  assert.equal(editedDuration(t), 2);
  assert.equal(normalizeEdit({ volSound: 1 }, 6, { sound: false }), null, 'sound volume ignored without a real sound');
  assert.deepEqual(editDims({ video: { width: 1920, height: 1080, rotation: -90 } }), { w: 720, h: 1280 }, 'rotated iPhone clip → 720p portrait');
});

test('fast path: original + edit spec + text overlay → published at once as processing, then trimmed/sped/filtered 720p H.264 MP4', async () => {
  const u = await user('txfast' + crypto.randomBytes(2).toString('hex'));
  const clip = makeClip('fast.mp4', { size: '1080x1920', seconds: 6 });
  const t0 = Date.now();
  const r = await upload(u, clip, { edit: JSON.stringify({ start: 1, end: 5, speed: 2, filter: 'warm', volOrig: 1 }), overlay: new Blob([fs.readFileSync(makeOverlay())], { type: 'image/png' }) });
  const uploadMs = Date.now() - t0;
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.mediaStatus, 'processing', 'edited clip is processed in the background');
  assert.ok(uploadMs < 5000, `upload returns quickly without waiting for ffmpeg (${uploadMs} ms)`);
  const cl = new pg.Client({ connectionString: DB }); await cl.connect();
  try {
  const row = (await cl.query('select edit_spec from videos where id = $1', [r.body.id])).rows[0];
  assert.equal(row.edit_spec.filter, 'warm'); assert.match(row.edit_spec.overlay, /overlay-.*\.png$/);
  const ovPath = onDisk(row.edit_spec.overlay); assert.ok(fs.existsSync(ovPath));
  const done = await waitStatus(u, r.body.id);
  assert.equal(done.mediaStatus, 'ready');
  const j = probeJson(onDisk(done.src));
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264'); assert.equal(v.width, 720); assert.equal(v.height, 1280);
  assert.equal(a.codec_name, 'aac');
  assert.ok(Math.abs(Number(j.format.duration) - 2) < 0.25, 'trim 1→5 s at 2× = 2 s, got ' + j.format.duration);
  const { moovFirst } = await import('../src/transcode.js');
  assert.ok(moovFirst(onDisk(done.src)), 'faststart');
  assert.ok(!fs.existsSync(ovPath), 'overlay removed after processing');
  assert.equal((await cl.query('select edit_spec from videos where id = $1', [r.body.id])).rows[0].edit_spec, null);
  // الطبقة دُمجت فعلاً: البكسل في منطقة النص أبيض تقريباً
  const px = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', onDisk(done.src), '-vf', 'crop=2:2:360:1000,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-']);
  assert.ok(px[0] > 200, 'text overlay burned in (luma ' + px[0] + ')');
  const clean = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', onDisk(done.src), '-vf', 'crop=2:2:360:200,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-']);
  assert.ok(clean[0] < 250 || clean[0] !== px[0], 'transparent part of the overlay leaves the picture visible');
  } finally { await cl.end(); }
});

test('fast path: unedited clip with a no-op edit spec is published as is (no re-encode)', async () => {
  const u = await user('txnoop' + crypto.randomBytes(2).toString('hex'));
  const r = await upload(u, makeClip('noop.mp4'), { edit: JSON.stringify({ start: 0, end: 6, speed: 1, filter: 'none', volOrig: 1 }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.mediaStatus, 'ready');
});

test('fast path: library sound is mixed on the server; edited length is what counts for the limit', async () => {
  const u = await user('txsnd' + crypto.randomBytes(2).toString('hex'));
  const s = await uploadSound(u, wav('mix.wav', 3)); assert.equal(s.status, 201, JSON.stringify(s.body));
  const r = await upload(u, makeClip('snd.mp4'), { soundId: s.body.id, edit: JSON.stringify({ start: 0, end: 6, speed: 1, filter: 'gray', volOrig: 0.2, volSound: 1 }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const done = await waitStatus(u, r.body.id);
  assert.equal(done.mediaStatus, 'ready');
  const j = probeJson(onDisk(done.src));
  assert.ok(j.streams.some((x) => x.codec_type === 'audio'));
  assert.ok(Math.abs(Number(j.format.duration) - 6) < 0.25, 'full length kept, sound loops: ' + j.format.duration);
});

test('pre-upload (stage): original uploaded while editing, then published by stageId only; another user cannot use it', async () => {
  const u = await user('txstg' + crypto.randomBytes(2).toString('hex'));
  const other = await user('txst2' + crypto.randomBytes(2).toString('hex'));
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(makeClip('stage.mp4'))]), 'stage.mp4');
  const s = await u.req('POST', '/videos/stage', undefined, { form: fd });
  assert.equal(s.status, 201, JSON.stringify(s.body)); assert.match(s.body.stageId, /^[a-f0-9]{32}$/);
  const staged = fs.readdirSync(path.join(upl, '.stage')); assert.equal(staged.length, 1);
  // ليس في مسار يُخدَم للعامة
  const pub = await fetch(`http://127.0.0.1:${PORT}/uploads/.stage/${staged[0]}`); assert.notEqual(pub.status, 200);
  const steal = new FormData(); steal.append('stageId', s.body.stageId); steal.append('caption', 'x');
  assert.equal((await other.req('POST', '/videos', undefined, { form: steal })).status, 400);
  const pf = new FormData(); pf.append('stageId', s.body.stageId); pf.append('caption', 'staged'); pf.append('edit', JSON.stringify({ start: 0, end: 3, speed: 1, filter: 'cool' }));
  const t0 = Date.now(); const r = await u.req('POST', '/videos', undefined, { form: pf }); const ms = Date.now() - t0;
  assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.mediaStatus, 'processing');
  assert.ok(ms < 3000, 'publish by stageId is instant: ' + ms + ' ms');
  assert.equal(fs.readdirSync(path.join(upl, '.stage')).length, 0, 'staged file consumed');
  const again = await u.req('POST', '/videos', undefined, { form: (() => { const f = new FormData(); f.append('stageId', s.body.stageId); return f; })() });
  assert.equal(again.status, 400); assert.equal(again.body.error, 'staleUpload');
  const done = await waitStatus(u, r.body.id); assert.equal(done.mediaStatus, 'ready');
  const j = probeJson(onDisk(done.src)); assert.ok(Math.abs(Number(j.format.duration) - 3) < 0.25);
  const { sweepStaged } = await import('../src/uploads.js');
  assert.equal(typeof sweepStaged, 'function');
});
