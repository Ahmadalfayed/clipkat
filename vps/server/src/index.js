import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, waitForDb, migrate, pool } from './db.js';
import { buildRouter } from './routes.js';
import { csrfGuard } from './auth.js';
import { ensureDirs } from './uploads.js';
import { servePlayback } from './media-auth.js';
import { hashPassword, HttpError } from './util.js';
import { startPublisher } from './publisher.js';
import { startTranscoder } from './transcode.js';
import { startRtc } from './rtc.js';
import { startPromoSweeper } from './promote.js';
import { startPushSweeper } from './push.js';

if (!config.jwtSecret || config.jwtSecret.length < 32) { console.error('JWT_SECRET missing or too short (>=32 chars). Run install.sh or set it in .env'); process.exit(1); }

// مصادر LiveKit المسموح الاتصال بها من المتصفح (wss للإشارة و https لفحص الاتصال)
function rtcOrigins() { try { const u = new URL(config.livekitUrl); const host = u.host; return [`wss://${host}`, `https://${host}`, ...(u.protocol === 'ws:' ? [`ws://${host}`, `http://${host}`] : [])]; } catch { return []; } }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);       // خلف Caddy
// نطاقات Google AdSense (بالإضافة إلى تسجيل الدخول بـ Google و LiveKit)
const adsenseOrigins = [
  'https://pagead2.googlesyndication.com',
  'https://googleads.g.doubleclick.net',
  'https://tpc.googlesyndication.com',
  'https://*.google.com',
  'https://*.gstatic.com',
  'https://adservice.google.com',
  'https://fundingchoicesmessages.google.com',
  'https://*.adtrafficquality.google',  // نطاقات قياس إعلانات جوجل (ليست تحت .google.com)
  'https://*.googleadservices.com',
  'https://*.googlesyndication.com',
];
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://accounts.google.com/gsi/client', ...adsenseOrigins],   // wasm-unsafe-eval: فصل الخلفية (MediaPipe WebAssembly) فقط — لا يسمح بـ eval لجافاسكربت
    styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://www.gstatic.com', 'https://*.googleusercontent.com', ...adsenseOrigins],
    mediaSrc: ["'self'", 'blob:'], fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://accounts.google.com/gsi/', ...rtcOrigins(), ...adsenseOrigins],
    frameSrc: ['https://accounts.google.com/gsi/', ...adsenseOrigins],
    objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } },
  hsts: config.cookieSecure ? { maxAge: 15552000 } : false,   // HSTS فقط عند HTTPS
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }  // GIS يحتاج أن يرى الأصل عند طلب الزر
}));
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use('/api', express.json({ limit: '100kb' }), csrfGuard, buildRouter());
// /uploads العام: الصور المصغّرة والصور الشخصية والأصوات فقط.
// ملفات الفيديو (والأصول قبل التحويل) ونسخ التنزيل (.dlcache) لا تُخدم من هنا إطلاقاً — التشغيل عبر /vs/<رابط موقّع> والتنزيل عبر /api/dl/<رمز>.
// نطبّع المسار أولاً حتى لا تتجاوزه صيغ مثل //videos أو /./videos أو %2e
app.use('/uploads', (req, res, next) => {
  let p; try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
  const first = (path.posix.normalize('/' + p.replace(/\\/g, '/')).split('/').filter(Boolean)[0] || '').toLowerCase();
  if (first === 'videos' || first.startsWith('.') || first === '_tmp') return res.status(404).type('text/plain').send('not found');
  next();
});
app.get('/vs/:p/:s', servePlayback);
app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'deny', maxAge: '7d', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
const legalPage = (file) => (_req, res) => res.sendFile(path.join(config.webDir, file), { maxAge: '5m' });
app.get(['/privacy', '/privacy.html'], legalPage('privacy.html'));
app.get(['/terms', '/terms.html'], legalPage('terms.html'));
// عامل الخدمة (إشعارات الهاتف): بدون تخزين مؤقت حتى تصل تحديثاته فوراً
app.get('/sw.js', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.sendFile(path.join(config.webDir, 'sw.js')); });
app.use(express.static(config.webDir, { index: 'index.html', maxAge: '5m' }));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'notfound')));
app.use((err, _req, res, _next) => {
  res.locals.errCode = err instanceof HttpError ? err.code : err?.type === 'entity.too.large' ? 'tooLarge' : err?.type === 'entity.parse.failed' ? 'bad' : 'server';
  if (err instanceof HttpError && /^[a-zA-Z]{1,20}$/.test(err.field || '')) res.locals.errField = err.field;
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...(err.limit ? { limit: err.limit } : {}), ...(res.locals.errField ? { field: res.locals.errField } : {}) });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'tooLarge' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad' });
  console.error('[error]', err);
  res.status(500).json({ error: 'server' });
});

async function ensureAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const ex = (await q('select id from profiles where lower(email) = $1', [config.adminEmail])).rows[0];
  if (ex) { await q('update profiles set is_admin = true where id = $1', [ex.id]); return; }      // لا نغيّر كلمة مرور موجودة
  let username = 'admin'; if ((await q('select 1 from profiles where username = $1', [username])).rowCount) username = 'admin' + crypto.randomInt(1000, 9999);
  await q('insert into profiles (email, password_hash, username, name, is_admin) values ($1,$2,$3,$4,true)', [config.adminEmail, await hashPassword(config.adminPassword), username, 'المشرف']);
  console.log('[ClipKat] admin account created for', config.adminEmail);
}

async function main() {
  ensureDirs();
  if (!fs.existsSync(config.webDir)) console.warn('web dir not found:', config.webDir);
  await waitForDb(); await migrate(); await ensureAdmin();
  const srv = app.listen(config.port, () => console.log(`[ClipKat] listening on :${config.port}`));
  // رفع المقاطع من الجوال على شبكة بطيئة قد يتجاوز 5 دقائق (الافتراضي في Node) — نسمح حتى 30 دقيقة
  srv.requestTimeout = config.uploadTimeoutMs; srv.headersTimeout = 65000;
  startPublisher();
  startPromoSweeper();
  startPushSweeper();
  if (config.transcode) startTranscoder(config.transcodePollMs);
  startRtc();
  const stop = () => { srv.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
