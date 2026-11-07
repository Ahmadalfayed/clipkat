import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';
import { HttpError } from './util.js';

const COOKIE = 'ck_token';
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim()).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, tv: user.token_version }, config.jwtSecret, { algorithm: 'HS256', expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, maxAge: config.sessionDays * 86400000, path: '/' });
}
export const clearSession = (res) => res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.cookieSecure });

// يحمّل المستخدم الحالي (إن وُجد) من الكوكي — يتحقق من التوقيع ومن token_version ومن الحظر
export async function loadUser(req, _res, next) {
  req.user = null;
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      const { rows } = await q('select id, username, is_admin, is_banned, token_version from profiles where id = $1', [p.sub]);
      const u = rows[0];
      if (u && !u.is_banned && u.token_version === p.tv) req.user = u;
    }
  } catch { /* توكن غير صالح = زائر */ }
  next();
}
export const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'auth')));
export const requireAdmin = (req, _res, next) => (!req.user ? next(new HttpError(401, 'auth')) : req.user.is_admin ? next() : next(new HttpError(403, 'forbidden')));

// حماية CSRF: كل طلب يغيّر بيانات يجب أن يحمل ترويسة مخصصة (تمنع الطلبات من مواقع أخرى)
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/payment-webhook')) return next();
  return req.get('x-ck') === '1' ? next() : next(new HttpError(403, 'csrf'));
}
