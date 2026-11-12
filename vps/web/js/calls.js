// المكالمات الصوتية/المرئية 1:1 + الأحداث الفورية (SSE) — © 2026 وطن النهار
// تعمل ما دام الموقع مفتوحاً (بدون إشعارات Push). الواجهة طبقة فوق الصفحة فلا تنقطع المكالمة عند التنقل.
import { t } from './i18n.js';
import { icon, esc, toast, avatarOf } from './ui.js';
import { loadLK, rq, rtcConfig, getMedia, inlineVideo, fmtDur, tone, unlockAudio, keepAwake } from './rtc.js';

let es = null, esUser = null, ctxRef = null;
let call = null;        // المكالمة الحالية
const listeners = new Set();
export const onRtcEvent = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// يُستدعى بعد كل تنقل: يفتح/يغلق قناة الأحداث حسب حالة الدخول
export async function initRealtime(ctx) {
  ctxRef = ctx;
  const me = ctx.me?.id || null;
  if (me === esUser && es) return;
  if (es) { es.close(); es = null; esUser = null; }
  if (!me) return;
  const cfg = await rtcConfig(); if (!cfg.enabled || typeof EventSource === 'undefined') return;
  esUser = me; es = new EventSource('/api/events');
  const on = (type, fn) => es.addEventListener(type, (e) => { let d = null; try { d = JSON.parse(e.data); } catch { return; } fn(d); listeners.forEach((l) => l(type, d)); });
  on('call', (d) => incoming(d));
  on('call-accepted', (d) => { if (call && call.id === d.id && call.outgoing) call.onAccepted(); });
  on('call-handled', (d) => { if (call && call.id === d.id && !call.outgoing && !call.accepting) closeCall(''); });   // رُدّ عليها من تبويب/جهاز آخر
  on('call-end', (d) => { if (call && call.id === d.id) closeCall(d.status === 'declined' ? (call.outgoing ? t('callDeclined') : '') : d.status === 'missed' ? (call.outgoing ? t('callNoAnswer') : '') : d.status === 'cancelled' ? '' : t('callEnded')); });
  on('live', (d) => { const n = d.live?.host?.name || ''; toastLink(t('liveStartedToast', { name: n }), `#/live/${d.live.id}`); });
  on('live-saved', (d) => { if (d.videoId) toastLink(t('liveSavedOk'), `#/watch/${d.videoId}`); else toast(t('liveSaveFail'), 'err'); });
}
function toastLink(msg, href) {
  const a = document.createElement('a'); a.className = 'rt-toast'; a.href = href; a.textContent = msg;
  document.body.append(a); requestAnimationFrame(() => a.classList.add('in'));
  const kill = () => { a.classList.remove('in'); setTimeout(() => a.remove(), 300); };
  a.addEventListener('click', kill); setTimeout(kill, 6000);
}

// ---------- الواجهة ----------
function overlay(peer, kind, sub) {
  const o = document.createElement('div'); o.className = 'call-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.dataset.kind = kind;
  o.innerHTML = `<video class="call-remote" id="callRemote"></video><video class="call-local mirror" id="callLocal" hidden></video>
    <div class="call-info"><img class="av xl" src="${avatarOf(peer)}" alt=""><h2>${esc(peer.name)} <span class="peer-mic" aria-label="${esc(t('mute'))}">${icon('micOff', { size: 18 })}</span></h2><p class="call-sub" id="callSub">${esc(sub)}</p></div>
    <button class="call-unmute" id="callUnmute" hidden>${icon('volOn', { size: 18 })} ${esc(t('tapForSound'))}</button>
    <div class="call-ctrls" id="callCtrls"></div>`;
  document.body.append(o); document.documentElement.classList.add('in-call');
  inlineVideo(o.querySelector('#callRemote'), { muted: true }); inlineVideo(o.querySelector('#callLocal'), { muted: true });
  return o;
}
const ctrl = (id, ic, label, cls = '') => `<button class="call-btn ${cls}" id="${id}" aria-label="${esc(label)}">${icon(ic, { size: 26 })}<span>${esc(label)}</span></button>`;
function setSub(txt) { const s = call?.ov.querySelector('#callSub'); if (s) s.textContent = txt; }

