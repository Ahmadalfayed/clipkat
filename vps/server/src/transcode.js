// © 2026 وطن النهار — تجهيز المقاطع لتعمل على كل المتصفحات والأجهزة:
// تحويل أي مقطع غير آمن (HEVC/‏VP9/‏10-bit/‏HDR/‏أكبر من 1080p) إلى MP4 ‏H.264 + AAC مع faststart،
// في طابور خلفي بمهمة واحدة في كل مرة، ويستأنف بعد إعادة التشغيل.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { config } from './config.js';
import { rm, makePoster, dirs, sweepStaged } from './uploads.js';
import { notifyRemix } from './remix.js';

const run = (cmd, args, timeout) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout, maxBuffer: 4_000_000, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
    if (err) { err.stderr = String(stderr || '').slice(-600); return reject(err); }
    resolve(stdout);
  });
});

// ---------- الفحص ----------
export async function analyze(file) {
  try {
    const out = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], 30000);
    const j = JSON.parse(out || '{}'); const streams = j.streams || [];
    const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1) || null;
    const a = streams.find((s) => s.codec_type === 'audio') || null;
    let rotation = 0;
    if (v) {
      const sd = (v.side_data_list || []).find((d) => d.rotation !== undefined);
      rotation = Number(sd?.rotation ?? v.tags?.rotate ?? 0) || 0;
    }
    return {
      format: j.format?.format_name || '',
      duration: Number(j.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0,
      video: v && { codec: v.codec_name, pixFmt: v.pix_fmt || '', width: v.width || 0, height: v.height || 0, transfer: v.color_transfer || '', primaries: v.color_primaries || '', rotation, bits: Number(v.bits_per_raw_sample) || (/(10|12)(le|be)?$/.test(v.pix_fmt || '') ? 10 : 8) },
      audio: a && { codec: a.codec_name, channels: a.channels || 0 }
    };
  } catch { return null; }
}

const HDR_TRC = new Set(['smpte2084', 'arib-std-b67']);
export const isHdr = (vi) => !!vi && (HDR_TRC.has(vi.transfer) || vi.primaries === 'bt2020');

