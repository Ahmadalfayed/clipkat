// © 2026 وطن النهار — استقبال البريد لعناوين كليب كات (مثل support@clipkat.live) وتحويله إلى بريد صاحب الموقع
// خادم SMTP صغير على المنفذ 25 — للاستقبال فقط:
//   • يقبل فقط العناوين المذكورة في MX_ROUTES (مثال: support@clipkat.live=owner@gmail.com) — ليس «مُرحِّلاً مفتوحاً»
//   • لا تسجيل دخول (AUTH معطّل) فلا يمكن استخدامه للإرسال إلى أي عنوان آخر
//   • حد للحجم (MX_MAX_MB) وللرسائل لكل IP في الساعة (MX_RATE_PER_HOUR) وللاتصالات المتزامنة
//   • يرفض الرسائل المزوّرة التي يطلب نطاقها رفضها (DMARC p=reject)
//   • التحويل: رسالة جديدة من no-reply@النطاق موقّعة DKIM، «الرد» يذهب للمرسل الأصلي (Reply-To) — أفضل لتسليم Gmail
//   • لا تخزين: التحويل يتم أثناء الاتصال؛ إن تعذّر مؤقتاً نرد 451 فيعيد المرسل المحاولة لاحقاً
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { sendMail, maskEmail, mailConfig } from './mailer.js';

const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
export function parseRoutes(s) {
  const m = new Map();
  for (const part of String(s || '').split(/[,;\s]+/).filter(Boolean)) {
    const [from, to] = part.split('=').map((x) => (x || '').trim().toLowerCase());
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) m.set(from, to);
  }
  return m;
}
const ROUTES = parseRoutes(env.MX_ROUTES);
const PORT = num(env.MX_PORT, 25);
const HOST = (env.MX_HOSTNAME || env.MAIL_HELO || 'localhost').trim();
const MAX_BYTES = num(env.MX_MAX_MB, 15) * 1024 * 1024;
const RATE = num(env.MX_RATE_PER_HOUR, 30);
const PER_IP_CONN = num(env.MX_MAX_CONN_PER_IP, 5);
const AUTH_CHECK = env.MX_AUTH_CHECK !== '0';
const OWN_FROM = (mailConfig().from || '').toLowerCase();

const hits = new Map();   // ip → [timestamps]
const conns = new Map();  // ip → active connections
const overRate = (ip) => { const now = Date.now(); const a = (hits.get(ip) || []).filter((t) => now - t < 3600e3); hits.set(ip, a); return a.length >= RATE; };
const hit = (ip) => { const a = hits.get(ip) || []; a.push(Date.now()); hits.set(ip, a); };
setInterval(() => { const now = Date.now(); for (const [ip, a] of hits) { const b = a.filter((t) => now - t < 3600e3); b.length ? hits.set(ip, b) : hits.delete(ip); } }, 600e3).unref();
const smtpErr = (code, msg) => Object.assign(new Error(msg), { responseCode: code });
const clip = (s, n = 200) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, n);

async function readAll(stream) { const chunks = []; for await (const c of stream) chunks.push(c); return Buffer.concat(chunks); }

async function checkAuth(raw, session) {
  if (!AUTH_CHECK) return null;
  try {
    const { authenticate } = await import('mailauth');
    const r = await authenticate(raw, { ip: session.remoteAddress.replace(/^::ffff:/, ''), helo: session.hostNameAppearsAs, sender: session.envelope.mailFrom?.address || '', mta: HOST, disableArc: true, disableBimi: true });
    return r;
  } catch (e) { console.warn('[mx] auth check skipped:', clip(e.message)); return null; }
}

function forwardMail(parsed, raw, rcpt, dest, session, auth) {
  const f = parsed.from?.value?.[0] || {};
  const addr = (f.address || session.envelope.mailFrom?.address || '').trim();
  const name = (f.name || '').trim();
  const replyTo = parsed.replyTo?.value?.[0]?.address || addr || undefined;
  const subject = parsed.subject || '(بدون عنوان)';
  const who = name ? `${name} <${addr}>` : addr || 'مرسل غير معروف';
  const when = (parsed.date || new Date()).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const head = `📩 رسالة إلى ${rcpt}\nمن: ${who}\nالتاريخ: ${when}\nللرد على المرسل اضغط «رد» مباشرة.\n────────────\n\n`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const banner = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#eefaf7;border:1px solid #bfe9df;border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:13px;color:#1d2433;text-align:right">📩 رسالة إلى <b>${esc(rcpt)}</b><br>من: <b dir="ltr">${esc(who)}</b><br>التاريخ: ${esc(when)}<br>للرد على المرسل اضغط «رد» مباشرة.</div>`;
  const body = parsed.html || parsed.textAsHtml || `<pre>${esc(parsed.text || '')}</pre>`;
  const attachments = (parsed.attachments || []).slice(0, 30).map((a) => ({ filename: a.filename || undefined, content: a.content, contentType: a.contentType, cid: a.cid || undefined, contentDisposition: a.contentDisposition || undefined }));
  const headers = { 'X-ClipKat-Forwarded': rcpt, 'X-Original-From': clip(addr, 200) };
  if (auth) headers['X-Original-Authentication'] = clip(`spf=${auth.spf?.status?.result || 'none'} dkim=${auth.dkim?.results?.[0]?.status?.result || 'none'} dmarc=${auth.dmarc?.status?.result || 'none'}`, 200);
  return sendMail({ to: dest, subject, text: head + (parsed.text || ''), html: banner + body, fromName: `${clip(name || addr || 'مرسل', 60)} عبر كليب كات`, replyTo, attachments, headers });
}

