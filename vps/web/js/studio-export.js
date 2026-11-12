// © 2026 وطن النهار — تصدير المقطع في المتصفح: قص، سرعة، فلتر، نصوص، مزج الصوت
// الاعتماد: Canvas + MediaRecorder (الصيغة الشائعة WebM). لا يُستخدم ffmpeg هنا لأن التأثيرات تُرسم في المتصفح.

export const FILTERS = {
  none: { css: 'none', label: 'بدون' },
  gray: { css: 'grayscale(1)', label: 'رمادي' },
  contrast: { css: 'contrast(1.35) saturate(1.15)', label: 'واضح' },
  warm: { css: 'sepia(.28) saturate(1.25) hue-rotate(-12deg)', label: 'دافئ' },
  cool: { css: 'saturate(1.15) hue-rotate(18deg) brightness(1.05)', label: 'بارد' },
  vintage: { css: 'sepia(.4) contrast(1.1) brightness(.95)', label: 'قديم' }
};
export const SPEEDS = [0.5, 0.75, 1, 1.5, 2];

import { pickRecorderMime as pickMime, isWebKitUA, recordedType } from './rec-mime.js';
const nav = () => (typeof navigator !== 'undefined' ? navigator : {});
export const isWebKit = () => isWebKitUA(nav().userAgent || '', '', nav().maxTouchPoints || 0);
export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return pickMime({ isTypeSupported: MediaRecorder.isTypeSupported ? (t) => MediaRecorder.isTypeSupported(t) : null, ua: nav().userAgent || '', maxTouchPoints: nav().maxTouchPoints || 0 });
}
// غير مدعوم فقط إن لم يوجد MediaRecorder أصلاً
export const recorderSupported = () => typeof MediaRecorder !== 'undefined';
// إنشاء MediaRecorder بأفضل الإعدادات ثم التراجع تدريجياً حتى «بلا mimeType» (سفاري يختار MP4 بنفسه)
export function makeRecorder(stream, { videoBitsPerSecond = 2_500_000, audioBitsPerSecond = 128_000 } = {}) {
  if (typeof MediaRecorder === 'undefined') throw new Error('noRecorder');
  const mime = pickRecorderMime();
  const tries = [];
  if (mime) tries.push({ mimeType: mime, videoBitsPerSecond, audioBitsPerSecond }, { mimeType: mime });
  tries.push({ videoBitsPerSecond, audioBitsPerSecond }, {});
  for (const o of tries) { try { const r = new MediaRecorder(stream, o); r._ckMime = mime; return r; } catch { /* التالي */ } }
  try { const r = new MediaRecorder(stream); r._ckMime = ''; return r; } catch { throw new Error('noRecorder'); }
}
// Blob نهائي بالنوع الصحيح (MP4 على سفاري)
export function finishBlob(chunks, rec) {
  const { type } = recordedType(rec.mimeType, chunks[0]?.type, rec._ckMime, isWebKit());
  return new Blob(chunks, { type });
}

function wait(el, ev) { return new Promise((ok) => el.addEventListener(ev, ok, { once: true })); }
async function seek(el, t) { el.currentTime = Math.max(0, t); if (Math.abs((el.currentTime || 0) - t) > 0.05) await wait(el, 'seeked'); }

export async function captureFrame(video, time, { filter = 'none', texts = [] } = {}) {
  await seek(video, time);
  const c = document.createElement('canvas');
  const w = Math.min(720, video.videoWidth || 720);
  const h = Math.round(w * ((video.videoHeight || 1280) / (video.videoWidth || 720)));
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx, video, w, h, filter, texts);
  return c.toDataURL('image/jpeg', 0.82);
}