// هل يبدأ ملف MP4 بـ moov قبل mdat؟ (faststart = التشغيل قبل اكتمال التحميل)
export function moovFirst(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size; let pos = 0; const b = Buffer.alloc(16);
    for (let i = 0; i < 64 && pos + 8 <= size; i++) {
      fs.readSync(fd, b, 0, 16, pos);
      let len = b.readUInt32BE(0); const type = b.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (len === 1) len = Number(b.readBigUInt64BE(8)); else if (len === 0) return false;
      if (len < 8) return false; pos += len;
    }
    return false;
  } catch { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// ready = آمن كما هو | remux = إعادة تغليف بلا إعادة ترميز للصورة | transcode = تحويل كامل
export function plan(info, file) {
  if (!info || !info.video) return 'transcode';
  const v = info.video;
  const shortSide = Math.min(v.width || 0, v.height || 0);
  const videoOk = v.codec === 'h264' && (v.pixFmt === 'yuv420p' || v.pixFmt === 'yuvj420p') && !isHdr(v) && shortSide > 0 && shortSide <= 1088;
  if (!videoOk) return 'transcode';
  const audioOk = !info.audio || info.audio.codec === 'aac';
  const isMp4 = /mp4|mov/.test(info.format) && file && path.extname(file).toLowerCase() === '.mp4';
  if (isMp4 && audioOk && moovFirst(file)) return 'ready';
  return 'remux';
}

// أقصى 1080 للضلع الأقصر (يشمل الطولي 1080×1920)، مع أبعاد زوجية
const SCALE = "scale=w='if(gt(iw,ih),-2,trunc(min(1080,iw)/2)*2)':h='if(gt(iw,ih),trunc(min(1080,ih)/2)*2,-2)':flags=bicubic:out_range=tv,setsar=1";
const TONEMAP = 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

export function ffmpegArgs(mode, input, output, info, { tonemap = true } = {}) {
  const base = ['-y', '-v', 'error', '-nostdin', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-sn', '-dn'];
  const audio = info?.audio && info.audio.codec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100'];
  // حد المدة يُفرض هنا أيضاً: تسجيلات WebM من المتصفح لا تحمل مدتها في الترويسة
  const tail = ['-t', String(config.maxVideoSec + 0.5), '-movflags', '+faststart', '-f', 'mp4', output];
  if (mode === 'remux') return [...base, '-c:v', 'copy', ...audio, ...tail];
  const hdr = isHdr(info?.video);
  // ffmpeg يطبّق التدوير (autorotate) قبل المرشحات ويصفّر بيانات التدوير في الناتج
  const vf = hdr && tonemap ? `${TONEMAP},${SCALE}` : `${SCALE},format=yuv420p`;
  return [...base, '-vf', vf, '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', config.transcodePreset, '-crf', String(config.transcodeCrf), '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-threads', String(config.transcodeThreads),
    ...audio, ...tail];
}

// ---------- تعديلات الاستوديو على الخادم ----------
// المتصفح كان يعيد ترميز المقطع كاملاً بزمن حقيقي (canvas + MediaRecorder) — بطيء جداً على الجوال.
// الآن يرفع المتصفح الأصل + وصف التعديل (+ طبقة النص PNG) ويطبّقها ffmpeg هنا في الخلفية.
export const EDIT_SPEEDS = [0.5, 0.75, 1, 1.5, 2];
// مكافئات مرشحات CSS في الواجهة (studio-export.js FILTERS) بنفس مصفوفات مواصفة CSS Filter Effects،
// فيطابق الناتج ما يراه المستخدم في المعاينة
const M = {
  sepia: (a) => { const k = 1 - a; return [[0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k], [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k], [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]]; },
  saturate: (v) => [[0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v], [0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v], [0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]],
  gray: () => [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]],
  bright: (b) => [[b, 0, 0], [0, b, 0], [0, 0, b]],
  hue: (deg) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), n = Math.sin(r);
    return [[0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928],
      [0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.140, 0.072 - c * 0.072 - n * 0.283],
      [0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072]];
  }
};
const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
// خطوات CSS بالترتيب: المصفوفات المتتالية تُدمج في colorchannelmixer واحد؛ التباين (إزاحة) يُطبَّق بـ lutrgb
function cssChain(steps) {
  const out = []; let m = null;
  const flush = () => {
    if (!m) return; const f = (x) => Number(x.toFixed(4)); const k = ['r', 'g', 'b'];
    out.push('colorchannelmixer=' + k.flatMap((o, i) => k.map((c, j) => `${o}${c}=${f(m[i][j])}`)).join(':')); m = null;
  };
  for (const [kind, v] of steps) {
    if (kind === 'contrast') { flush(); const e = `clip((val-127.5)*${v}+127.5\\,0\\,255)`; out.push(`lutrgb=r='${e}':g='${e}':b='${e}'`); continue; }
    const s = M[kind](v); m = m ? mul(s, m) : s;   // الخطوة اللاحقة تُضرب من اليسار
  }
  flush();
  return out.join(',');
}
export const EDIT_FILTERS = {
  none: '',
  gray: cssChain([['gray']]),
  contrast: cssChain([['contrast', 1.35], ['saturate', 1.15]]),
  warm: cssChain([['sepia', 0.28], ['saturate', 1.25], ['hue', -12]]),
  cool: cssChain([['saturate', 1.15], ['hue', 18], ['bright', 1.05]]),
  vintage: cssChain([['sepia', 0.4], ['contrast', 1.1], ['bright', 0.95]])
};
const clamp = (x, lo, hi, d) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// يتحقق من وصف التعديل ويُرجع null إن لم يكن هناك تعديل فعلي (يُرفع الأصل كما هو)
export function normalizeEdit(raw, duration, { overlay = false, sound = false } = {}) {
  let e = raw;
  if (typeof raw === 'string') { try { e = JSON.parse(raw); } catch { return null; } }
  if (!e || typeof e !== 'object') return null;
  const dur = Number(duration) > 0 ? Number(duration) : 0;
  const maxEnd = dur || config.maxVideoSec;
  const start = clamp(e.start, 0, Math.max(0, maxEnd - 0.15), 0);
  let end = clamp(e.end, start + 0.15, maxEnd, maxEnd);
  if (dur && end > dur - 0.05) end = dur;
  const speed = EDIT_SPEEDS.includes(Number(e.speed)) ? Number(e.speed) : 1;
  const filter = Object.hasOwn(EDIT_FILTERS, e.filter) ? e.filter : 'none';
  const volOrig = clamp(e.volOrig, 0, 1, 1);
  const volSound = sound ? clamp(e.volSound, 0, 1, 0) : 0;
  const trimmed = start > 0.05 || (dur ? end < dur - 0.05 : Number(e.end) > 0 && Number(e.end) < maxEnd - 0.05);
  if (!trimmed && speed === 1 && filter === 'none' && !overlay && volOrig >= 0.999 && volSound <= 0) return null;
  return { start: +start.toFixed(3), end: +end.toFixed(3), speed, filter, volOrig, volSound, trimmed };
}
export const editedDuration = (e) => (e.end - e.start) / e.speed;

