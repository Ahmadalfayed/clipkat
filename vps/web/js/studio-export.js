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

export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
}
export const recorderSupported = () => typeof MediaRecorder !== 'undefined' && !!pickRecorderMime();

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
  const mime = pickRecorderMime();
  if (!mime) throw new Error('noRecorder');
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

    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 2_500_000 });
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
    const blob = new Blob(chunks, { type: rec.mimeType || mime });
    if (!blob.size) throw new Error('empty');
    const posterAt = Math.min(t1, Math.max(t0, coverTime ?? (t0 + (t1 - t0) / 2)));
    const poster = await captureFrame(video, posterAt, { filter, texts });
    onProgress(1);
    await stopAudio();
    video.removeAttribute('src'); video.load(); vAud.removeAttribute('src'); vAud.load();
    return { blob, mime: blob.type || mime, poster, duration: wall };
  } catch (e) {
    await stopAudio(); throw e;
  }
}

export function blobToFile(blob, mime) {
  const ext = /mp4/i.test(mime) ? 'mp4' : 'webm';
  return new File([blob], `clipkat-${Date.now()}.${ext}`, { type: mime || blob.type });
}