async function joinRoom(url, token) {
  const LK = await loadLK(); const c = call; if (!c) return;
  const room = new LK.Room({ adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: false, videoEncoding: LK.VideoPresets.h720.encoding, dtx: true, red: true } });
  c.room = room; c.LK = LK;
  const remote = c.ov.querySelector('#callRemote');
  room.on(LK.RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === 'video') { track.attach(remote); remote.play().catch(() => {}); c.ov.classList.add('has-remote-video'); }
    else { const a = track.attach(); a.setAttribute('playsinline', ''); c.ov.append(a); c.audioEl = a; a.play().catch(() => {}); checkAudio(); }
    if (!c.started) startTimer();
  });
  room.on(LK.RoomEvent.TrackUnsubscribed, (track) => { track.detach(); if (track.kind === 'video') c.ov.classList.remove('has-remote-video'); });
  room.on(LK.RoomEvent.TrackMuted, (pub, p) => { if (p.isLocal) return; if (pub.kind === 'video') c.ov.classList.remove('has-remote-video'); else c.ov.classList.add('peer-muted'); });
  room.on(LK.RoomEvent.TrackUnmuted, (pub, p) => { if (p.isLocal) return; if (pub.kind === 'video') c.ov.classList.add('has-remote-video'); else c.ov.classList.remove('peer-muted'); });
  room.on(LK.RoomEvent.ParticipantConnected, () => { if (!c.started) setSub(t('callConnecting')); });
  room.on(LK.RoomEvent.ParticipantDisconnected, () => { if (c.started) setSub(t('reconnecting')); });
  room.on(LK.RoomEvent.AudioPlaybackStatusChanged, checkAudio);
  room.on(LK.RoomEvent.Reconnecting, () => setSub(t('reconnecting')));
  room.on(LK.RoomEvent.Reconnected, () => setSub(c.started ? fmtDur((Date.now() - c.started) / 1000) : ''));
  room.on(LK.RoomEvent.Disconnected, () => { if (call === c && !c.closing) hangup(); });
  await room.connect(url, token);
  for (const tr of c.stream.getTracks()) {
    const pub = await room.localParticipant.publishTrack(tr, { source: tr.kind === 'video' ? LK.Track.Source.Camera : LK.Track.Source.Microphone });
    if (tr.kind === 'video') c.vpub = pub; else c.apub = pub;
  }
  c.joined = true;
}
function checkAudio() { const c = call; if (!c) return; const b = c.ov.querySelector('#callUnmute'); b.hidden = !c.room || c.room.canPlaybackAudio; }
function startTimer() {
  const c = call; if (!c || c.started) return; c.started = Date.now(); c.stopTone?.(); c.stopTone = null;
  c.ov.classList.add('connected'); setSub('0:00');
  c.tick = setInterval(() => { if (c.room?.remoteParticipants.size) setSub(fmtDur((Date.now() - c.started) / 1000)); }, 1000);
}
function inCallControls() {
  const c = call; const box = c.ov.querySelector('#callCtrls');
  box.innerHTML = ctrl('cMute', 'mic', t('mute')) + ctrl('cCam', c.camOn ? 'video' : 'videoOff', c.camOn ? t('camOff') : t('camOn')) + ctrl('cFlip', 'flip', t('flipCam')) + ctrl('cEnd', 'phoneDown', t('endCall'), 'end');
  box.querySelector('#cFlip').hidden = !c.camOn;
  box.querySelector('#cMute').onclick = async (e) => {
    c.muted = !c.muted; const b = e.currentTarget;
    try { if (c.apub?.track) await (c.muted ? c.apub.track.mute() : c.apub.track.unmute()); else c.stream.getAudioTracks().forEach((x) => { x.enabled = !c.muted; }); } catch {}
    b.classList.toggle('on', c.muted); b.innerHTML = `${icon(c.muted ? 'micOff' : 'mic', { size: 26 })}<span>${esc(c.muted ? t('unmute') : t('mute'))}</span>`;
  };
  box.querySelector('#cCam').onclick = () => toggleCam();
  box.querySelector('#cFlip').onclick = () => flipCam();
  box.querySelector('#cEnd').onclick = () => hangup();
}
async function toggleCam() {
  const c = call; if (!c) return;
  const local = c.ov.querySelector('#callLocal');
  try {
    if (c.camOn) { await c.vpub?.track?.mute(); c.camOn = false; local.hidden = true; }
    else if (c.vpub?.track) { await c.vpub.track.unmute(); c.camOn = true; local.hidden = false; }
    else {   // مكالمة صوتية: نضيف الكاميرا عند الطلب
      const s = await getMedia({ video: true, audio: false, facing: c.facing }); const tr = s.getVideoTracks()[0];
      c.stream.addTrack(tr); local.srcObject = new MediaStream([tr]); local.hidden = false; local.play().catch(() => {});
      if (c.room) c.vpub = await c.room.localParticipant.publishTrack(tr, { source: c.LK.Track.Source.Camera });
      c.camOn = true;
    }
  } catch { toast(t('camDenied'), 'err'); }
  inCallControls();
}
async function flipCam() {
  const c = call; if (!c?.camOn) return;
  c.facing = c.facing === 'user' ? 'environment' : 'user';
  try {
    const s = await getMedia({ video: true, audio: false, facing: c.facing }); const nt = s.getVideoTracks()[0];
    const old = c.stream.getVideoTracks()[0];
    if (c.vpub?.track) await c.vpub.track.replaceTrack(nt, true);
    if (old) { c.stream.removeTrack(old); old.stop(); } c.stream.addTrack(nt);
    const local = c.ov.querySelector('#callLocal'); local.srcObject = new MediaStream([nt]); local.classList.toggle('mirror', c.facing === 'user'); local.play().catch(() => {});
  } catch { c.facing = c.facing === 'user' ? 'environment' : 'user'; toast(t('camDenied'), 'err'); }
}
async function acquire(kind) {
  try { return await getMedia({ video: kind === 'video', audio: true }); }
  catch (e) { if (kind === 'video') { try { return await getMedia({ video: false, audio: true }); } catch {} } toast(t('micDenied'), 'err'); return null; }
}
function showLocal() {
  const c = call; const v = c.stream.getVideoTracks()[0]; const local = c.ov.querySelector('#callLocal');
  if (v) { local.srcObject = new MediaStream([v]); local.hidden = false; local.play().catch(() => {}); }
  c.camOn = !!v;
}