// الأبعاد بعد التدوير، بحد أقصى 720 للضلع الأقصر (مثل التصدير القديم في المتصفح، وأسرع في التحويل)
export function editDims(info, cap = 720) {
  let w = info?.video?.width || 720, h = info?.video?.height || 1280;
  if (Math.abs(info?.video?.rotation || 0) % 180 === 90) [w, h] = [h, w];
  const even = (x) => Math.max(2, Math.round(x / 2) * 2);
  if (w <= h) { const W = even(Math.min(cap, w)); return { w: W, h: even(W * h / w) }; }
  const H = even(Math.min(cap, h)); return { w: even(H * w / h), h: H };
}

export function editArgs(input, output, info, e, { overlay = null, sound = null, tonemap = true } = {}) {
  const { w, h } = editDims(info);
  const wall = editedDuration(e);
  const args = ['-y', '-v', 'error', '-nostdin', '-ss', String(e.start), '-t', String(+(e.end - e.start).toFixed(3)), '-i', input];
  let n = 1, ovIdx = -1, sIdx = -1;
  if (overlay) { args.push('-i', overlay); ovIdx = n++; }
  if (sound && e.volSound > 0) { args.push('-stream_loop', '-1', '-i', sound); sIdx = n++; }
  const hdr = isHdr(info?.video) && tonemap;
  const color = EDIT_FILTERS[e.filter] || '';
  const vchain = [hdr ? TONEMAP : null, `setpts=(PTS-STARTPTS)/${e.speed}`, `scale=${w}:${h}:flags=bicubic:out_range=tv`, 'setsar=1', color || null, 'format=yuv420p'].filter(Boolean).join(',');
  const fc = [`[0:v]${vchain}[v0]`];
  let vOut = '[v0]';
  if (ovIdx > 0) { fc.push(`[${ovIdx}:v]scale=${w}:${h},format=rgba[ov]`, `[v0][ov]overlay=0:0:eof_action=repeat:format=auto,format=yuv420p[v]`); vOut = '[v]'; }
  const aParts = [];
  if (info?.audio && e.volOrig > 0) { fc.push(`[0:a]asetpts=PTS-STARTPTS${e.speed !== 1 ? `,atempo=${e.speed}` : ''},volume=${e.volOrig}[a0]`); aParts.push('[a0]'); }
  if (sIdx > 0) { fc.push(`[${sIdx}:a]volume=${e.volSound}[a1]`); aParts.push('[a1]'); }
  let aOut = null;
  if (aParts.length === 2) { fc.push(`[a0][a1]amix=inputs=2:duration=longest:normalize=0[a]`); aOut = '[a]'; }
  else if (aParts.length === 1) aOut = aParts[0];
  args.push('-filter_complex', fc.join(';'), '-map', vOut);
  if (aOut) args.push('-map', aOut, '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100');
  args.push('-map_metadata', '-1', '-sn', '-dn', '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', config.transcodePreset, '-crf', String(config.transcodeCrf), '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-threads', String(config.transcodeThreads),
    '-t', String(+Math.min(wall, config.maxVideoSec + 0.5).toFixed(3)), '-movflags', '+faststart', '-f', 'mp4', output);
  return args;
}

