// © 2026 وطن النهار — روابط تشغيل موقّعة قصيرة العمر لملفات الفيديو.
// ملفات uploads/videos لم تعد تُخدم من /uploads العام؛ كل مقطع يُعرض عبر /vs/<payload>/<sig>.<ext>
//  • payload = base64url(JSON { p: '<userId>/<file>', e: انتهاء الصلاحية بالثواني })  — موقّع بـ HMAC-SHA256 بمفتاح مشتق من JWT_SECRET
//  • الصلاحية بين ساعة وساعتين، ومقرّبة لحدود الساعة → الرابط ثابت خلال الساعة فيستفيد المتصفح من التخزين المؤقت
//  • يدعم طلبات Range (206) للتقديم/الترجيع وسفاري iOS، ونوع المحتوى الصحيح، Cache-Control: private، Content-Disposition: inline
//  • Cross-Origin-Resource-Policy: same-origin → لا يمكن تضمين الرابط في مواقع أخرى (منع الربط الخارجي)
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

const HOUR = 3600;
const key = () => crypto.createHmac('sha256', String(config.jwtSecret)).update('clipkat-video-play-v1').digest();
const sig = (payload) => crypto.createHmac('sha256', key()).update(payload).digest('base64url');
const REL_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,120}$/i;
const PREFIX = '/uploads/videos/';

// رابط تشغيل موقّع لمسار ملف داخل uploads/videos؛ أي رابط آخر (مثل /media/videos للأمثلة) يُعاد كما هو
export function playUrl(url, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) return url;
  const rel = url.slice(PREFIX.length);
  if (!REL_RE.test(rel) || rel.includes('..')) return url;
  const e = (Math.floor(nowSec / HOUR) + 2) * HOUR;          // ينتهي بعد 1–2 ساعة
  const payload = Buffer.from(JSON.stringify({ p: rel, e })).toString('base64url');
  const ext = path.extname(rel).toLowerCase() || '.mp4';
  return `/vs/${payload}/${sig(payload)}${ext}`;
}

export function verifyPlay(payload, s, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof payload !== 'string' || typeof s !== 'string' || payload.length > 400) return { error: 404 };
  const want = Buffer.from(sig(payload)); const got = Buffer.from(s.replace(/\.[a-z0-9]{2,5}$/i, ''));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { error: 403 };
  let j; try { j = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return { error: 403 }; }
  if (!j || typeof j.p !== 'string' || !REL_RE.test(j.p) || j.p.includes('..') || !(j.e > nowSec)) return { error: 403 };
  return { rel: j.p, exp: j.e };
}

export function servePlayback(req, res) {
  const v = verifyPlay(req.params.p, req.params.s);
  if (v.error) return res.status(v.error).type('text/plain').send(v.error === 403 ? 'link expired or invalid' : 'not found');
  const file = path.join(config.uploadDir, 'videos', v.rel);
  if (!file.startsWith(path.join(config.uploadDir, 'videos') + path.sep) || !fs.existsSync(file)) return res.status(404).type('text/plain').send('not found');
  const maxAge = Math.max(0, Math.min(HOUR, v.exp - Math.floor(Date.now() / 1000) - 60));
  res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(file, { acceptRanges: true, lastModified: true, etag: true, dotfiles: 'deny', cacheControl: false }, (err) => { if (err && !res.headersSent) res.status(err.status || 404).end(); });
}
