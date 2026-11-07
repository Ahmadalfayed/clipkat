import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './util.js';

export const dirs = { tmp: path.join(config.uploadDir, '_tmp'), videos: path.join(config.uploadDir, 'videos'), images: path.join(config.uploadDir, 'images') };
export function ensureDirs() { for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true }); }

const storage = multer.diskStorage({ destination: (_r, _f, cb) => cb(null, dirs.tmp), filename: (_r, _f, cb) => cb(null, crypto.randomBytes(16).toString('hex')) });
const wrap = (mw) => (req, res, next) => mw(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'tooLarge', { limit: req._limitMb }));
  return next(new HttpError(400, 'bad'));
});
export const imageUpload = wrap((req, res, next) => { req._limitMb = config.maxImageMb; multer({ storage, limits: { fileSize: config.maxImageMb * 1048576, files: 1, fields: 4 } }).single('file')(req, res, next); });
export const videoUpload = wrap((req, res, next) => {
  req._limitMb = config.maxVideoMb;
  multer({ storage, limits: { fileSize: config.maxVideoMb * 1048576, files: 2, fields: 12 } }).fields([{ name: 'file', maxCount: 1 }, { name: 'poster', maxCount: 1 }])(req, res, next);
});

// التحقق من نوع الملف الحقيقي (من أول بايتات) — لا نثق باسم الملف ولا بـ Content-Type
function head(file, n = 16) { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b; }
export function sniffImage(file) {
  const b = head(file);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
export function sniffVideo(file) {
  const b = head(file);
  if (b.subarray(4, 8).toString() === 'ftyp') return b.subarray(8, 12).toString() === 'qt  ' ? 'mov' : 'mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return null;
}
export const rm = (f) => { try { fs.unlinkSync(f); } catch {} };
export function place(tmpFile, kind, uid, name) {
  const dir = path.join(dirs[kind], uid); fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(tmpFile, path.join(dir, name));
  return `/uploads/${kind}/${uid}/${name}`;
}
export const rid = () => crypto.randomBytes(8).toString('hex');

// صورة مصغّرة من الفيديو عبر ffmpeg (اختياري: إن لم يوجد ffmpeg نتجاهل بهدوء)
export function makePoster(videoFile, outFile) {
  const tryAt = (ss) => new Promise((resolve) => execFile('ffmpeg', ['-y', '-v', 'error', '-ss', ss, '-i', videoFile, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', outFile], { timeout: 20000 }, (err) => resolve(!err && fs.existsSync(outFile) && fs.statSync(outFile).size > 0)));
  return tryAt('1').then((ok) => ok || tryAt('0'));
}
