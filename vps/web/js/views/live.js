// البث المباشر: صفحة المضيف (#/golive) وصفحة المشاهد (#/live/:id) — © 2026 وطن النهار
import { t, lang } from '../i18n.js';
import { icon, esc, $, toast, openSheet, avatarOf } from '../ui.js';
import { loadLK, rq, rtcConfig, getMedia, inlineVideo, fmtDur, keepAwake, unlockAudio } from '../rtc.js';
import { makeRecorder, finishBlob, recorderSupported } from '../studio-export.js';
import { showGiftFx, renderTop, topChipHTML, openTopSheet, openGiftTray, fmtInt } from '../gifts.js';

const SEG_SEC = 60;            // تسجيل محلي متدحرج: مقاطع دقيقة واحدة، نحتفظ بما يغطي آخر 3 دقائق
const HEART_FLUSH_MS = 800;

export async function render(el, params, ctx) {
  const cfg = await rtcConfig();
  if (!cfg.enabled) { el.innerHTML = `<div class="page"><p class="empty">${esc(t('liveOff'))}</p><p class="center"><a class="btn" href="#/feed">${esc(t('home'))}</a></p></div>`; return; }
  return params.name === 'golive' ? hostView(el, ctx, cfg) : viewerView(el, params.args[0], ctx, cfg);
}

