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
  transcode: env.TRANSCODE !== '0',
  transcodePreset: /^(ultrafast|superfast|veryfast|faster|fast|medium)$/.test(env.TRANSCODE_PRESET || '') ? env.TRANSCODE_PRESET : 'veryfast',
  transcodeCrf: Math.min(35, num(env.TRANSCODE_CRF, 23)),
  transcodeThreads: num(env.TRANSCODE_THREADS, 2),
  transcodePollMs: num(env.TRANSCODE_POLL_MS, 30000),
  transcodeNice: env.TRANSCODE_NICE !== '0',
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
  googleClientId: (env.GOOGLE_CLIENT_ID || '').trim(),
  // البث المباشر والمكالمات (LiveKit) — تُعطَّل الميزتان تلقائياً إن لم تُضبط المفاتيح
  livekitUrl: (env.LIVEKIT_URL || '').trim(),                 // العنوان العام للمتصفح: wss://live.example.com
  livekitApiUrl: (env.LIVEKIT_API_URL || env.LIVEKIT_URL || '').trim().replace(/^ws/, 'http'),   // داخلي للخادم
  livekitKey: (env.LIVEKIT_API_KEY || '').trim(),
  livekitSecret: (env.LIVEKIT_API_SECRET || '').trim(),
  turnTlsPort: num(env.TURN_TLS_PORT, 5349),                 // منفذ TURN/TLS الفعلي (LiveKit يعلن 443 دائماً)
  liveMaxViewers: num(env.LIVE_MAX_VIEWERS, 200),
  callRingSec: num(env.CALL_RING_SEC, 35),
  liveHostGraceSec: num(env.LIVE_HOST_GRACE_SEC, 45),
  rtcReapMs: num(env.RTC_REAP_MS, 10000)
};
