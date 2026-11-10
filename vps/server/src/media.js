// © 2026 وطن النهار — أدوات ffmpeg: مدة الملف واستخراج الصوت
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { rm } from './uploads.js';

const exec = promisify(execFile);

function head(file, n = 16) { const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b; }

// نوع الملف من البايتات — لا نثق بالامتداد
export function sniffAudio(file) {
  const b = head(file, 16);
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE') return 'wav';
  if (b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (b.subarray(0, 4).toString() === 'OggS') return 'ogg';
  if (b.subarray(4, 8).toString() === 'ftyp') return 'm4a';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return null;
}

export async function probe(file) {
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 20000, maxBuffer: 2_000_000 });
    const j = JSON.parse(stdout || '{}');
    const streams = j.streams || [];
    return {
      duration: Number(j.format?.duration) || Number(streams.find((s) => s.duration)?.duration) || 0,
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
      hasVideo: streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)
    };
  } catch {
    return null;
  }
}

// استخراج/تحويل الصوت إلى WebM/Opus (ثم AAC عند الفشل)
export async function extractAudio(input, outBase, { maxSec } = {}) {
  const cap = Number(maxSec) > 0 ? ['-t', String(maxSec)] : [];
  const tries = [
    { args: ['-y', '-v', 'error', '-i', input, ...cap, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libopus', '-b:a', '96k', outBase + '.webm'], ext: 'webm' },
    { args: ['-y', '-v', 'error', '-i', input, ...cap, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', outBase + '.m4a'], ext: 'm4a' }
  ];
  for (const t of tries) {
    try {
      await exec('ffmpeg', t.args, { timeout: 60000 });
      const out = outBase + '.' + t.ext;
      if (fs.existsSync(out) && fs.statSync(out).size > 200) return out;
      rm(out);
    } catch { rm(outBase + '.' + t.ext); }
  }
  return null;
}
