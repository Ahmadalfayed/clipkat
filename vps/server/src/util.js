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
// رابط التواصل للمتجر: يقبل الصيغ الشائعة ويحوّلها لرابط https آمن
// رقم/واتساب → https://wa.me/<أرقام> · ‎@حساب أو instagram.com/x → https://instagram.com/x · نطاق بدون https → https://
// النتيجة دائماً http/https فقط (لا javascript: ولا data:) — وإلا يُرمى الخطأ 'bad' مع field=contact
export function normContact(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw bad('bad', { field: 'contact' });
  let s = v.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (!s) return null;
  const fail = () => { throw bad('bad', { field: 'contact' }); };
  if (s.length > 300) fail();
  let url;
  const digits = s.replace(/[\s\-().]/g, '');
  if (/^\+?\d{7,15}$/.test(digits)) {
    let n = digits.replace(/^\+/, '').replace(/^00/, '');
    if (n.length === 8) n = '965' + n;                      // رقم كويتي محلي بدون رمز الدولة
    if (n.length < 8 || n.length > 15) fail();
    url = 'https://wa.me/' + n;
  } else if (/^@[A-Za-z0-9._]{1,30}$/.test(s)) url = 'https://instagram.com/' + s.slice(1);
  else if (/^https?:\/\//i.test(s)) url = s;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(s)) fail();   // أي بروتوكول آخر مرفوض
  else if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/?#]\S*)?$/i.test(s)) url = 'https://' + s;
  else fail();
  let u; try { u = new URL(url); } catch { fail(); }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password || /\s/.test(url)) fail();
  const out = u.href;
  if (out.length > 300 || !/^https?:\/\//i.test(out)) fail();
  return out;
}
const NORM = (s) => String(s || '').toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const norm = NORM;
