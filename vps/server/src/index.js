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
import { hashPassword, HttpError } from './util.js';
import { startPublisher } from './publisher.js';

if (!config.jwtSecret || config.jwtSecret.length < 32) { console.error('JWT_SECRET missing or too short (>=32 chars). Run install.sh or set it in .env'); process.exit(1); }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);       // خلف Caddy
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://accounts.google.com'], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://www.gstatic.com'],
    mediaSrc: ["'self'", 'blob:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'", 'https://accounts.google.com'],
    frameSrc: ['https://accounts.google.com'], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } },
  hsts: config.cookieSecure ? { maxAge: 15552000 } : false,   // HSTS فقط عند HTTPS
  crossOriginEmbedderPolicy: false
}));
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use('/api', express.json({ limit: '100kb' }), csrfGuard, buildRouter());
app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'deny', maxAge: '7d', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
const legalPage = (file) => (_req, res) => res.sendFile(path.join(config.webDir, file), { maxAge: '5m' });
app.get(['/privacy', '/privacy.html'], legalPage('privacy.html'));
app.get(['/terms', '/terms.html'], legalPage('terms.html'));
app.use(express.static(config.webDir, { index: 'index.html', maxAge: '5m' }));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'notfound')));
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...(err.limit ? { limit: err.limit } : {}) });
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
  startPublisher();
  const stop = () => { srv.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
