// © 2026 وطن النهار — خلفيات الاستوديو: ملفات MediaPipe المستضافة ذاتياً، صور القوالب وتراخيصها، وسياسة CSP المطلوبة لـ WebAssembly فقط
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
const PORT = 41000 + crypto.randomInt(0, 400);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.join(here, '../../web');
const upl = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-bgtest-'));
let srv;

const ids = () => [...fs.readFileSync(path.join(web, 'js/bg-replace.js'), 'utf8').matchAll(/\{ id: '([a-z]+)', ar: '([^']+)'/g)].map((m) => ({ id: m[1], ar: m[2] }));

before(async () => {
  const cl = new pg.Client({ connectionString: DB }); await cl.connect(); await cl.query('drop schema public cascade; create schema public;'); await cl.end();
  srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: crypto.randomBytes(32).toString('hex'), UPLOAD_DIR: upl, RATE_API_MAX: '5000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('server start timeout')), 30000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('server exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(upl, { recursive: true, force: true }); });

test('CSP allows WebAssembly compilation only (wasm-unsafe-eval), never JS eval or inline scripts', async () => {
  const csp = (await fetch(ORIGIN + '/')).headers.get('content-security-policy') || '';
  const script = (csp.match(/script-src([^;]*)/) || [])[1] || '';
  assert.match(script, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(script, /'unsafe-eval'/);
  assert.doesNotMatch(script, /'unsafe-inline'/);
  assert.match(script, /'self'/);
});

test('MediaPipe runtime and model are self-hosted with correct types', async () => {
  const js = await fetch(ORIGIN + '/vendor/mediapipe/vision_bundle.mjs');
  assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(await js.text(), /ImageSegmenter/);
  const wasm = await fetch(ORIGIN + '/vendor/mediapipe/wasm/vision_wasm_internal.wasm', { method: 'HEAD' });
  assert.equal(wasm.status, 200); assert.match(wasm.headers.get('content-type'), /application\/wasm/);
  const loader = await fetch(ORIGIN + '/vendor/mediapipe/wasm/vision_wasm_internal.js', { method: 'HEAD' });
  assert.equal(loader.status, 200); assert.match(loader.headers.get('content-type'), /javascript/);
  const model = await fetch(ORIGIN + '/vendor/mediapipe/selfie_segmenter.tflite');
  assert.equal(model.status, 200); assert.ok((await model.arrayBuffer()).byteLength > 100000);
  const lic = fs.readFileSync(path.join(web, 'vendor/mediapipe/LICENSE-2.0.txt'), 'utf8');
  assert.match(lic, /Apache License\s+Version 2\.0/);
  // لا روابط لخدمات خارجية في وحدة الخلفيات
  assert.doesNotMatch(fs.readFileSync(path.join(web, 'js/bg-replace.js'), 'utf8'), /https?:\/\//);
});

test('8 templates, each with an optimised webp, a thumbnail, and a credits entry', async () => {
  const list = ids();
  assert.equal(list.length, 8);
  for (const n of ['الرياض', 'نيويورك', 'برج إيفل', 'جبل إيفرست', 'الربع الخالي', 'برج خليفة', 'سهرة مع البدو في سيناء']) assert.ok(list.some((x) => x.ar === n), n);
  const credits = fs.readFileSync(path.join(web, 'media/bg/CREDITS.md'), 'utf8');
  for (const { id } of list) {
    for (const f of [`${id}.webp`, `${id}-thumb.webp`]) {
      const r = await fetch(`${ORIGIN}/media/bg/${f}`);
      assert.equal(r.status, 200, f); assert.match(r.headers.get('content-type'), /image\/webp/);
      const buf = Buffer.from(await r.arrayBuffer());
      assert.equal(buf.subarray(0, 4).toString(), 'RIFF'); assert.equal(buf.subarray(8, 12).toString(), 'WEBP');
      assert.ok(buf.length < 250 * 1024, `${f} should be optimised`);
    }
    assert.ok(credits.includes(`${id}.webp`), `credits for ${id}`);
  }
});

test('studio: duet editor text layer no longer crashes (null guard) and the picker is wired', () => {
  const src = fs.readFileSync(path.join(web, 'js/views/studio.js'), 'utf8');
  assert.match(src, /const layer = \$\('#textLayer', el\); if \(!layer\) return;/);
  assert.match(src, /\$\('#textLayer', el\)\?\.addEventListener/);
  assert.match(src, /data-bg=""/);
  assert.match(src, /bgEngine\.stream\(30\)/);
});
