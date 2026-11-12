// أدوات مشتركة للبث المباشر والمكالمات (© 2026 وطن النهار)
// - تحميل مكتبة LiveKit عند الحاجة فقط (≈600KB لا تُحمَّل لمن لا يستخدم الميزتين)
// - فتح الصوت على iPhone عند أول لمسة، نغمة الرنين، وطلب الكاميرا/المايك
import { api } from './services/index.js';
import { fixTurnTls } from './turn-port.js';

const LK_SRC = '/vendor/livekit-client.umd.js?v=2.24.0';
let lkP = null;
// LiveKit يعلن خادم TURN/TLS دائماً على المنفذ 443 (يفترض موزّع أحمال أمامه)، بينما يعمل لدينا على منفذ مستقل
// (5349) لأن 443 يخدم الموقع عبر Caddy. نصحّح المنفذ في إعدادات RTCPeerConnection قبل تحميل المكتبة.
let turnPort = 5349;
function patchTurnPort() {
  const PC = window.RTCPeerConnection; if (!PC || PC.__ckTurn || turnPort === 443) return;
  const fix = (cfg) => fixTurnTls(cfg, turnPort);
  function CKPeerConnection(cfg, ...rest) { return new PC(fix(cfg), ...rest); }
  CKPeerConnection.prototype = PC.prototype; Object.setPrototypeOf(CKPeerConnection, PC); CKPeerConnection.__ckTurn = true;
  const sc = PC.prototype.setConfiguration; if (sc) PC.prototype.setConfiguration = function (c) { return sc.call(this, fix(c)); };
  window.RTCPeerConnection = CKPeerConnection;
}
export function loadLK() {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  return (lkP ||= rtcConfig().then((c) => { if (c.turnTlsPort) turnPort = c.turnTlsPort; patchTurnPort(); }).then(() => new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = LK_SRC; s.async = true;
    s.onload = () => ok(window.LivekitClient); s.onerror = () => { lkP = null; s.remove(); no(new Error('lkLoad')); };
    document.head.append(s);
  })));
}
export const rq = (method, path, body, opts) => api._req(method, path, body, opts);
let cfgP = null;
export function rtcConfig() {
  if (!api.social || typeof api._req !== 'function') return Promise.resolve({ enabled: false });
  return (cfgP ||= rq('GET', '/rtc/config').catch(() => { cfgP = null; return { enabled: false }; }));
}

// ---- الصوت على iOS: يجب إنشاء/استئناف AudioContext من داخل لمسة ----
let actx = null;
export function audioCtx() { return actx; }
export function unlockAudio() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    // نغمة صامتة قصيرة تفتح مسار الصوت على سفاري
    const b = actx.createBuffer(1, 1, 22050); const s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(0);
  } catch { /* لا WebAudio */ }
}
if (typeof document !== 'undefined') {
  const once = () => { unlockAudio(); if (actx && actx.state === 'running') { document.removeEventListener('pointerdown', once, true); document.removeEventListener('keydown', once, true); } };
  document.addEventListener('pointerdown', once, true); document.addEventListener('keydown', once, true);
}

// نغمة رنين (وارد) أو نغمة انتظار (صادر) مولّدة بـ WebAudio — بدون ملفات صوتية
export function tone(kind = 'ring') {
  let stopped = false, timer = null;
  const play = () => {
    if (stopped) return;
    try {
      unlockAudio(); const c = actx; if (!c || c.state !== 'running') { navigator.vibrate?.([400, 200, 400]); return; }
      const beeps = kind === 'ring' ? [[0, 0.35, 880, 660], [0.5, 0.35, 880, 660]] : [[0, 1.0, 440, 480]];
      for (const [at, dur, f1, f2] of beeps) {
        const g = c.createGain(); g.gain.value = 0; g.connect(c.destination);
        const t0 = c.currentTime + at;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(kind === 'ring' ? 0.18 : 0.08, t0 + 0.02); g.gain.setValueAtTime(kind === 'ring' ? 0.18 : 0.08, t0 + dur - 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur);
        for (const f of [f1, f2]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t0); o.stop(t0 + dur); }
      }
      if (kind === 'ring') navigator.vibrate?.([300, 200, 300]);
    } catch { /* تجاهل */ }
  };
  play(); timer = setInterval(play, kind === 'ring' ? 2200 : 3000);
  return () => { stopped = true; clearInterval(timer); navigator.vibrate?.(0); };
}

// طلب الكاميرا/المايك (يُستدعى من داخل لمسة لأجل iOS)
export async function getMedia({ video = true, audio = true, facing = 'user' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('noMedia'), { name: 'NotSupportedError' });
  const v = video ? { facingMode: facing, width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 1280 }, frameRate: { ideal: 30, max: 30 } } : false;
  const a = audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false;
  try { return await navigator.mediaDevices.getUserMedia({ video: v, audio: a }); }
  catch (e) {
    if (video && /Overconstrained|NotReadable/i.test(e.name)) return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: a });
    throw e;
  }
}
// فيديو يعمل على iPhone داخل الصفحة بدون ملء الشاشة
export function inlineVideo(el, { muted = true } = {}) {
  el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.playsInline = true; el.autoplay = true; el.muted = muted; if (muted) el.setAttribute('muted', '');
  return el;
}
export const fmtDur = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

// شاشة مضاءة أثناء البث/المكالمة
export async function keepAwake() {
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* غير مدعوم */ }
  return () => { try { lock?.release(); } catch {} };
}