function paint(ctx, video, w, h, filter, texts) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.filter = FILTERS[filter]?.css || 'none';
  const vw = video.videoWidth || w, vh = video.videoHeight || h;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.filter = 'none';
  for (const tx of texts) {
    if (!tx.text) continue;
    const size = Math.max(16, Math.min(96, Number(tx.size) || 36)) * (w / 720);
    ctx.font = `700 ${size}px Cairo, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 10);
    ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = tx.color || '#fff';
    const x = w * (tx.x ?? 0.5), y = h * (tx.y ?? 0.8);
    ctx.strokeText(tx.text, x, y); ctx.fillText(tx.text, x, y);
  }
}

// يصدّر المقطع المحرّر. يُرجع { blob, mime, poster } أو يرمي خطأ واضحاً.
export async function exportClip(opts, onProgress = () => {}) {
  const { sourceUrl, start = 0, end, speed = 1, filter = 'none', texts = [], coverTime, soundUrl = null, volOrig = 1, volSound = 1 } = opts;
  if (typeof MediaRecorder === 'undefined') throw new Error('noRecorder');
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.preload = 'auto'; video.src = sourceUrl; video.crossOrigin = 'anonymous';
  await Promise.race([wait(video, 'loadeddata'), new Promise((_, no) => setTimeout(() => no(new Error('load')), 15000))]);
  const dur = video.duration || 0;
  const t0 = Math.max(0, Math.min(start, dur - 0.1));
  const t1 = Math.min(dur, Math.max(t0 + 0.15, end || dur));
  const wall = (t1 - t0) / Math.max(0.25, speed);

  const maxW = 720;
  const w = Math.min(maxW, video.videoWidth || maxW);
  const h = Math.round(w * ((video.videoHeight || 1280) / (video.videoWidth || 720))) || Math.round(w * 16 / 9);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const vStream = canvas.captureStream(30);
  const tracks = [...vStream.getVideoTracks()];

  let actx = null, dest = null;
  const stopAudio = async () => { try { await actx?.close(); } catch {} };
  try {
    actx = new AudioContext();
    dest = actx.createMediaStreamDestination();
    const vAud = document.createElement('video');
    vAud.playsInline = true; vAud.preload = 'auto'; vAud.src = sourceUrl; vAud.volume = 1;
    await Promise.race([wait(vAud, 'canplay'), new Promise((ok) => setTimeout(ok, 4000))]);
    try {
      const src = actx.createMediaElementSource(vAud);
      const g = actx.createGain(); g.gain.value = Math.max(0, Math.min(1, volOrig));
      src.connect(g); g.connect(dest);
    } catch { /* بعض المتصفحات تمنع مصدر العنصر */ }
    let aEl = null;
    if (soundUrl) {
      aEl = new Audio(); aEl.crossOrigin = 'anonymous'; aEl.loop = true; aEl.src = soundUrl; aEl.preload = 'auto';
      await Promise.race([wait(aEl, 'canplay'), new Promise((ok) => setTimeout(ok, 4000))]);
      try {
        const src = actx.createMediaElementSource(aEl);
        const g = actx.createGain(); g.gain.value = Math.max(0, Math.min(1, volSound));
        src.connect(g); g.connect(dest);
      } catch {}
    }
    const at = dest.stream.getAudioTracks()[0];
    if (at) tracks.push(at);
    if (actx.state === 'suspended') await actx.resume().catch(() => {});

    const rec = makeRecorder(new MediaStream(tracks));
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((ok, no) => { rec.onstop = ok; rec.onerror = () => no(new Error('record')); });

    video.playbackRate = speed; vAud.playbackRate = speed;
    await seek(video, t0); await seek(vAud, t0);
    let running = true;
    const draw = () => {
      if (!running) return;
      paint(ctx, video, w, h, filter, texts);
      onProgress(Math.min(1, Math.max(0, (video.currentTime - t0) / (t1 - t0))));
      if (video.currentTime >= t1 - 0.04 || video.ended) { running = false; try { rec.stop(); } catch {} return; }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    rec.start(200);
    await Promise.all([video.play(), vAud.play().catch(() => {}), aEl?.play().catch(() => {})]);
    const started = performance.now();
    draw();
    const killer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, wall * 1000 + 1500);
    await stopped; clearTimeout(killer);
    running = false;
    video.pause(); vAud.pause(); aEl?.pause();
    const blob = finishBlob(chunks, rec);
    if (!blob.size) throw new Error('empty');
    const posterAt = Math.min(t1, Math.max(t0, coverTime ?? (t0 + (t1 - t0) / 2)));
    const poster = await captureFrame(video, posterAt, { filter, texts });
    onProgress(1);
    await stopAudio();
    video.removeAttribute('src'); video.load(); vAud.removeAttribute('src'); vAud.load();
    return { blob, mime: blob.type, poster, duration: wall };
  } catch (e) {
    await stopAudio(); throw e;
  }
}



function coverDraw(ctx, video, x, y, w, h, filter = 'none') {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
  ctx.filter = FILTERS[filter]?.css || 'none';
  const vw = video.videoWidth || w, vh = video.videoHeight || h;
  if (vw && vh) {
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  ctx.filter = 'none';
  ctx.restore();
}

function paintTexts(ctx, w, h, texts) {
  for (const tx of texts || []) {
    if (!tx.text) continue;
    const size = Math.max(16, Math.min(96, Number(tx.size) || 36) * (w / 720));
    ctx.font = `700 ${size}px Cairo, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 10);
    ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = tx.color || '#fff';
    ctx.strokeText(tx.text, w * (tx.x ?? 0.5), h * (tx.y ?? 0.8));
    ctx.fillText(tx.text, w * (tx.x ?? 0.5), h * (tx.y ?? 0.8));
  }
}