export function createMx() {
  return new SMTPServer({
    name: HOST, banner: 'ClipKat inbound mail', size: MAX_BYTES,
    authOptional: true, disabledCommands: ['AUTH'],        // STARTTLS متاح بشهادة ذاتية (مقبول بين خوادم البريد)
    maxClients: num(env.MX_MAX_CLIENTS, 30), socketTimeout: 60000, closeTimeout: 30000,
    logger: false, hideSize: false,
    onConnect(session, cb) {
      const ip = session.remoteAddress;
      const n = (conns.get(ip) || 0) + 1;
      if (n > PER_IP_CONN) return cb(smtpErr(421, 'Too many connections, try later'));
      if (overRate(ip)) return cb(smtpErr(421, 'Rate limit, try later'));
      conns.set(ip, n); cb();
    },
    onClose(session) { const ip = session.remoteAddress; const n = (conns.get(ip) || 1) - 1; n > 0 ? conns.set(ip, n) : conns.delete(ip); },
    onMailFrom(address, session, cb) {
      if (OWN_FROM && address.address.toLowerCase() === OWN_FROM) return cb(smtpErr(550, '5.7.1 Loop detected'));
      if (address.args?.SIZE && Number(address.args.SIZE) > MAX_BYTES) return cb(smtpErr(552, '5.3.4 Message too big'));
      cb();
    },
    onRcptTo(address, session, cb) {
      const rcpt = address.address.toLowerCase();
      if (!ROUTES.has(rcpt)) return cb(smtpErr(550, '5.1.1 No such user here'));   // لا ترحيل لعناوين أخرى
      if (session.envelope.rcptTo.length >= 5) return cb(smtpErr(452, '4.5.3 Too many recipients'));
      cb();
    },
    async onData(stream, session, cb) {
      const ip = session.remoteAddress;
      try {
        const raw = await readAll(stream);
        if (stream.sizeExceeded) return cb(smtpErr(552, '5.3.4 Message too big'));
        if (overRate(ip)) return cb(smtpErr(451, '4.7.1 Rate limit, try later'));
        hit(ip);
        const parsed = await simpleParser(raw, { skipImageLinks: true });
        if (parsed.headers.has('x-clipkat-forwarded')) return cb(smtpErr(550, '5.7.1 Loop detected'));
        const auth = await checkAuth(raw, session);
        if (auth?.dmarc?.status?.result === 'fail' && auth.dmarc.policy === 'reject') {
          console.log(`[mx] rejected DMARC fail from ${maskEmail(session.envelope.mailFrom?.address || '')} ip=${ip}`);
          return cb(smtpErr(550, '5.7.1 Rejected by DMARC policy'));
        }
        const rcpts = [...new Set(session.envelope.rcptTo.map((r) => r.address.toLowerCase()))];
        for (const rcpt of rcpts) {
          const r = await forwardMail(parsed, raw, rcpt, ROUTES.get(rcpt), session, auth);
          console.log(`[mx] ${rcpt} from ${maskEmail(session.envelope.mailFrom?.address || '<>')} ip=${ip} → ${maskEmail(ROUTES.get(rcpt))}: ${r.sent ? 'accepted' : 'not sent'} (${r.mode}${r.via ? ' via ' + r.via : ''}) ${clip(r.response || '', 120)}`);
          if (!r.sent) throw smtpErr(451, 'Forwarding disabled');
        }
        cb(null, 'Queued and forwarded');
      } catch (e) {
        const code = e.responseCode >= 500 && e.responseCode < 600 ? 550 : 451;
        console.warn(`[mx] forward failed ip=${ip}: ${e.responseCode || ''} ${clip(e.response || e.message)}`);
        cb(smtpErr(code, code === 550 ? '5.7.1 Rejected by destination' : '4.4.1 Temporary failure, try again later'));
      }
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!ROUTES.size) { console.error('[mx] MX_ROUTES is empty — nothing to receive (example: support@clipkat.live=you@gmail.com)'); process.exit(1); }
  const srv = createMx();
  srv.on('error', (e) => console.warn('[mx] server error:', clip(e.message)));
  srv.listen(PORT, '0.0.0.0', () => console.log(`[mx] listening on :${PORT} for ${[...ROUTES.keys()].join(', ')} (${HOST})`));
  const stop = () => srv.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
