// © 2026 وطن النهار — خلفيات الأماكن الشهيرة أثناء التصوير: فصل الشخص عن الخلفية داخل الجهاز (MediaPipe، مجاني ومستضاف ذاتياً)
// ثم دمجه فوق صورة القالب مع تأثيرات متحركة خفيفة (نار، نجوم، غيوم، ثلج) على لوحة canvas تُسجَّل مع صوت المايك.
const BASE = '/vendor/mediapipe/';
const W = 720, H = 1280;   // نفس دقة التسجيل الحالية (عمودي)

export const BG_TEMPLATES = [
  { id: 'riyadh', ar: 'الرياض', en: 'Riyadh', fx: ['clouds'] },
  { id: 'newyork', ar: 'نيويورك', en: 'New York', fx: ['clouds', 'citylights'] },
  { id: 'eiffel', ar: 'برج إيفل', en: 'Eiffel Tower', fx: ['clouds'] },
  { id: 'everest', ar: 'جبل إيفرست', en: 'Mount Everest', fx: ['snow'] },
  { id: 'emptyquarter', ar: 'الربع الخالي', en: 'Empty Quarter', fx: ['sand'] },
  { id: 'burjkhalifa', ar: 'برج خليفة', en: 'Burj Khalifa', fx: ['citylights'] },
  { id: 'sinai', ar: 'سهرة مع البدو في سيناء', en: 'Bedouin night in Sinai', fx: ['stars', 'fire'], fire: { x: 0.205, y: 0.735, s: 0.8 }, starsTop: 0.38 },
  { id: 'starnight', ar: 'صحراء ليلية بالنجوم', en: 'Starry desert night', fx: ['stars', 'shooting'], starsTop: 0.68 }
];
export const bgImageUrl = (id) => `/media/bg/${id}.webp`;
export const bgThumbUrl = (id) => `/media/bg/${id}-thumb.webp`;

// كشف دعم الميزة: WebAssembly + SIMD (MediaPipe 1.2 يحتاجه — سفاري 16.4+) + تسجيل لوحة canvas
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function bgSupport() {
  try {
    if (typeof WebAssembly !== 'object' || !WebAssembly.validate(SIMD)) return { ok: false, reason: 'wasm' };
    if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return { ok: false, reason: 'capture' };
    if (typeof MediaRecorder === 'undefined') return { ok: false, reason: 'recorder' };
    const c = document.createElement('canvas');
    if (!c.getContext('2d')) return { ok: false, reason: 'canvas' };
    return { ok: true };
  } catch { return { ok: false, reason: 'error' }; }
}

// ---------- المقطِّع (يُحمَّل مرة واحدة لكل الصفحة) ----------
let segPromise = null;
async function loadSegmenter() {
  const { ImageSegmenter } = await import(BASE + 'vision_bundle.mjs');
  const fileset = { wasmLoaderPath: BASE + 'wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + 'wasm/vision_wasm_internal.wasm' };
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: BASE + 'selfie_segmenter.tflite', delegate }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
  try { return await ImageSegmenter.createFromOptions(fileset, opts('GPU')); }
  catch (e) { console.warn('[bg] GPU delegate failed, using CPU', e); return ImageSegmenter.createFromOptions(fileset, opts('CPU')); }
}
export function preloadSegmenter() { segPromise ||= loadSegmenter().catch((e) => { segPromise = null; throw e; }); return segPromise; }

const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok, no) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => { imgCache.delete(src); no(new Error('bgImage')); }; i.src = src; }));
  return imgCache.get(src);
}

// رسم مصدر بنمط cover داخل W×H (مع عكس أفقي للكاميرا الأمامية)
function drawCover(ctx, src, sw, sh, mirror) {
  const s = Math.max(W / sw, H / sh), dw = sw * s, dh = sh * s;
  ctx.save();
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();
}