export function duetRects(layout, sourceSide, W, H) {
  if (layout === 'tb') {
    const top = { x: 0, y: 0, w: W, h: Math.round(H / 2) };
    const bot = { x: 0, y: top.h, w: W, h: H - top.h };
    return sourceSide === 'bottom' ? { source: bot, user: top } : { source: top, user: bot };
  }
  const left = { x: 0, y: 0, w: Math.round(W / 2), h: H };
  const right = { x: left.w, y: 0, w: W - left.w, h: H };
  return sourceSide === 'left' ? { source: left, user: right } : { source: right, user: left };
}

async function loadVideo(url) {
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.preload = 'auto'; video.crossOrigin = 'anonymous'; video.src = url;
  await Promise.race([wait(video, 'loadeddata'), new Promise((_, no) => setTimeout(() => no(new Error('load')), 15000))]);
  return video;
}

async function mixAudio(actx, dest, els) {
  for (const { el, vol } of els) {
    if (!el || vol <= 0) continue;
    try {
      const src = actx.createMediaElementSource(el);
      const g = actx.createGain(); g.gain.value = Math.max(0, Math.min(1, vol));
      src.connect(g); g.connect(dest);
    } catch { /* بعض المتصفحات تمنع مصدر العنصر */ }
  }
}

async function recordCanvas(canvas, audioEls, durationSec, onFrame, onProgress) {
  if (typeof MediaRecorder === 'undefined') throw new Error('noRecorder');
  const vStream = canvas.captureStream(30);
  const tracks = [...vStream.getVideoTracks()];
  let actx = null, dest = null;
  const stopAudio = async () => { try { await actx?.close(); } catch {} };
  try {
    actx = new AudioContext();
    dest = actx.createMediaStreamDestination();
    await mixAudio(actx, dest, audioEls);
    const at = dest.stream.getAudioTracks()[0];
    if (at) tracks.push(at);
    if (actx.state === 'suspended') await actx.resume().catch(() => {});
    const rec = makeRecorder(new MediaStream(tracks));
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((ok, no) => { rec.onstop = ok; rec.onerror = () => no(new Error('record')); });
    let running = true;
    const started = performance.now();
    const draw = () => {
      if (!running) return;
      const t = (performance.now() - started) / 1000;
      onFrame(t);
      onProgress(Math.min(1, t / durationSec));
      if (t >= durationSec - 0.04) { running = false; try { rec.stop(); } catch {} return; }
      requestAnimationFrame(draw);
    };
    rec.start(200);
    draw();
    const killer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, durationSec * 1000 + 1500);
    await stopped; clearTimeout(killer);
    running = false;
    const blob = finishBlob(chunks, rec);
    if (!blob.size) throw new Error('empty');
    await stopAudio();
    return { blob, mime: blob.type, duration: durationSec };
  } catch (e) {
    await stopAudio(); throw e;
  }
}

// يصدّر ديويتو: المصدر والمستخدم في شاشة مقسمة، مع مزج الصوت
export async function exportDuet(opts, onProgress = () => {}) {
  const { sourceUrl, userUrl, layout = 'lr', sourceSide = 'right', userStart = 0, userEnd, speed = 1, filter = 'none', texts = [], coverTime, volSource = 1, volUser = 1 } = opts;
  const source = await loadVideo(sourceUrl);
  const user = await loadVideo(userUrl);
  const u0 = Math.max(0, Math.min(userStart, (user.duration || 1) - 0.1));
  const u1 = Math.min(user.duration || u0 + 0.2, Math.max(u0 + 0.15, userEnd || user.duration || u0 + 0.2));
  const userWall = (u1 - u0) / Math.max(0.25, speed);
  const wall = Math.min(60, Math.max(userWall, 0.2));
  const W = 720, H = 1280;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rects = duetRects(layout, sourceSide, W, H);
  const sAud = document.createElement('video'); sAud.playsInline = true; sAud.preload = 'auto'; sAud.crossOrigin = 'anonymous'; sAud.src = sourceUrl; sAud.loop = true;
  const uAud = document.createElement('video'); uAud.playsInline = true; uAud.preload = 'auto'; uAud.crossOrigin = 'anonymous'; uAud.src = userUrl;
  await Promise.all([
    Promise.race([wait(sAud, 'canplay'), new Promise((ok) => setTimeout(ok, 4000))]),
    Promise.race([wait(uAud, 'canplay'), new Promise((ok) => setTimeout(ok, 4000))])
  ]);
  source.playbackRate = 1; user.playbackRate = speed; uAud.playbackRate = speed;
  await seek(user, u0); await seek(uAud, u0); await seek(source, 0); await seek(sAud, 0);
  await Promise.all([source.play().catch(() => {}), user.play().catch(() => {}), sAud.play().catch(() => {}), uAud.play().catch(() => {})]);
  const out = await recordCanvas(canvas, [{ el: sAud, vol: volSource }, { el: uAud, vol: volUser }], wall, () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    coverDraw(ctx, source, rects.source.x, rects.source.y, rects.source.w, rects.source.h, 'none');
    coverDraw(ctx, user, rects.user.x, rects.user.y, rects.user.w, rects.user.h, filter);
    paintTexts(ctx, W, H, texts);
    if (user.currentTime >= u1 - 0.05 || user.ended) { /* نكمل حتى wall إن كان المصدر أطول */ }
  }, onProgress);
  source.pause(); user.pause(); sAud.pause(); uAud.pause();
  const posterAt = Math.min(u1, Math.max(u0, coverTime ?? (u0 + (u1 - u0) / 2)));
  await seek(user, posterAt);
  coverDraw(ctx, source, rects.source.x, rects.source.y, rects.source.w, rects.source.h, 'none');
  coverDraw(ctx, user, rects.user.x, rects.user.y, rects.user.w, rects.user.h, filter);
  paintTexts(ctx, W, H, texts);
  const poster = canvas.toDataURL('image/jpeg', 0.82);
  [source, user, sAud, uAud].forEach((v) => { v.removeAttribute('src'); v.load(); });
  onProgress(1);
  return { ...out, poster };
}