const abs = (url) => path.join(config.uploadDir, String(url).replace(/^\/uploads\/?/, ''));
const ffmpegCmd = (args) => (config.transcodeNice ? ['nice', ['-n', '10', 'ffmpeg', ...args]] : ['ffmpeg', args]);

export async function convertFile(input, output, info, mode, edit = null) {
  const timeout = Math.max(15 * 60000, Math.round((info?.duration || 60) * 40000));
  if (mode === 'edit') {
    const go = async (opts) => { const [c, a] = ffmpegCmd(editArgs(input, output, info, edit.spec, { ...edit, ...opts })); await run(c, a, timeout); };
    try { await go({ tonemap: true }); }
    catch (e) {
      rm(output);
      if (isHdr(info?.video)) await go({ tonemap: false });
      else if (edit.sound) { console.warn('[transcode] edit with sound failed, retrying without it:', e.message, e.stderr || ''); await go({ sound: null }); }
      else throw e;
    }
    const outInfo = await analyze(output);
    if (!outInfo?.video || outInfo.video.codec !== 'h264' || !(outInfo.duration > 0)) { rm(output); throw new Error('bad output'); }
    return outInfo;
  }
  const attempt = async (m, opts) => { const [c, a] = ffmpegCmd(ffmpegArgs(m, input, output, info, opts)); await run(c, a, timeout); };
  try { await attempt(mode, { tonemap: true }); }
  catch (e) {
    rm(output);
    if (mode === 'remux') await attempt('transcode', { tonemap: true });          // تعذّرت إعادة التغليف → تحويل كامل
    else if (isHdr(info?.video)) await attempt('transcode', { tonemap: false });  // بدون تعيين نغمات: 8-bit فقط
    else throw e;
  }
  const outInfo = await analyze(output);
  if (!outInfo?.video || outInfo.video.codec !== 'h264' || !(outInfo.duration > 0)) { rm(output); throw new Error('bad output'); }
  return outInfo;
}