// مولّد عشوائي ثابت (نفس النجوم في كل مرة)
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- التأثيرات المتحركة ----------
function makeFx(tpl) {
  const r = rng(tpl.id.length * 7919 + 13);
  const fx = new Set(tpl.fx || []);
  const stars = fx.has('stars') ? Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H * (tpl.starsTop || 0.5), s: 0.6 + r() * 1.4, p: r() * 6.28, v: 0.8 + r() * 2.2 })) : [];
  const lights = fx.has('citylights') ? Array.from({ length: 40 }, () => ({ x: r() * W, y: H * (0.5 + r() * 0.3), p: r() * 6.28, v: 1 + r() * 3 })) : [];
  const snow = fx.has('snow') ? Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * H, s: 1 + r() * 2.6, v: 30 + r() * 70, d: r() * 6.28 })) : [];
  const sand = fx.has('sand') ? Array.from({ length: 60 }, () => ({ x: r() * W, y: H * (0.45 + r() * 0.5), l: 10 + r() * 40, v: 40 + r() * 120, a: 0.05 + r() * 0.12 })) : [];
  const embers = fx.has('fire') ? Array.from({ length: 26 }, () => ({ t0: r() * 3, dx: (r() - 0.5) * 40, life: 1.4 + r() * 1.6, s: 1 + r() * 2 })) : [];
  let cloud = null;
  if (fx.has('clouds')) {
    cloud = document.createElement('canvas'); cloud.width = 360; cloud.height = 140;
    const c = cloud.getContext('2d');
    for (let i = 0; i < 9; i++) { const x = 60 + i * 30 + (r() - 0.5) * 30, y = 70 + (r() - 0.5) * 36, rad = 40 + r() * 34; const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 360, 140); }
  }
  const clouds = cloud ? Array.from({ length: 3 }, (_, i) => ({ x: r() * W, y: H * (0.06 + i * 0.1), s: 0.8 + r() * 0.8, v: 6 + r() * 10, a: 0.25 + r() * 0.2 })) : [];
  let lastShoot = 0, shoot = null;

  return function drawFx(ctx, t) {
    if (clouds.length) for (const c of clouds) { const w = 360 * c.s; const x = ((c.x + t * c.v) % (W + w)) - w; ctx.globalAlpha = c.a; ctx.drawImage(cloud, x, c.y, w, 140 * c.s); ctx.globalAlpha = 1; }
    for (const s of stars) { const a = 0.25 + 0.75 * Math.abs(Math.sin(t * s.v + s.p)); ctx.fillStyle = `rgba(255,255,240,${a.toFixed(3)})`; ctx.fillRect(s.x, s.y, s.s, s.s); }
    for (const l of lights) { const a = Math.max(0, Math.sin(t * l.v + l.p)) * 0.55; if (a > 0.05) { ctx.fillStyle = `rgba(255,220,150,${a.toFixed(3)})`; ctx.fillRect(l.x, l.y, 2, 2); } }
    if (fx.has('shooting')) {
      if (!shoot && t - lastShoot > 5 + (Math.sin(t) + 1) * 2) { shoot = { t0: t, x: W * (0.2 + 0.6 * Math.abs(Math.sin(t * 3.1))), y: H * (0.05 + 0.2 * Math.abs(Math.cos(t * 1.7))) }; lastShoot = t; }
      if (shoot) {
        const k = (t - shoot.t0) / 0.9; if (k > 1) shoot = null;
        else { const x = shoot.x - k * 260, y = shoot.y + k * 120; const g = ctx.createLinearGradient(x, y, x + 90, y - 42); g.addColorStop(0, `rgba(255,255,255,${(1 - k).toFixed(2)})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y - 42); ctx.stroke(); }
      }
    }
    for (const p of snow) { const y = (p.y + t * p.v) % H; const x = (p.x + Math.sin(t * 0.8 + p.d) * 18 + t * 12) % W; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x, y, p.s, 0, 6.283); ctx.fill(); }
    for (const p of sand) { const x = ((p.x + t * p.v) % (W + p.l)) - p.l; ctx.fillStyle = `rgba(255,214,160,${p.a})`; ctx.fillRect(x, p.y, p.l, 1.2); }
    if (tpl.fire) {
      const fx0 = tpl.fire.x * W, fy0 = tpl.fire.y * H, S = tpl.fire.s * 60;
      const flick = 0.75 + 0.15 * Math.sin(t * 13) + 0.1 * Math.sin(t * 29 + 1.3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // توهج النار على الرمل
      let g = ctx.createRadialGradient(fx0, fy0, 0, fx0, fy0, S * 5 * flick);
      g.addColorStop(0, `rgba(255,150,40,${(0.35 * flick).toFixed(3)})`); g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = g; ctx.fillRect(fx0 - S * 6, fy0 - S * 6, S * 12, S * 12);
      // ألسنة اللهب
      for (let i = 0; i < 5; i++) {
        const ox = (i - 2) * S * 0.22 + Math.sin(t * 7 + i) * S * 0.06;
        const h = S * (0.9 + 0.35 * Math.sin(t * (9 + i * 2.3) + i)) * (i === 2 ? 1.4 : 1);
        g = ctx.createRadialGradient(fx0 + ox, fy0 - h * 0.35, 0, fx0 + ox, fy0 - h * 0.35, h * 0.6);
        g.addColorStop(0, 'rgba(255,240,170,0.55)'); g.addColorStop(0.45, 'rgba(255,150,40,0.35)'); g.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx0 + ox, fy0 - h * 0.35, S * 0.22, h * 0.6, 0, 0, 6.283); ctx.fill();
      }
      // شرر يتصاعد
      for (const e of embers) {
        const k = ((t + e.t0) % e.life) / e.life;
        const x = fx0 + e.dx * k + Math.sin((t + e.t0) * 4) * 6, y = fy0 - S * 0.4 - k * S * 3.2;
        ctx.fillStyle = `rgba(255,${170 + Math.round(60 * (1 - k))},60,${(1 - k).toFixed(2)})`; ctx.fillRect(x, y, e.s, e.s);
      }
      ctx.restore();
    }
  };
}

// ---------- المحرّك ----------
// video: عنصر الكاميرا (يبقى يعمل حتى لو كان مخفياً بصرياً)، canvas: لوحة المعاينة/التسجيل
export function createBgEngine({ video, canvas, onError } = {}) {
  canvas.width = W; canvas.height = H;
  const out = canvas.getContext('2d', { alpha: false });
  const person = document.createElement('canvas'); person.width = W; person.height = H;
  const pctx = person.getContext('2d');
  const mask = document.createElement('canvas');
  const fc = document.createElement('canvas'); const fctx = fc.getContext('2d');   // نسخة الإطار: نفس الإطار يُقطَّع ويُرسم (لا انزياح بين القناع والصورة)
  let mctx = null, mdata = null, prevA = null;
  let seg = null, tpl = null, img = null, fxDraw = null, mirror = true;
  let running = false, raf = 0, lastDraw = 0, lastVT = -1, skip = false, segMs = 0, frames = 0, fpsT = performance.now(), fps = 0;
  const t0 = performance.now();

  function buildMask(cm) {
    const mw = cm.width, mh = cm.height, conf = cm.getAsFloat32Array();
    if (!mctx || mask.width !== mw || mask.height !== mh) { mask.width = mw; mask.height = mh; mctx = mask.getContext('2d', { willReadFrequently: true }); mdata = mctx.createImageData(mw, mh); prevA = new Float32Array(mw * mh); }
    const n = mw * mh, a = new Float32Array(n);   // عتبة 0.42–0.85: هالة أقل حول الشعر
    for (let i = 0; i < n; i++) { let c = (conf[i] - 0.42) / 0.43; c = c < 0 ? 0 : c > 1 ? 1 : c; a[i] = c * c * (3 - 2 * c); }   // smoothstep لحواف ناعمة
    // تنعيم بسيط 3×3 (أفقي ثم عمودي) — «تريش» الحواف بدون ctx.filter (غير مدعوم في سفاري)
    const b = new Float32Array(n);
    for (let y = 0; y < mh; y++) { const o = y * mw; for (let x = 0; x < mw; x++) { const l = x ? a[o + x - 1] : a[o + x], r = x < mw - 1 ? a[o + x + 1] : a[o + x]; b[o + x] = (l + a[o + x] * 2 + r) / 4; } }
    const d = mdata.data;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const i = y * mw + x, u = y ? b[i - mw] : b[i], dn = y < mh - 1 ? b[i + mw] : b[i];
      const v = (u + b[i] * 2 + dn) / 4, sm = prevA[i] * 0.2 + v * 0.8;   // تنعيم زمني يقلل الارتعاش
      prevA[i] = sm; d[i * 4 + 3] = sm * 255;
    }
    mctx.putImageData(mdata, 0, 0);
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    if (now - lastDraw < 30) return;   // ~30 إطاراً كحد أقصى
    if (!video.videoWidth || video.readyState < 2) return;
    lastDraw = now;
    try {
      const vt = video.currentTime;
      if (seg && vt !== lastVT && !(skip && (frames & 1))) {
        const s0 = performance.now();
        const k = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        const fw = Math.round(video.videoWidth * k), fh = Math.round(video.videoHeight * k);
        if (fc.width !== fw || fc.height !== fh) { fc.width = fw; fc.height = fh; }
        fctx.drawImage(video, 0, 0, fw, fh);
        seg.segmentForVideo(fc, now, (res) => { const cm = res.confidenceMasks?.[0]; if (cm) buildMask(cm); });
        segMs = segMs * 0.9 + (performance.now() - s0) * 0.1;
        skip = segMs > 40;   // جهاز أبطأ: نُقسّم كل إطارين ونُعيد استخدام القناع
      }
      lastVT = vt;
      if (img) drawCover(out, img, img.naturalWidth, img.naturalHeight, false); else { out.fillStyle = '#000'; out.fillRect(0, 0, W, H); }
      fxDraw?.(out, (now - t0) / 1000);
      if (mctx) {
        pctx.globalCompositeOperation = 'source-over'; pctx.clearRect(0, 0, W, H);
        drawCover(pctx, fc, fc.width, fc.height, mirror);
        pctx.globalCompositeOperation = 'destination-in';
        pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
        drawCover(pctx, mask, mask.width, mask.height, mirror);
        pctx.globalCompositeOperation = 'source-over';
        out.drawImage(person, 0, 0);
      }
      frames++;
      if (now - fpsT >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; canvas.dataset.fps = fps; }
    } catch (e) { console.warn('[bg] frame failed', e); stop(); onError?.(e); }
  }
  function start() { if (running) return; running = true; lastVT = -1; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  return {
    get template() { return tpl?.id || null; },
    get fps() { return fps; },
    async setTemplate(id) {
      if (!id) { tpl = null; img = null; fxDraw = null; stop(); return; }
      const next = BG_TEMPLATES.find((x) => x.id === id); if (!next) return;
      const [s, im] = await Promise.all([preloadSegmenter(), loadImg(bgImageUrl(id))]);
      seg = s; tpl = next; img = im; fxDraw = makeFx(next); start();
    },
    setMirror(m) { mirror = !!m; prevA?.fill(0); },
    stream(fpsCap = 30) { return canvas.captureStream(fpsCap); },
    stop
  };
}
