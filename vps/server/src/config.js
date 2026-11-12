// كل الإعدادات من متغيرات البيئة (ملف .env) — لا أسرار داخل الكود.
const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const config = {
  port: num(env.PORT, 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://clipkat:clipkat@localhost:5432/clipkat',
  jwtSecret: env.JWT_SECRET || '',
  cookieSecure: env.COOKIE_SECURE === '1' || env.COOKIE_SECURE === 'true',
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  webDir: env.WEB_DIR || new URL('../../web', import.meta.url).pathname,
  schemaFile: env.SCHEMA_FILE || new URL('../../db/schema.sql', import.meta.url).pathname,
  uploadDir: env.UPLOAD_DIR || '/data/uploads',
  maxVideoMb: num(env.MAX_VIDEO_MB, 500),
  uploadTimeoutMs: num(env.UPLOAD_TIMEOUT_SEC, 1800) * 1000,
  maxImageMb: num(env.MAX_IMAGE_MB, 5),
  maxSoundMb: num(env.MAX_SOUND_MB, 8),
  maxSoundSec: num(env.MAX_SOUND_SEC, 60),
  maxVideoSec: num(env.MAX_VIDEO_SEC, 180),
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '',
  webhookSecret: env.WEBHOOK_SECRET || '',
  rateAuthMax: num(env.RATE_AUTH_MAX, 20),
  rateApiMax: num(env.RATE_API_MAX, 600),
  sessionDays: 30,
  googleClientId: (env.GOOGLE_CLIENT_ID || '').trim()
};
