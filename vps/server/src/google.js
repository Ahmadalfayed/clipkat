// © 2026 وطن النهار — التحقق من رمز هوية Google (ID token) في الخادم فقط
import { pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { HttpError, bad } from './util.js';

const UNUSABLE = 'google$unusable';
export const unusablePasswordHash = () => UNUSABLE;

async function verifyWithGoogle(credential) {
  const client = new OAuth2Client(config.googleClientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  return ticket.getPayload() || {};
}

// خطاف الاختبار فقط: يُقبل إذا كان معرّف العميل يبدأ بـ test- (لا يُستخدم في الإنتاج)
async function verifyWithTestHook(credential) {
  const spec = process.env.CLIPKAT_GOOGLE_VERIFY_MODULE;
  const href = spec.startsWith('file:') ? spec : pathToFileURL(spec).href;
  const m = await import(href);
  return m.verifyGoogleIdToken(credential);
}

export async function verifyGoogleIdToken(credential) {
  if (!config.googleClientId) throw new HttpError(503, 'googleDisabled');
  if (typeof credential !== 'string' || !credential.trim()) throw bad('bad');
  if (credential.length > 8192) throw bad('bad');
  let payload;
  try {
    const useHook = process.env.CLIPKAT_GOOGLE_VERIFY_MODULE && config.googleClientId.startsWith('test-');
    payload = useHook ? await verifyWithTestHook(credential) : await verifyWithGoogle(credential);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'badGoogle');
  }
  const email = String(payload?.email || '').trim().toLowerCase();
  const sub = String(payload?.sub || '').trim();
  const verified = payload?.email_verified === true || payload?.email_verified === 'true';
  if (!email || !sub || !verified) throw new HttpError(401, 'badGoogle');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new HttpError(401, 'badGoogle');
  const name = String(payload?.name || '').trim().slice(0, 40);
  return { sub, email, name };
}

function cleanUsernamePart(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '')
    .replace(/^[._]+|[._]+$/g, '');
}

export function baseUsernameFromGoogle({ email, name }) {
  const local = String(email || '').split('@')[0].split('+')[0];
  let base = cleanUsernamePart(local) || cleanUsernamePart(name) || 'user';
  if (base.length < 3) base = (base + 'user').slice(0, 24);
  return base.slice(0, 24);
}

export async function uniqueUsername(q, base) {
  let candidate = String(base || 'user').toLowerCase();
  if (!/^[a-z0-9._]{3,24}$/.test(candidate)) candidate = 'user';
  for (let i = 0; i < 40; i++) {
    const suffix = i === 0 ? '' : String(i);
    const name = (candidate.slice(0, 24 - suffix.length) + suffix);
    if (!/^[a-z0-9._]{3,24}$/.test(name)) continue;
    if (!(await q('select 1 from profiles where username = $1', [name])).rowCount) return name;
  }
  return ('u' + Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/g, '').slice(0, 24).padEnd(3, 'u');
}