// ---------- صادر ----------
export async function startCall(peer, kind = 'audio') {
  if (call) return;
  unlockAudio();
  const cfg = await rtcConfig(); if (!cfg.enabled) { toast(t('liveOff'), 'err'); return; }
  const stream = await acquire(kind); if (!stream) return;
  call = { id: null, peer, kind, outgoing: true, stream, facing: 'user', ov: overlay(peer, kind, t('calling')) };
  const c = call; c.release = await keepAwake();
  c.ov.querySelector('#callCtrls').innerHTML = ctrl('cEnd', 'phoneDown', t('endCall'), 'end');
  c.ov.querySelector('#cEnd').onclick = () => hangup();
  showLocal();
  c.onAccepted = () => { setSub(t('callConnecting')); c.stopTone?.(); c.stopTone = null; };
  try {
    const r = await rq('POST', '/calls', { to: peer.id, kind });
    if (call !== c) { rq('POST', `/calls/${r.call.id}/cancel`).catch(() => {}); return; }
    c.id = r.call.id; c.stopTone = tone('ringback');
    setSub(r.delivered ? t('ringing') : t('calling'));
    if (!r.delivered) toast(t('callOffline'));
    inCallControls();
    await joinRoom(r.url, r.token);
  } catch (e) {
    console.warn(e);
    closeCall(e.status === 409 ? t('callBusy') : e.message === 'notAllowed' ? t('callNotAllowed') : e.message === 'blocked' ? t('callBlocked') : t('callFail'));
  }
}

