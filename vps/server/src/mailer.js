// © 2026 وطن النهار — إرسال البريد (رسائل النظام فقط، مثل استعادة كلمة المرور)
// ثلاث طرق، بالترتيب:
//   1) SMTP_HOST مضبوط  → إرسال عبر خادم SMTP خارجي (SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE)
//   2) MAIL_DIRECT=1     → إرسال مباشر من الخادم إلى خادم بريد المستلم (MX) على المنفذ 25،
//                          موقّع بـ DKIM (DKIM_SELECTOR + DKIM_KEY_FILE) — يحتاج سجلات SPF/DKIM/DMARC في DNS
//   3) MAIL_OUTBOX_DIR   → للاختبارات فقط: تُكتب الرسالة ملف JSON بدل إرسالها
// إن لم يُضبط شيء: البريد معطّل (تُسجَّل ملاحظة ولا يُرسل شيء).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';

const env = process.env;
const bool = (v) => v === '1' || v === 'true';

export function mailConfig() {
  const from = (env.MAIL_FROM || env.SMTP_FROM || '').trim();
  const domain = (env.DKIM_DOMAIN || from.split('@')[1] || '').trim().toLowerCase();
  return {
    from,
    fromName: (env.MAIL_FROM_NAME || 'كليب كات').trim(),
    smtpHost: (env.SMTP_HOST || '').trim(),
    smtpPort: Number(env.SMTP_PORT) || 587,
    smtpUser: (env.SMTP_USER || '').trim(),
    smtpPass: env.SMTP_PASS || '',
    smtpSecure: bool(env.SMTP_SECURE) || Number(env.SMTP_PORT) === 465,
    direct: bool(env.MAIL_DIRECT),
    helo: (env.MAIL_HELO || (domain ? `mail.${domain}` : '')).trim(),
    dkimDomain: domain,
    dkimSelector: (env.DKIM_SELECTOR || '').trim(),
    dkimKeyFile: (env.DKIM_KEY_FILE || '').trim(),
    outbox: (env.MAIL_OUTBOX_DIR || '').trim()
  };
}

export function mailMode(c = mailConfig()) {
  if (!c.from) return 'off';
  if (c.outbox) return 'outbox';
  if (c.smtpHost) return 'smtp';
  if (c.direct) return 'direct';
  return 'off';
}
export const mailEnabled = () => mailMode() !== 'off';

let dkimCache;
function dkimOpts(c) {
  if (!c.dkimSelector || !c.dkimKeyFile || !c.dkimDomain) return undefined;
  if (dkimCache === undefined) {
    try { dkimCache = { domainName: c.dkimDomain, keySelector: c.dkimSelector, privateKey: fs.readFileSync(c.dkimKeyFile, 'utf8') }; }
    catch (e) { console.warn('[mail] DKIM key not readable:', e.code || e.message); dkimCache = null; }
  }
  return dkimCache || undefined;
}

// يُخفي البريد في السجلات: ab***@gmail.com
export const maskEmail = (e) => String(e).replace(/^(.{0,2})[^@]*(@.*)$/, '$1***$2');

async function mxHosts(domain) {
  let mx = [];
  try { mx = (await dns.resolveMx(domain)).filter((r) => r.exchange && r.exchange !== '.').sort((a, b) => a.priority - b.priority).map((r) => r.exchange); }
  catch (e) { if (!['ENODATA', 'ENOTFOUND'].includes(e.code)) throw e; }
  return mx.length ? mx : [domain];   // بدون MX: نستخدم سجل A للنطاق (implicit MX)
}

async function sendDirect(c, msg) {
  const domain = String(msg.to).split('@')[1];
  if (!domain) throw new Error('bad recipient');
  let lastErr;
  for (const host of (await mxHosts(domain)).slice(0, 4)) {
    let ips = [];
    try { ips = await dns.resolve4(host); } catch (e) { lastErr = e; continue; }   // IPv4 فقط: يطابق SPF وسجل PTR
    for (const ip of ips.slice(0, 2)) {
      const t = nodemailer.createTransport({
        host: ip, port: 25, secure: false, name: c.helo || undefined,
        tls: { servername: host, rejectUnauthorized: false, minVersion: 'TLSv1.2' },   // STARTTLS إن توفر (لا يتحقق من الشهادة مثل خوادم البريد عادة)
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
        dkim: dkimOpts(c)
      });
      try { const info = await t.sendMail(msg); t.close(); return { ...info, via: host }; }
      catch (e) {
        t.close(); lastErr = e;
        if (e.responseCode >= 500 && e.responseCode < 600) throw e;   // رفض دائم — لا فائدة من المحاولة مع خادم آخر
      }
    }
  }
  throw lastErr || new Error('no mx reachable');
}

let smtpTransport;
export async function sendMail({ to, subject, text, html, fromName, replyTo, attachments, headers }) {
  const c = mailConfig();
  const mode = mailMode(c);
  if (mode === 'off') { console.warn('[mail] disabled (set MAIL_FROM + SMTP_HOST or MAIL_DIRECT=1) — not sent to', maskEmail(to)); return { sent: false, mode }; }
  const msg = {
    from: { name: fromName || c.fromName, address: c.from }, to, subject, text, html,
    envelope: { from: c.from, to },
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All', ...(headers || {}) }
  };
  if (replyTo) msg.replyTo = replyTo;
  if (attachments?.length) msg.attachments = attachments;
  if (mode === 'outbox') {
    fs.mkdirSync(c.outbox, { recursive: true });
    const f = path.join(c.outbox, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
    fs.writeFileSync(f, JSON.stringify({ to, from: c.from, fromName: msg.from.name, replyTo: replyTo || null, subject, text, html, headers: msg.headers, attachments: (attachments || []).map((a) => ({ filename: a.filename, size: a.content?.length || 0, contentType: a.contentType })) }));
    return { sent: true, mode };
  }
  if (mode === 'smtp') {
    smtpTransport ||= nodemailer.createTransport({
      host: c.smtpHost, port: c.smtpPort, secure: c.smtpSecure, requireTLS: !c.smtpSecure,
      auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, dkim: dkimOpts(c)
    });
    const info = await smtpTransport.sendMail(msg);
    return { sent: true, mode, id: info.messageId, response: info.response };
  }
  const info = await sendDirect(c, msg);
  return { sent: true, mode, id: info.messageId, via: info.via, response: info.response };
}
