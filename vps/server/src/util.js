import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

export class HttpError extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; Object.assign(this, extra); }
}
export const bad = (code = 'bad', extra) => new HttpError(400, code, extra);

// كلمات المرور: scrypt مع ملح عشوائي (مدمج في Node — بدون مكتبات خارجية)
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const key = await scrypt(pw, salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), 64, { N: Number(n), r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const want = Buffer.from(hash, 'base64');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
// مقارنة ثابتة الزمن لأسرار نصية
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const str = (v, max, { min = 0, trim = true } = {}) => {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad('bad');
  if (trim) v = v.trim();
  if (v.length < min || v.length > max) throw bad('bad');
  return v;
};
export const ms = (d) => (d ? new Date(d).getTime() : 0);
export const tagsOf = (s) => [...String(s || '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]);
export const normTags = (arr, caption) => [...new Set([...(Array.isArray(arr) ? arr : []), ...tagsOf(caption)].map((h) => String(h).replace(/^#/, '').trim()).filter((h) => h && h.length <= 40))].slice(0, 20);
// يسمح فقط بروابط الرفع المحلية الخاصة بنا
export const localUrl = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\/uploads\/images\/[0-9a-f-]{36}\/[\w./-]{1,120}$/i.test(v) || v.includes('..')) throw bad('bad');
  return v;
};
const NORM = (s) => String(s || '').toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const norm = NORM;
