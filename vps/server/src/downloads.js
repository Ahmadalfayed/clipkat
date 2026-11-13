// © 2026 وطن النهار — تنزيل المقاطع.
//  • «تنزيل (مجاني)»: للمسجّلين فقط. الخادم يولّد نسخة MP4 ‏(H.264/AAC + faststart) عليها شعار كليب كات و«@اسم_صاحب_المقطع»،
//    والعلامة تتحرك منتصف المقطع مثل تيك توك: أعلى اليسار في النصف الأول ثم أسفل اليمين في النصف الثاني.
//    التوليد مهمة منخفضة الأولوية (nice) في طابور، والناتج يُخزَّن لكل مقطع في uploads/.dlcache (مجلد مخفي: لا يُخدَم من /uploads)
//    فيكون التنزيل التالي فورياً. يُحذف مع حذف المقطع (removeVideoFiles).
//  • «تنزيل بدون شعار»: لمشتركي «كليب كات بلس» (بلا حدود، مع حدّ معدل)، ولصاحب المقطع لمقاطعه مجاناً.
//  • «السماح بتنزيل فيديوهاتي» (allow_download) مطفأ → 403 لغير صاحب المقطع.
//  • الملفات تُخدَم فقط عبر روابط موقّعة قصيرة العمر (10 دقائق) مربوطة بالمستخدم، وبترويسة Content-Disposition: attachment.
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { q, tx } from './db.js';
import { requireUser } from './auth.js';
import { HttpError, bad, isUuid } from './util.js';
import { dirs, rm } from './uploads.js';
import { analyze } from './transcode.js';
import { isPlus } from './plus.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function rl(windowMs, max) { return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) }); }

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
export const WM_LOGO = process.env.WM_LOGO || path.join(ASSETS, 'wm-logo.png');
export const WM_FONT = process.env.WM_FONT || path.join(ASSETS, 'DejaVuSans-Bold.ttf');
const WM_VERSION = 'v1';
const TOKEN_TTL = '10m';
// مفتاح توقيع مشتق (لا يُقبل رمز التنزيل كجلسة دخول ولا العكس)
const dlKey = () => crypto.createHmac('sha256', String(config.jwtSecret)).update('clipkat-download-v1').digest();
const absUrl = (url) => (typeof url === 'string' && url.startsWith('/uploads/') && !url.includes('..') ? path.join(config.uploadDir, url.replace(/^\/uploads\/?/, '')) : null);
const safeName = (u) => String(u || 'user').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'user';

