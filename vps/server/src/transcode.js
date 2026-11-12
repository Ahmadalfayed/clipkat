// © 2026 وطن النهار — تجهيز المقاطع لتعمل على كل المتصفحات والأجهزة:
// تحويل أي مقطع غير آمن (HEVC/‏VP9/‏10-bit/‏HDR/‏أكبر من 1080p) إلى MP4 ‏H.264 + AAC مع faststart،
// في طابور خلفي بمهمة واحدة في كل مرة، ويستأنف بعد إعادة التشغيل.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { config } from './config.js';
import { rm, makePoster, dirs } from './uploads.js';
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
const SCALE = "scale=w='if(gt(iw,ih),-2,trunc(min(1080,iw)/2)*2)':h='if(gt(iw,ih),trunc(min(1080,ih)/2)*2,-2)':flags=bicubic";
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
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-threads', String(config.transcodeThreads),
    ...audio, ...tail];
}

const abs = (url) => path.join(config.uploadDir, String(url).replace(/^\/uploads\/?/, ''));
const ffmpegCmd = (args) => (config.transcodeNice ? ['nice', ['-n', '10', 'ffmpeg', ...args]] : ['ffmpeg', args]);

export async function convertFile(input, output, info, mode) {
  const timeout = Math.max(15 * 60000, Math.round((info?.duration || 60) * 40000));
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
  const row = (await q('select id, user_id, video_path, poster_url, poster_auto, status, source_clip_id, remix_type, media_status from videos where id = $1', [id])).rows[0];
  if (!row || !['processing', 'reprocess'].includes(row.media_status)) return null;
  const wasHidden = row.media_status === 'processing';
  const input = abs(row.video_path);
  const t0 = Date.now();
  try {
    if (!fs.existsSync(input)) throw new Error('missing file');
    const info = await analyze(input);
    if (!info?.video) throw new Error('no video stream');
    const mode = plan(info, input);
    if (mode === 'ready') { await q("update videos set media_status = 'ready', media_error = null where id = $1", [id]); return { id, mode, ms: Date.now() - t0 }; }
    const dir = path.dirname(input);
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`.${id}.`) && f.endsWith('.part.mp4')) rm(path.join(dir, f));   // بقايا مهمة انقطعت
    const finalName = `${id}.mp4`, finalPath = path.join(dir, finalName);
    const part = path.join(dir, `.${id}.${crypto.randomBytes(4).toString('hex')}.part.mp4`);
    try { await convertFile(input, part, info, mode); } catch (e) { rm(part); throw e; }
    fs.renameSync(part, finalPath);
    const url = `/uploads/videos/${row.user_id}/${finalName}`;
    // الصورة المصغّرة من الملف المحوّل (إن كانت مولّدة آلياً أو مفقودة)
    let poster = row.poster_url;
    if (mode === 'transcode' && (row.poster_auto || !row.poster_url)) {
      const pdir = path.join(dirs.images, row.user_id); fs.mkdirSync(pdir, { recursive: true });
      const pname = `poster-${id}-${Date.now().toString(36)}.jpg`;
      if (await makePoster(finalPath, path.join(pdir, pname))) {
        if (row.poster_auto && row.poster_url) rm(abs(row.poster_url));
        poster = `/uploads/images/${row.user_id}/${pname}`;
      }
    }
    const up = await q("update videos set video_path = $2, video_url = $2, poster_url = $3, poster_auto = $4, media_status = 'ready', media_error = null where id = $1 and media_status in ('processing','reprocess') returning id",
      [id, url, poster, poster !== row.poster_url ? true : row.poster_auto]);
    if (!up.rowCount) { rm(finalPath); return null; }      // حُذف المقطع أثناء التحويل
    if (path.resolve(input) !== path.resolve(finalPath)) rm(input);   // حذف الأصل لتوفير المساحة
    if (wasHidden && row.status === 'published' && row.source_clip_id) await notifyRemix(row).catch(() => {});
    const r = { id, mode, ms: Date.now() - t0 };
    console.log(`[transcode] ${id} ${mode} in ${(r.ms / 1000).toFixed(1)}s`);
    return r;
  } catch (e) {
    console.warn(`[transcode] ${id} failed:`, e.message, e.stderr || '');
    // عند الفشل نُبقي الأصل ونُظهره كما هو
    await q("update videos set media_status = 'failed', media_error = $2 where id = $1", [id, String(e.message || 'failed').slice(0, 200)]);
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
  return () => clearInterval(timer);
}