// ---------- وارد ----------
function incoming({ call: info, from }) {
  if (call) { if (call.id !== info.id) rq('POST', `/calls/${info.id}/decline`).catch(() => {}); return; }   // مشغول بمكالمة أخرى
  call = { id: info.id, peer: from, kind: info.kind, outgoing: false, facing: 'user', ov: overlay(from, info.kind, info.kind === 'video' ? t('incomingVideo') : t('incomingVoice')) };
  const c = call; c.ov.classList.add('ringing');
  c.stopTone = tone('ring');
  c.ov.querySelector('#callCtrls').innerHTML = ctrl('cDecline', 'phoneDown', t('declineCall'), 'end') + ctrl('cAccept', info.kind === 'video' ? 'video' : 'phone', t('acceptCall'), 'accept');
  c.ov.querySelector('#cDecline').onclick = async () => { const id = c.id; closeCall(''); await rq('POST', `/calls/${id}/decline`).catch(() => {}); };
  c.ov.querySelector('#cAccept').onclick = async () => {
    unlockAudio(); c.accepting = true; c.stopTone?.(); c.stopTone = null; c.ov.classList.remove('ringing');
    const stream = await acquire(c.kind); if (!stream) { const id = c.id; closeCall(''); rq('POST', `/calls/${id}/decline`).catch(() => {}); return; }
    if (call !== c) { stream.getTracks().forEach((x) => x.stop()); return; }
    c.stream = stream; c.release = await keepAwake(); showLocal(); setSub(t('callConnecting')); inCallControls();
    try { const r = await rq('POST', `/calls/${c.id}/accept`); await joinRoom(r.url, r.token); }
    catch (e) { console.warn(e); closeCall(e.status === 410 ? t('callEnded') : t('callFail')); }
  };
}

// ---------- إنهاء ----------
export async function hangup() {
  const c = call; if (!c) return;
  const id = c.id;
  closeCall(t('callEnded'));
  if (id) await rq('POST', `/calls/${id}/end`).catch(() => {});
}
function closeCall(msg) {
  const c = call; if (!c) return; call = null; c.closing = true;
  c.stopTone?.(); clearInterval(c.tick); c.release?.();
  try { c.room?.disconnect(); } catch {}
  c.stream?.getTracks().forEach((x) => x.stop());
  if (msg) { setSubOn(c, msg); c.ov.classList.add('closing'); setTimeout(() => remove(c), 1600); } else remove(c);
}
function setSubOn(c, txt) { const s = c.ov.querySelector('#callSub'); if (s) s.textContent = txt; c.ov.querySelector('#callCtrls').innerHTML = ''; }
function remove(c) { c.ov.remove(); if (!call) document.documentElement.classList.remove('in-call'); }
document.addEventListener('click', (e) => {
  if (e.target.closest('#callUnmute')) { unlockAudio(); call?.room?.startAudio().then(checkAudio).catch(() => {}); call?.audioEl?.play().catch(() => {}); }
});

// ---------- أزرار الاتصال في الملف الشخصي والمحادثة ----------
export async function callButtons(peer) {
  const cfg = await rtcConfig(); if (!cfg.enabled) return '';
  const r = await rq('GET', `/calls/can/${peer.id}`).catch(() => null); if (!r?.can) return '';
  return `<button class="icon-btn" data-call="audio" aria-label="${esc(t('voiceCall'))}" title="${esc(t('voiceCall'))}">${icon('phone', { size: 20 })}</button><button class="icon-btn" data-call="video" aria-label="${esc(t('videoCall'))}" title="${esc(t('videoCall'))}">${icon('video', { size: 20 })}</button>`;
}
export function wireCallButtons(root, peer) {
  root.querySelectorAll('[data-call]').forEach((b) => b.addEventListener('click', () => startCall(peer, b.dataset.call)));
}
export const currentCall = () => call;