// ---------- مرشّح ffmpeg للعلامة المتحركة ----------
const ffEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%');
export function watermarkArgs(input, output, info, username) {
  let W = info?.video?.width || 720, H = info?.video?.height || 1280;
  if ([90, 270, -90, -270].includes(Number(info?.video?.rotation))) [W, H] = [H, W];
  const S = Math.min(W, H);
  const L = Math.max(36, Math.round(S * 0.15)) & ~1;            // حجم الشعار
  const F1 = Math.max(14, Math.round(S * 0.05));                 // «ClipKat»
  const F2 = Math.max(12, Math.round(S * 0.04));                 // «@username»
  const M = Math.max(8, Math.round(S * 0.035));                  // الهامش
  const MB = Math.max(12, Math.round(S * 0.10));                 // هامش سفلي أكبر (فوق أزرار المشغّلات)
  const G = Math.max(4, Math.round(S * 0.02));
  const half = Math.max(0.5, (Number(info?.duration) || 6) / 2).toFixed(3);
  const first = `lt(t,${half})`;
  const font = ffEsc(WM_FONT);
  const txt = (text, size, yTop, yBot) => `drawtext=fontfile='${font}':text='${ffEsc(text)}':fontsize=${size}:fontcolor=white:borderw=${Math.max(1, Math.round(size / 12))}:bordercolor=black@0.55:shadowx=1:shadowy=1:shadowcolor=black@0.4`
    + `:x='if(${first},${M + L + G},w-${M + L + G}-tw)':y='if(${first},${yTop},h-${MB}-${L}+${yBot})'`;
  const fc = [
    `[1:v]scale=${L}:${L},format=rgba[lg]`,
    `[0:v][lg]overlay=x='if(${first},${M},W-${M}-w)':y='if(${first},${M},H-${MB}-h)':eof_action=repeat:format=auto,`
      + txt('ClipKat', F1, M + Math.round(L * 0.10), Math.round(L * 0.10)) + ','
      + txt('@' + safeName(username), F2, M + Math.round(L * 0.56), Math.round(L * 0.56)) + ',format=yuv420p[v]'
  ].join(';');
  const audio = info?.audio?.codec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'];
  return ['-y', '-v', 'error', '-nostdin', '-i', input, '-i', WM_LOGO, '-filter_complex', fc, '-map', '[v]', '-map', '0:a:0?', '-map_metadata', '-1', '-sn', '-dn',
    '-c:v', 'libx264', '-preset', config.transcodePreset, '-crf', String(config.transcodeCrf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', String(config.transcodeThreads),
    ...audio, '-movflags', '+faststart', '-f', 'mp4', output];
}

const runFf = (args, timeout) => new Promise((resolve, reject) => {
  const [cmd, a] = config.transcodeNice ? ['nice', ['-n', '15', 'ffmpeg', ...args]] : ['ffmpeg', args];
  execFile(cmd, a, { timeout, maxBuffer: 4_000_000, killSignal: 'SIGKILL' }, (err, _o, stderr) => { if (err) { err.stderr = String(stderr || '').slice(-600); return reject(err); } resolve(); });
});

// ---------- طابور التوليد (مهمة واحدة في كل مرة) ----------
const jobs = new Map();   // name → { status: 'processing'|'failed', at }
const queue = []; let active = 0;
export const cacheName = (v, username) => `${v.id}-${crypto.createHash('sha1').update(`${v.src}|${safeName(username)}|${WM_VERSION}`).digest('hex').slice(0, 12)}.mp4`;
function pump() {
  while (active < 1 && queue.length) {
    const job = queue.shift(); active++;
    job().finally(() => { active--; pump(); });
  }
}
export function wmState(v, username) {
  const name = cacheName(v, username); const file = path.join(dirs.dlcache, name);
  if (fs.existsSync(file)) return { status: 'ready', file, name };
  const j = jobs.get(name);
  if (j?.status === 'processing') return { status: 'processing', name };
  if (j?.status === 'failed' && Date.now() - j.at < 60000) return { status: 'failed', name };
  const input = absUrl(v.src);
  if (!input || !fs.existsSync(input)) return { status: 'failed', name };
  jobs.set(name, { status: 'processing', at: Date.now() });
  queue.push(async () => {
    const part = path.join(dirs.dlcache, `.${v.id}-${crypto.randomBytes(4).toString('hex')}.part.mp4`);
    try {
      fs.mkdirSync(dirs.dlcache, { recursive: true });
      const info = await analyze(input);
      if (!info?.video) throw new Error('no video');
      await runFf(watermarkArgs(input, part, info, username), Math.max(5 * 60000, Math.round((info.duration || 60) * 20000)));
      // حُذف المقطع أثناء التوليد؟ لا نترك ملفاً يتيماً
      if (!(await q('select 1 from videos where id = $1', [v.id])).rowCount) { rm(part); jobs.delete(name); return; }
      fs.renameSync(part, path.join(dirs.dlcache, name));
      for (const f of fs.readdirSync(dirs.dlcache)) if (f.startsWith(`${v.id}-`) && f !== name) rm(path.join(dirs.dlcache, f));   // نسخ قديمة
      jobs.delete(name);
    } catch (e) {
      rm(part); jobs.set(name, { status: 'failed', at: Date.now() });
      console.error('[download] watermark failed', v.id, e.message, e.stderr || '');
    }
  });
  pump();
  return { status: 'processing', name };
}
export const downloadsIdle = () => new Promise((resolve) => { const t = setInterval(() => { if (!active && !queue.length) { clearInterval(t); resolve(); } }, 100); });

// ---------- الراوتر ----------
export function buildDownloadsRouter(findVideo) {
  const r = express.Router();
  const issueLimit = rl(10 * 60000, config.downloadRateMax);
  const pollLimit = rl(10 * 60000, 600);

  async function access(req, kind) {
    if (!['wm', 'nowm'].includes(kind)) throw bad('bad');
    const id = req.params.id; if (!isUuid(id)) throw bad('bad');
    const v = await findVideo(req.user, id);
    if (!v) throw new HttpError(404, 'notfound');
    if (v.mediaStatus === 'processing') throw new HttpError(409, 'notReady');
    const own = v.userId === req.user.id;
    if (!own && v.canDownload === false) throw new HttpError(403, 'downloadOff');
    let via = 'free';
    if (kind === 'nowm') {
      if (own) via = 'owner';
      else if (await isPlus(req.user.id)) via = 'plus';
      else throw new HttpError(402, 'plusRequired');
    }
    const owner = (await q('select username from profiles where id = $1', [v.userId])).rows[0];
    // v.src رابط تشغيل موقّع؛ للملف الفعلي نقرأ المسار الخام من القاعدة
    const raw = (await q('select video_url from videos where id = $1', [v.id])).rows[0]?.video_url;
    if (!raw) throw new HttpError(404, 'notfound');
    return { v, own, via, username: owner?.username || 'user', file: { id: v.id, src: raw } };
  }
  async function issue(req, a, kind, file) {
    const st = fs.statSync(file);
    await tx(async (c) => {
      await c.query('insert into video_downloads (user_id, video_id, kind, via) values ($1,$2,$3,$4)', [req.user.id, a.v.id, kind, a.via]);
      await c.query('update videos set downloads_count = downloads_count + 1 where id = $1', [a.v.id]);
    });
    const token = jwt.sign({ v: a.v.id, k: kind, f: path.basename(file), u: req.user.id }, dlKey(), { algorithm: 'HS256', expiresIn: TOKEN_TTL, audience: 'ck-dl' });
    const filename = `clipkat-${safeName(a.username)}-${a.v.id.slice(0, 8)}${kind === 'wm' ? '' : '-hd'}${path.extname(file) || '.mp4'}`;
    return { status: 'ready', kind, via: a.via, url: `/api/dl/${token}`, filename, size: st.size };
  }

  r.post('/videos/:id/download', requireUser, issueLimit, h(async (req, res) => {
    const kind = String(req.body?.kind || 'wm');
    const a = await access(req, kind);
    if (kind === 'nowm') {
      const file = absUrl(a.file.src);
      if (!file || !fs.existsSync(file)) throw new HttpError(404, 'notfound');
      return res.json(await issue(req, a, kind, file));
    }
    const s = wmState(a.file, a.username);
    if (s.status === 'ready') return res.json(await issue(req, a, kind, s.file));
    if (s.status === 'failed') throw new HttpError(500, 'dlFailed');
    res.status(202).json({ status: 'processing', kind });
  }));
  // متابعة تجهيز النسخة بالشعار (لا تُحتسب ضمن حدّ طلبات التنزيل)
  r.get('/videos/:id/download/status', requireUser, pollLimit, h(async (req, res) => {
    const a = await access(req, 'wm');
    const s = wmState(a.file, a.username);
    if (s.status === 'ready') return res.json(await issue(req, a, 'wm', s.file));
    if (s.status === 'failed') throw new HttpError(500, 'dlFailed');
    res.status(202).json({ status: 'processing', kind: 'wm' });
  }));

  // تسليم الملف عبر رابط موقّع قصير العمر
  r.get('/dl/:token', rl(10 * 60000, 300), h(async (req, res) => {
    let p; try { p = jwt.verify(String(req.params.token), dlKey(), { algorithms: ['HS256'], audience: 'ck-dl' }); } catch { throw new HttpError(403, 'linkExpired'); }
    if (!req.user || req.user.id !== p.u) throw new HttpError(403, 'forbidden');
    const v = (await q('select id, user_id, video_url from videos where id = $1', [p.v])).rows[0];
    if (!v) throw new HttpError(404, 'notfound');
    const owner = (await q('select username from profiles where id = $1', [v.user_id])).rows[0];
    let file;
    if (p.k === 'wm') file = path.join(dirs.dlcache, path.basename(String(p.f)));
    else { file = absUrl(v.video_url); if (!file || path.basename(file) !== p.f) throw new HttpError(404, 'notfound'); }
    if (!fs.existsSync(file) || !path.basename(file).startsWith(p.k === 'wm' ? `${v.id}-` : '')) throw new HttpError(404, 'notfound');
    const filename = `clipkat-${safeName(owner?.username)}-${v.id.slice(0, 8)}${p.k === 'wm' ? '' : '-hd'}${path.extname(file) || '.mp4'}`;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(file, filename, { dotfiles: 'allow' });
  }));
  return r;
}