// يصدّر ستيتش: مقطع المصدر (حتى 5 ثوانٍ) ثم تكملة المستخدم
export async function exportStitch(opts, onProgress = () => {}) {
  const { sourceUrl, userUrl, stitchStart = 0, stitchEnd, userStart = 0, userEnd, speed = 1, filter = 'none', texts = [], coverTime, volSource = 1, volUser = 1 } = opts;
  const source = await loadVideo(sourceUrl);
  const user = await loadVideo(userUrl);
  const s0 = Math.max(0, stitchStart);
  const s1 = Math.min(source.duration || 5, Math.max(s0 + 0.15, Math.min(s0 + 5, stitchEnd || s0 + 5)));
  const u0 = Math.max(0, Math.min(userStart, (user.duration || 1) - 0.1));
  const u1 = Math.min(user.duration || u0 + 0.2, Math.max(u0 + 0.15, userEnd || user.duration || u0 + 0.2));
  const srcDur = s1 - s0;
  const userWall = (u1 - u0) / Math.max(0.25, speed);
  const wall = Math.min(180, srcDur + userWall);
  const W = 720, H = 1280;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sAud = document.createElement('video'); sAud.playsInline = true; sAud.preload = 'auto'; sAud.crossOrigin = 'anonymous'; sAud.src = sourceUrl;
  const uAud = document.createElement('video'); uAud.playsInline = true; uAud.preload = 'auto'; uAud.crossOrigin = 'anonymous'; uAud.src = userUrl;
  await Promise.all([
    Promise.race([wait(sAud, 'canplay'), new Promise((ok) => setTimeout(ok, 4000))]),
    Promise.race([wait(uAud, 'canplay'), new Promise((ok) => setTimeout(ok, 4000))])
  ]);
  user.playbackRate = speed; uAud.playbackRate = speed;
  await seek(source, s0); await seek(sAud, s0);
  let userStarted = false;
  const startUser = async () => {
    if (userStarted) return; userStarted = true;
    await seek(user, u0); await seek(uAud, u0);
    await Promise.all([user.play().catch(() => {}), uAud.play().catch(() => {})]);
  };
  await Promise.all([source.play().catch(() => {}), sAud.play().catch(() => {})]);
  const out = await recordCanvas(canvas, [{ el: sAud, vol: volSource }, { el: uAud, vol: volUser }], wall, (t) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (t < srcDur) {
      coverDraw(ctx, source, 0, 0, W, H, 'none');
    } else {
      if (sAud && !sAud.paused) sAud.pause();
      if (!source.paused) source.pause();
      startUser();
      coverDraw(ctx, user, 0, 0, W, H, filter);
      paintTexts(ctx, W, H, texts);
    }
  }, onProgress);
  source.pause(); user.pause(); sAud.pause(); uAud.pause();
  const posterAt = Math.min(u1, Math.max(u0, coverTime ?? (u0 + (u1 - u0) / 2)));
  await seek(user, posterAt);
  coverDraw(ctx, user, 0, 0, W, H, filter);
  paintTexts(ctx, W, H, texts);
  const poster = canvas.toDataURL('image/jpeg', 0.82);
  [source, user, sAud, uAud].forEach((v) => { v.removeAttribute('src'); v.load(); });
  onProgress(1);
  return { ...out, poster };
}

export function blobToFile(blob, mime) {
  const { type, ext } = recordedType(mime || blob.type, blob.type, '', isWebKit());
  return new File([blob], `clipkat-${Date.now()}.${ext}`, { type });
}