// ---------- عناصر مشتركة ----------
function stageHTML({ host, me, isHost }) {
  return `<div class="live-stage ${isHost ? 'is-host' : 'is-viewer'}">
    <video class="live-video" id="lvVideo"></video>
    <div class="live-shade" aria-hidden="true"></div>
    <div class="live-top">
      <button class="icon-btn glass" id="lvClose" aria-label="${esc(t('back'))}">${icon('close', { size: 20 })}</button>
      ${host ? `<a class="live-host" href="#/profile/${host.id}"><img class="av sm" src="${avatarOf(host)}" alt=""><span><b>${esc(host.name)}</b><small id="lvTitle"></small></span></a>` : '<span class="grow"></span>'}
      <span class="live-badge" id="lvBadge" ${isHost ? 'hidden' : ''}>${esc(t('liveNow'))} <time id="lvTimer" dir="ltr"></time></span>
      <span class="live-viewers" id="lvViewers" aria-live="polite">${icon('eye', { size: 15 })} <b dir="ltr">0</b></span>
    </div>
    <div class="live-sub">${topChipHTML()}</div>
    <div class="live-banner" id="lvBanner" hidden></div>
    <div class="live-comments" id="lvComments" aria-live="polite"></div>
    <div class="live-hearts" id="lvHearts" aria-hidden="true"></div>
    <button class="live-unmute" id="lvUnmute" hidden>${icon('volOn', { size: 18 })} ${esc(t('tapForSound'))}</button>
    <div class="live-bottom" id="lvBottom">${isHost ? '' : (me ? `<form class="live-input" id="lvForm"><input name="text" maxlength="200" autocomplete="off" placeholder="${esc(t('liveComment'))}" aria-label="${esc(t('liveComment'))}"><button class="icon-btn" aria-label="${esc(t('send'))}">${icon('share', { size: 18, cls: 'flip-rtl' })}</button></form>` : `<a class="btn sm glass" href="#/login?next=${encodeURIComponent(location.hash)}">${esc(t('login'))}</a>`)}
      ${isHost || !me ? '' : `<button class="live-gift-btn" id="lvGift" aria-label="${esc(t('sendGift'))}">${icon('gift', { size: 24 })}</button>`}
      ${isHost ? '' : `<button class="live-heart-btn" id="lvHeart" aria-label="${esc(t('hearts'))}">${icon('heart', { size: 26, fill: true })}</button>`}</div>
  </div>`;
}
function commentHTML(c, canMod, meId) {
  const u = c.user || {};
  return `<div class="lc" data-cid="${esc(c.id)}" data-uid="${esc(c.userId)}"><img class="av xs" src="${avatarOf(u)}" alt=""><div class="lc-body"><b>${esc(u.name || u.username || '')}</b> <span>${esc(c.text)}</span></div>${canMod && c.userId !== meId ? `<button class="lc-more" data-mod="${esc(c.id)}" aria-label="⋯">${icon('more', { size: 16 })}</button>` : ''}</div>`;
}
function floatHeart(box, n = 1) {
  for (let i = 0; i < Math.min(n, 6); i++) {
    const h = document.createElement('span'); h.className = 'fh';
    h.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 70)}px`); h.style.setProperty('--hue', `${Math.round(330 + Math.random() * 50) % 360}`);
    h.style.animationDelay = `${i * 120}ms`; h.innerHTML = icon('heart', { size: 26, fill: true });
    box.append(h); setTimeout(() => h.remove(), 2600 + i * 120);
  }
}
function wireComments(el, state, live) {
  const box = $('#lvComments', el);
  state.addComment = (c) => {
    if (box.querySelector(`[data-cid="${CSS.escape(c.id)}"]`)) return;
    box.insertAdjacentHTML('beforeend', commentHTML(c, state.canModerate, state.meId));
    while (box.children.length > 60) box.firstElementChild.remove();
    box.scrollTop = box.scrollHeight;
  };
  state.delComments = (ids) => ids.forEach((id) => box.querySelector(`[data-cid="${CSS.escape(id)}"]`)?.remove());
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mod]'); if (!b) return;
    const row = b.closest('.lc'); const cid = row.dataset.cid, target = row.dataset.uid;
    const body = document.createElement('div'); body.className = 'sheet-actions';
    body.innerHTML = `<button class="btn block" data-a="del">${icon('trash', { size: 16 })} ${esc(t('deleteComment'))}</button><button class="btn block danger" data-a="block">${icon('shield', { size: 16 })} ${esc(t('blockViewer'))}</button>`;
    const sh = openSheet({ title: t('liveComment').replace('…', ''), body });
    body.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; sh.close();
      try {
        if (a === 'del') { await rq('DELETE', `/live/${live.id}/comments/${cid}`); state.delComments([cid]); }
        else { await rq('POST', `/live/${live.id}/block`, { userId: target }); state.delComments([...box.querySelectorAll(`[data-uid="${CSS.escape(target)}"]`)].map((x) => x.dataset.cid)); toast(t('blockedViewer')); }
      } catch { toast(t('liveJoinFail'), 'err'); }
    });
  });
}
function onData(state, LK) {
  return (payload, participant, _kind, topic) => {
    if (participant || (topic && topic !== 'ck')) return;       // نقبل فقط رسائل الخادم
    let m; try { m = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
    if (m.t === 'comment') state.addComment(m.c);
    else if (m.t === 'comment-del') state.delComments(m.ids || []);
    else if (m.t === 'hearts') { if (m.from !== state.meId || state.isHost) floatHeart(state.heartsBox, m.n); state.hearts += m.n; }
    else if (m.t === 'viewers') state.setViewers(m.n);
    else if (m.t === 'gift' && m.g) { showGiftFx(state.stage, m.g); renderTop(state.el, m.top, m.g.liveDiamonds); state.diamonds = m.g.liveDiamonds; }
    else if (m.t === 'ended') state.onEnded?.(m.reason);
  };
}
function setViewersFn(el) { return (n) => { const b = $('#lvViewers b', el); if (b) b.textContent = String(n); }; }
function fitVideo(v) {
  const apply = () => { const portraitVid = v.videoHeight >= v.videoWidth; const portraitBox = v.clientHeight >= v.clientWidth; v.classList.toggle('contain', portraitVid !== portraitBox); };
  v.addEventListener('resize', apply); v.addEventListener('loadedmetadata', apply); window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}

// ======================= المضيف =======================
async function hostView(el, ctx, cfg) {
  if (!(await ctx.requireLogin())) return;
  el.innerHTML = stageHTML({ host: ctx.me, me: ctx.me, isHost: true });
  const stage = $('.live-stage', el); const video = inlineVideo($('#lvVideo', el)); video.classList.add('mirror');
  const state = { meId: ctx.me.id, isHost: true, canModerate: true, hearts: 0, heartsBox: $('#lvHearts', el), setViewers: setViewersFn(el), peak: 0, stage, el, diamonds: 0 };
  $('#lvTopG', el).onclick = () => live && openTopSheet(live.id);
  const sv = state.setViewers; state.setViewers = (n) => { state.peak = Math.max(state.peak, n); sv(n); };
  let stream = null, facing = 'user', room = null, live = null, pub = null, ended = false, t0 = 0, timer = null, releaseWake = null, leaving = false;
  const segs = []; let cur = null;   // التسجيل المحلي المتدحرج
  const canSave = recorderSupported();
  const bottom = $('#lvBottom', el);
  const mine = (await rq('GET', '/live/mine').catch(() => ({}))).live;

  const pre = document.createElement('div'); pre.className = 'live-pre';
  pre.innerHTML = `<button class="btn block glass" id="lvCam" hidden>${icon('video', { size: 18 })} ${esc(t('enableCam'))}</button>
    <input class="input" id="lvTitleIn" maxlength="120" placeholder="${esc(t('liveTitlePh'))}" value="${esc(mine?.title || '')}">
    <button class="btn primary block lg" id="lvStart" disabled>${icon('live', { size: 20 })} ${esc(mine ? t('resumeLive') : t('startLive'))}</button>`;
  stage.append(pre);
  bottom.innerHTML = `<button class="icon-btn glass" id="lvFlip" aria-label="${esc(t('flipCam'))}">${icon('flip', { size: 20 })}</button><span class="grow"></span><button class="btn danger" id="lvEnd" hidden>${esc(t('endLive'))}</button>`;

  async function startCam() {
    try {
      stream = await getMedia({ video: true, audio: true, facing });
      video.srcObject = stream; video.classList.toggle('mirror', facing === 'user');
      await video.play().catch(() => {});
      $('#lvCam', el).hidden = true; $('#lvStart', el).disabled = false; return true;
    } catch (e) { console.warn(e); $('#lvCam', el).hidden = false; toast(t('camDenied'), 'err'); return false; }
  }
  $('#lvCam', el).onclick = () => { unlockAudio(); startCam(); };
  startCam();   // معظم المتصفحات تسمح مباشرة؛ وإلا يظهر زر التشغيل

  // ---- التسجيل المتدحرج ----
  function newSeg() {
    if (!canSave || !stream || ended) return;
    try {
      const rec = makeRecorder(new MediaStream(stream.getTracks().filter((x) => x.readyState === 'live')), { videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 96_000 });
      const s = { rec, chunks: [], t0: performance.now(), t1: 0, blob: null };
      s.done = new Promise((ok) => { rec.onstop = () => { s.t1 = performance.now(); s.blob = s.chunks.length ? finishBlob(s.chunks, rec) : null; ok(); }; });
      rec.ondataavailable = (e) => { if (e.data.size) s.chunks.push(e.data); };
      rec.start(1000);
      const prev = cur; cur = s; if (prev) { try { prev.rec.stop(); } catch {} segs.push(prev); }
      // نحتفظ فقط بما يلزم لآخر 3 دقائق
      const need = (cfg.maxSec || 180);
      while (segs.length > 1 && segs.slice(1).reduce((a, x) => a + ((x.t1 || performance.now()) - x.t0) / 1000, 0) >= need) segs.shift();
    } catch (e) { console.warn('[live] recorder', e); }
  }
  let segTimer = null;

  async function connect(token, url) {
    const LK = await loadLK();
    room = new LK.Room({ adaptiveStream: false, dynacast: true, publishDefaults: { simulcast: true, videoSimulcastLayers: [LK.VideoPresets.h180, LK.VideoPresets.h360], videoEncoding: LK.VideoPresets.h720.encoding, dtx: true, red: true, videoCodec: 'vp8' } });
    room.on(LK.RoomEvent.DataReceived, onData(state, LK));
    room.on(LK.RoomEvent.Reconnecting, () => banner(t('reconnecting')));
    room.on(LK.RoomEvent.Reconnected, () => banner(''));
    room.on(LK.RoomEvent.Disconnected, () => { if (!ended && !leaving) rejoin(); });
    await room.connect(url, token);
    const [vt] = stream.getVideoTracks(); const [at] = stream.getAudioTracks();
    pub = await room.localParticipant.publishTrack(vt, { source: LK.Track.Source.Camera, simulcast: true, videoEncoding: LK.VideoPresets.h720.encoding });
    if (at) await room.localParticipant.publishTrack(at, { source: LK.Track.Source.Microphone });
  }
  let rejoining = false;
  async function rejoin() {
    if (rejoining || ended) return; rejoining = true; banner(t('reconnecting'));
    for (let i = 0; i < 8 && !ended && !leaving; i++) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      try { const j = await rq('POST', `/live/${live.id}/join`); await connect(j.token, j.url); banner(''); rejoining = false; return; }
      catch (e) { if (e.status === 410) { showEnded('ended'); break; } }
    }
    rejoining = false;
  }
  function banner(txt) { const b = $('#lvBanner', el); b.textContent = txt; b.hidden = !txt; }

  $('#lvStart', el).onclick = async () => {
    unlockAudio();
    const btn = $('#lvStart', el); btn.disabled = true;
    try {
      if (!stream && !(await startCam())) { btn.disabled = false; return; }
      let r;
      if (mine) { live = mine; r = await rq('POST', `/live/${mine.id}/join`); }
      else { r = await rq('POST', '/live', { title: $('#lvTitleIn', el).value.trim() }); live = r.live; }
      await connect(r.token, r.url);
      pre.remove(); $('#lvBadge', el).hidden = false; $('#lvEnd', el).hidden = false; $('#lvTitle', el).textContent = live.title || '';
      t0 = mine ? mine.startedAt : Date.now();
      timer = setInterval(() => { $('#lvTimer', el).textContent = fmtDur((Date.now() - t0) / 1000); }, 1000);
      releaseWake = await keepAwake();
      wireComments(el, state, live);
      const d = await rq('GET', `/live/${live.id}`).catch(() => null);
      d?.comments?.forEach(state.addComment); if (d) { state.hearts = d.live.hearts; state.setViewers(d.live.viewers); state.diamonds = d.live.giftDiamonds || 0; }
      rq('GET', `/live/${live.id}/gifters`).then((g) => renderTop(el, g.top, g.liveDiamonds)).catch(() => {});
      newSeg(); segTimer = setInterval(newSeg, SEG_SEC * 1000);
      window.addEventListener('beforeunload', onUnload);
    } catch (e) {
      console.warn(e); btn.disabled = false;
      toast(e.status === 503 ? t('liveOff') : t('liveStartFail'), 'err');
      if (live && !mine) rq('POST', `/live/${live.id}/end`).catch(() => {});
      live = null; try { room?.disconnect(); } catch {}
    }
  };
  $('#lvFlip', el).onclick = async () => {
    facing = facing === 'user' ? 'environment' : 'user';
    try {
      const ns = await getMedia({ video: true, audio: false, facing });
      const nt = ns.getVideoTracks()[0]; const old = stream.getVideoTracks()[0];
      if (pub?.track) await pub.track.replaceTrack(nt, true);
      stream.removeTrack(old); old.stop(); stream.addTrack(nt);
      video.srcObject = stream; video.classList.toggle('mirror', facing === 'user');
      if (live && cur) newSeg();     // مقطع جديد بالكاميرا الجديدة
    } catch (e) { console.warn(e); facing = facing === 'user' ? 'environment' : 'user'; toast(t('camDenied'), 'err'); }
  };
  $('#lvEnd', el).onclick = () => {
    const body = document.createElement('div');
    body.innerHTML = `${canSave ? `<label class="check-row"><input type="checkbox" id="lvSave" checked> <span>${esc(t('saveLiveClip'))}<small class="muted block">${esc(t('saveLiveNote'))}</small></span></label>` : ''}
      <button class="btn danger block lg" id="lvEndGo">${esc(t('endLive'))}</button>`;
    const sh = openSheet({ title: t('endLiveQ'), body });
    $('#lvEndGo', body).onclick = async () => { const save = canSave && $('#lvSave', body)?.checked; sh.close(); await finish(save); };
  };

  async function stopRecording() {
    clearInterval(segTimer);
    if (cur) { try { cur.rec.stop(); } catch {} segs.push(cur); cur = null; }
    await Promise.all(segs.map((s) => s.done));
    const out = segs.filter((s) => s.blob && s.blob.size > 1000);
    while (out.length > 1 && out.slice(1).reduce((a, x) => a + (x.t1 - x.t0) / 1000, 0) >= (cfg.maxSec || 180)) out.shift();
    return out;
  }
  async function finish(save) {
    if (ended) return; ended = true;
    window.removeEventListener('beforeunload', onUnload);
    const recs = await stopRecording();
    try { await room?.disconnect(); } catch {}
    stream?.getTracks().forEach((x) => x.stop());
    let saved = false;
    if (save && recs.length) {
      banner(t('liveSaving'));
      const fd = new FormData();
      recs.forEach((s, i) => fd.append('seg', s.blob, `seg${i}.${/mp4/.test(s.blob.type) ? 'mp4' : 'webm'}`));
      fd.append('durs', JSON.stringify(recs.map((s) => Math.round((s.t1 - s.t0) / 100) / 10)));
      try { await rq('POST', `/live/${live.id}/save`, undefined, { form: fd }); saved = true; } catch (e) { console.warn(e); toast(t('liveSaveFail'), 'err'); }
      banner('');
    }
    if (!saved) await rq('POST', `/live/${live.id}/end`).catch(() => {});
    showSummary(saved);
  }
  function showSummary(saved) {
    clearInterval(timer); releaseWake?.();
    const box = document.createElement('div'); box.className = 'live-end';
    box.innerHTML = `<h2>${esc(t('liveSummary'))}</h2><dl><div><dt>${esc(t('liveDuration'))}</dt><dd dir="ltr">${fmtDur((Date.now() - t0) / 1000)}</dd></div><div><dt>${esc(t('peakViewers'))}</dt><dd>${state.peak}</dd></div><div><dt>${esc(t('hearts'))}</dt><dd>${state.hearts}</dd></div><div><dt>${esc(t('diamonds'))}</dt><dd>💎 ${fmtInt(state.diamonds)}</dd></div></dl>
      ${saved ? `<p class="note">${esc(t('saveLiveNote'))}</p>` : ''}<a class="btn primary block" href="#/earnings">💎 ${esc(t('myEarnings'))}</a><a class="btn block" href="#/me">${esc(t('me'))}</a><a class="btn ghost block" href="#/feed">${esc(t('home'))}</a>`;
    stage.append(box); $('#lvBottom', el).hidden = true;
  }
  function showEnded(reason) { if (ended) return; ended = true; clearInterval(segTimer); try { cur?.rec.stop(); } catch {} stream?.getTracks().forEach((x) => x.stop()); toast(reason === 'admin' ? t('liveEndedBy') : t('liveEnded')); showSummary(false); }
  state.onEnded = (reason) => { if (!ended) { try { room?.disconnect(); } catch {} showEnded(reason); } };
  function onUnload(e) { if (live && !ended) { e.preventDefault(); e.returnValue = t('liveConfirmLeave'); } }

  $('#lvClose', el).onclick = () => { if (live && !ended) $('#lvEnd', el).click(); else history.length > 1 ? history.back() : ctx.navigate('#/feed'); };
  return () => {
    leaving = true; window.removeEventListener('beforeunload', onUnload);
    clearInterval(timer); clearInterval(segTimer); releaseWake?.();
    if (live && !ended) { ended = true; fetch(`/api/live/${live.id}/end`, { method: 'POST', headers: { 'X-CK': '1' }, credentials: 'same-origin', keepalive: true }).catch(() => {}); }
    try { cur?.rec.stop(); } catch {}
    try { room?.disconnect(); } catch {}
    stream?.getTracks().forEach((x) => x.stop());
  };
}

// ======================= المشاهد =======================
async function viewerView(el, id, ctx) {
  let d;
  try { d = await rq('GET', `/live/${encodeURIComponent(id)}`); } catch { el.innerHTML = `<div class="page"><p class="empty">${esc(t('notFound'))}</p></div>`; return; }
  const live = d.live; const host = live.host;
  if (d.isHost && live.status === 'live') { ctx.navigate('#/golive'); return; }
  el.innerHTML = stageHTML({ host, me: ctx.me, isHost: false });
  const stage = $('.live-stage', el); const video = inlineVideo($('#lvVideo', el));
  const unfit = fitVideo(video);
  const state = { meId: ctx.me?.id || null, isHost: false, canModerate: d.canModerate, hearts: live.hearts, heartsBox: $('#lvHearts', el), setViewers: setViewersFn(el), stage, el, diamonds: live.giftDiamonds || 0 };
  $('#lvTopG', el).onclick = () => openTopSheet(live.id);
  renderTop(el, [], live.giftDiamonds || 0);
  rq('GET', `/live/${live.id}/gifters`).then((g) => renderTop(el, g.top, g.liveDiamonds)).catch(() => {});
  $('#lvTitle', el).textContent = live.title || '';
  wireComments(el, state, live); d.comments.forEach(state.addComment); state.setViewers(live.viewers);
  const timer = setInterval(() => { $('#lvTimer', el).textContent = fmtDur((Date.now() - live.startedAt) / 1000); }, 1000);
  let room = null, ended = false, leaving = false, audioEl = null;
  const banner = (txt) => { const b = $('#lvBanner', el); b.textContent = txt; b.hidden = !txt; };

  function showEnded(reason) {
    if (ended) return; ended = true; clearInterval(timer);
    try { room?.disconnect(); } catch {}
    banner('');
    const box = document.createElement('div'); box.className = 'live-end';
    box.innerHTML = `<img class="av lg" src="${avatarOf(host)}" alt=""><h2>${esc(reason === 'admin' ? t('liveEndedBy') : reason === 'disconnect' ? t('liveDropped') : t('liveEnded'))}</h2>
      <a class="btn primary block" href="#/profile/${host.id}">@${esc(host.username)}</a>${live.savedVideoId ? `<a class="btn block" href="#/watch/${live.savedVideoId}">${esc(t('watchClip'))}</a>` : ''}<a class="btn ghost block" href="#/feed">${esc(t('home'))}</a>`;
    stage.append(box); $('#lvBottom', el).hidden = true; $('#lvUnmute', el).hidden = true;
  }
  state.onEnded = showEnded;
  if (live.status !== 'live') { showEnded(live.endReason); return () => { clearInterval(timer); unfit(); }; }

  if (d.canModerate && !d.isHost) {
    const b = document.createElement('button'); b.className = 'btn sm danger live-admin-end'; b.textContent = t('liveAdminEnd');
    b.onclick = async () => { if (!confirm(t('endLiveQ'))) return; await rq('POST', `/live/${live.id}/end`).catch(() => {}); showEnded('admin'); };
    $('.live-top', el).append(b);
  }

  async function join() {
    const LK = await loadLK();
    const j = await rq('POST', `/live/${live.id}/join`);
    room = new LK.Room({ adaptiveStream: true, dynacast: false });
    room.on(LK.RoomEvent.TrackSubscribed, (track, _pub, p) => {
      if (p.identity !== live.userId) return;
      if (track.kind === 'video') { track.attach(video); video.play().catch(() => {}); banner(''); }
      else if (track.kind === 'audio') { audioEl = track.attach(); audioEl.setAttribute('playsinline', ''); el.append(audioEl); checkAudio(); }
    });
    room.on(LK.RoomEvent.TrackUnsubscribed, (track) => track.detach());
    room.on(LK.RoomEvent.ParticipantDisconnected, (p) => { if (p.identity === live.userId && !ended) banner(t('hostReconnecting')); });
    room.on(LK.RoomEvent.ParticipantConnected, (p) => { if (p.identity === live.userId) banner(''); });
    room.on(LK.RoomEvent.TrackMuted, (pub, p) => { if (p.identity === live.userId && pub.kind === 'video') banner(t('hostReconnecting')); });
    room.on(LK.RoomEvent.TrackUnmuted, (pub, p) => { if (p.identity === live.userId) banner(''); });
    room.on(LK.RoomEvent.DataReceived, onData(state, LK));
    room.on(LK.RoomEvent.AudioPlaybackStatusChanged, checkAudio);
    room.on(LK.RoomEvent.Reconnecting, () => banner(t('reconnecting')));
    room.on(LK.RoomEvent.Reconnected, () => banner(''));
    room.on(LK.RoomEvent.Disconnected, async () => {
      if (ended || leaving) return;
      const s = await rq('GET', `/live/${live.id}`).catch(() => null);
      if (!s || s.live.status !== 'live') return showEnded(s?.live.endReason);
      banner(t('reconnecting')); setTimeout(() => { if (!ended && !leaving) join().catch(() => {}); }, 2000);
    });
    await room.connect(j.url, j.token);
    if (![...room.remoteParticipants.values()].some((p) => p.identity === live.userId)) banner(t('hostReconnecting'));
  }
  function checkAudio() { const btn = $('#lvUnmute', el); if (btn) btn.hidden = !room || room.canPlaybackAudio; }
  $('#lvUnmute', el).onclick = async () => { unlockAudio(); try { await room?.startAudio(); await audioEl?.play(); } catch {} checkAudio(); };
  stage.addEventListener('pointerdown', () => { if (room && !room.canPlaybackAudio) room.startAudio().then(checkAudio).catch(() => {}); }, { passive: true });

  // تعليقات وقلوب
  $('#lvForm', el)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const inp = e.target.text; const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    try { const c = await rq('POST', `/live/${live.id}/comments`, { text }); state.addComment(c); }
    catch (er) { inp.value = text; toast(er.status === 429 ? t('slowDown') : t('liveJoinFail'), 'err'); }
  });
  let pendingHearts = 0, flushT = null;
  $('#lvHeart', el)?.addEventListener('click', () => {
    floatHeart(state.heartsBox, 1); pendingHearts++;
    if (!flushT) flushT = setTimeout(async () => { const n = pendingHearts; pendingHearts = 0; flushT = null; await rq('POST', `/live/${live.id}/hearts`, { n }).catch(() => {}); }, HEART_FLUSH_MS);
  });

  $('#lvGift', el)?.addEventListener('click', () => openGiftTray(stage, { liveId: live.id, onSent: (r) => { showGiftFx(stage, r); renderTop(el, r.top, r.liveDiamonds); } }));
  $('#lvClose', el).onclick = () => (history.length > 1 ? history.back() : ctx.navigate('#/feed'));
  try { await join(); }
  catch (e) { console.warn(e); if (e.status === 410) showEnded(); else { banner(e.status === 429 ? t('liveFull') : t('liveJoinFail')); } }
  return () => { leaving = true; clearInterval(timer); clearTimeout(flushT); unfit(); try { room?.disconnect(); } catch {} };
}