// ---------- معالجة مقطع واحد ----------
export async function processVideo(id) {
  const row = (await q('select id, user_id, video_path, poster_url, poster_auto, status, source_clip_id, remix_type, media_status, edit_spec from videos where id = $1', [id])).rows[0];
  if (!row || !['processing', 'reprocess'].includes(row.media_status)) return null;
  const wasHidden = row.media_status === 'processing';
  const input = abs(row.video_path);
  const t0 = Date.now();
  try {
    if (!fs.existsSync(input)) throw new Error('missing file');
    const info = await analyze(input);
    if (!info?.video) throw new Error('no video stream');
    const spec = row.edit_spec && typeof row.edit_spec === 'object' ? row.edit_spec : null;
    const mode = spec ? 'edit' : plan(info, input);
    const edit = spec && { spec, overlay: spec.overlay ? abs(spec.overlay) : null, sound: spec.sound ? abs(spec.sound) : null };
    if (edit?.overlay && !fs.existsSync(edit.overlay)) edit.overlay = null;
    if (edit?.sound && !fs.existsSync(edit.sound)) edit.sound = null;
    if (mode === 'ready') { await q("update videos set media_status = 'ready', media_error = null where id = $1", [id]); return { id, mode, ms: Date.now() - t0 }; }
    const dir = path.dirname(input);
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`.${id}.`) && f.endsWith('.part.mp4')) rm(path.join(dir, f));   // بقايا مهمة انقطعت
    const finalName = `${id}.mp4`, finalPath = path.join(dir, finalName);
    const part = path.join(dir, `.${id}.${crypto.randomBytes(4).toString('hex')}.part.mp4`);
    try { await convertFile(input, part, info, mode, edit); } catch (e) { rm(part); throw e; }
    fs.renameSync(part, finalPath);
    const url = `/uploads/videos/${row.user_id}/${finalName}`;
    // الصورة المصغّرة من الملف المحوّل (إن كانت مولّدة آلياً أو مفقودة)
    let poster = row.poster_url;
    if ((mode === 'transcode' || mode === 'edit') && (row.poster_auto || !row.poster_url)) {
      const pdir = path.join(dirs.images, row.user_id); fs.mkdirSync(pdir, { recursive: true });
      const pname = `poster-${id}-${Date.now().toString(36)}.jpg`;
      if (await makePoster(finalPath, path.join(pdir, pname))) {
        if (row.poster_auto && row.poster_url) rm(abs(row.poster_url));
        poster = `/uploads/images/${row.user_id}/${pname}`;
      }
    }
    const up = await q("update videos set video_path = $2, video_url = $2, poster_url = $3, poster_auto = $4, media_status = 'ready', media_error = null, edit_spec = null where id = $1 and media_status in ('processing','reprocess') returning id",
      [id, url, poster, poster !== row.poster_url ? true : row.poster_auto]);
    if (!up.rowCount) {                                    // حُذف المقطع أثناء التحويل: نحذف كل ما أنتجناه
      rm(finalPath); rm(input); if (poster && poster !== row.poster_url) rm(abs(poster));
      console.log(`[transcode] ${id} deleted during conversion — outputs removed`);
      return null;
    }
    if (path.resolve(input) !== path.resolve(finalPath)) rm(input);   // حذف الأصل لتوفير المساحة
    if (spec?.overlay) rm(abs(spec.overlay));
    if (wasHidden && row.status === 'published' && row.source_clip_id) await notifyRemix(row).catch(() => {});
    const r = { id, mode, ms: Date.now() - t0 };
    console.log(`[transcode] ${id} ${mode} in ${(r.ms / 1000).toFixed(1)}s`);
    return r;
  } catch (e) {
    // حُذف المقطع أثناء التحويل (حذف صاحبه الملفات): ليس فشلاً — نحذف أي بقايا ونتجاهل
    if (!(await q('select 1 from videos where id = $1', [id]).catch(() => ({ rowCount: 1 }))).rowCount) {
      try { const dir = path.dirname(input); for (const f of fs.readdirSync(dir)) if (f.startsWith(`.${id}.`) || f === `${id}.mp4`) rm(path.join(dir, f)); } catch {}
      if (row.edit_spec?.overlay) rm(abs(row.edit_spec.overlay));
      console.log(`[transcode] ${id} deleted during conversion — skipped`);
      return null;
    }
    console.warn(`[transcode] ${id} failed:`, e.message, e.stderr || '');
    // عند الفشل نُبقي الأصل ونُظهره كما هو
    // فشل التعديل: يُعرض الأصل بلا تعديلات (أفضل من لا شيء) ونحذف طبقة النص
    await q("update videos set media_status = 'failed', media_error = $2, edit_spec = null where id = $1", [id, String(e.message || 'failed').slice(0, 200)]);
    if (row.edit_spec?.overlay) rm(abs(row.edit_spec.overlay));
    if (wasHidden && row.status === 'published' && row.source_clip_id) await notifyRemix(row).catch(() => {});
    return { id, mode: 'failed', ms: Date.now() - t0 };
  }
}

// ---------- الطابور: مهمة واحدة في كل مرة ----------
let running = false, again = false, timer = null;
const idleWaiters = [];
export function kick() {
  if (running) { again = true; return; }
  running = true;
  (async () => {
    try {
      for (;;) {
        const next = (await q("select id from videos where media_status in ('processing','reprocess') order by (media_status = 'reprocess'), created_at limit 1")).rows[0];
        if (!next) break;
        await processVideo(next.id);
      }
    } catch (e) { console.error('[transcode] queue', e.message); }
    finally {
      running = false;
      if (again) { again = false; kick(); } else idleWaiters.splice(0).forEach((f) => f());
    }
  })();
}
export const whenIdle = () => new Promise((r) => (running ? idleWaiters.push(r) : r()));
export function startTranscoder(ms = 30000) {
  kick();                                  // استئناف ما لم يكتمل قبل إعادة التشغيل
  timer = setInterval(kick, ms); timer.unref?.();
  sweepStaged();                           // رفعات مسبقة لم تُنشر
  const sweeper = setInterval(() => sweepStaged(), 30 * 60000); sweeper.unref?.();
  return () => { clearInterval(timer); clearInterval(sweeper); };
}
