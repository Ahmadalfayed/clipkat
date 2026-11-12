// © 2026 وطن النهار — استوديو الإنشاء: تصوير أو اختيار ملف، قص، سرعة، نصوص، فلاتر، صورة غلاف، مزج صوت
import { api } from '../services/index.js';
import { t, fmtKWD } from '../i18n.js';
import { icon, esc, $, $$, toast, productImg } from '../ui.js';
import { pageHead } from './common.js';
import { FILTERS, SPEEDS, recorderSupported, pickRecorderMime, exportClip, exportDuet, exportStitch, captureFrame, blobToFile } from '../studio-export.js';

const MAX_REC = 60;   // حد التصوير بالكاميرا داخل الاستوديو
const maxClip = () => api.maxVideoSec || 180;   // القص الافتراضي: المقطع كاملاً حتى الحد
export function uploadErrorText(err) {
  const m = String(err?.message || '');
  if (m === 'tooLarge') return t('fileTooLarge', { n: err.limit });
  if (m === 'tooLong') return t('videoTooLong', { n: err.limit });
  if (m === 'badFile') return t('badVideo');
  if (err?.name === 'AbortError' || /failed to fetch|networkerror|load failed|network/i.test(m)) return t('uploadNetFail');
  return t('uploadFailed');
}

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  const store = await api.getMyStore();
  const active = store && api.storeStatus(store).active;
  const products = active ? await api.listProducts(store.id) : [];
  const soundId = params.query.get('sound');
  const sound = soundId && api.social ? await api.getSound(soundId) : null;
  if (soundId && !sound) toast(t('soundHidden'), 'warn');

  const duetId = params.query.get('duet');
  const stitchId = params.query.get('stitch');
  const remixType = duetId ? 'duet' : stitchId ? 'stitch' : null;
  let remixSrc = null;
  if (remixType && api.social) {
    remixSrc = await api.getVideo(duetId || stitchId);
    const allowed = remixType === 'duet' ? remixSrc?.canDuet : remixSrc?.canStitch;
    if (!remixSrc || allowed === false) { toast(t(remixSrc ? 'remixOff' : 'sourceUnavailable'), 'warn'); ctx.navigate('#/feed'); return; }
    remixSrc.user = await api.getUser(remixSrc.userId);
  }

  const st = {
    step: remixType === 'stitch' ? 'stitchTrim' : 'source', file: null, url: null, recUrl: null, stream: null, rec: null, recTimer: null,
    start: 0, end: 0, speed: 1, filter: 'none', texts: [], cover: 0, poster: null,
    volOrig: sound ? 0.2 : 1, volSound: sound ? 1 : 0, volSource: 1, volMe: 1,
    exported: null, recSec: 0, facing: 'user',
    layout: 'lr', sourceSide: 'right', stitchStart: 0, stitchEnd: 5
  };

  const cleanupMedia = () => {
    clearInterval(st.recTimer);
    try { st.rec?.state !== 'inactive' && st.rec.stop(); } catch {}
    st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null;
    if (st.url) { const u = st.url; setTimeout(() => URL.revokeObjectURL(u), 1500); st.url = null; }
  };

  const useFile = async (file) => {
    cleanupMedia();
    st.file = file; st.url = URL.createObjectURL(file); st.exported = null;
    const v = document.createElement('video'); v.preload = 'auto'; v.src = st.url;
    try { await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('badFile')); setTimeout(() => no(new Error('badFile')), 8000); }); }
    catch {
      // المتصفح لا يقرأ الملف (مثلاً HEVC على بعض المتصفحات): ننشره كما هو والخادم يحوّله
      if (remixType) { toast(t('badVideo'), 'warn'); return; }
      toast(t('rawUploadNote'), 'warn'); st.step = 'publish'; await draw(); return;
    }
    const dur = v.duration;
    if (!Number.isFinite(dur) || dur < 0.2) { toast(t('badVideo'), 'warn'); return; }
    if (dur > (api.maxVideoSec || 180) + 0.5) { toast(t('videoTooLong', { n: api.maxVideoSec || 180 }), 'warn'); }
    st.start = 0; st.end = Math.min(dur, maxClip()); st.cover = Math.min(0.4, st.end / 2);
    st.step = 'edit'; await draw();
  };

  const recError = (e) => {
    const name = e?.name || e?.message || '';
    if (/NotAllowed|Permission/i.test(name)) return t('camDenied');
    if (/NotFound|DevicesNotFound/i.test(name)) return t('camMissing');
    if (/NotReadable|TrackStart|Abort/i.test(name)) return t('camBusy');
    if (/Security|secure/i.test(name)) return t('camInsecure');
    return t('camFail');
  };

  async function startCamera(preview) {
    st.stream?.getTracks().forEach((t) => t.stop());
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: st.facing, width: { ideal: 720 }, height: { ideal: 1280 } }
      });
    } catch (e) {
      if (/audio/i.test(e.message || '') || e.name === 'NotFoundError') {
        try { st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: st.facing }, audio: false }); toast(t('camNoMic'), 'warn'); }
        catch (e2) { toast(recError(e2), 'warn'); return false; }
      } else { toast(recError(e), 'warn'); return false; }
    }
    preview.srcObject = st.stream; preview.muted = true; await preview.play().catch(() => {});
    return true;
  }

  const layoutChips = () => st.layout === 'tb'
    ? `<button type="button" class="chip ${st.layout === 'lr' ? 'on' : ''}" data-lay="lr">${esc(t('layoutLR'))}</button>
       <button type="button" class="chip on" data-lay="tb">${esc(t('layoutTB'))}</button>
       <button type="button" class="chip ${st.sourceSide === 'top' ? 'on' : ''}" data-side="top">${esc(t('sourceTop'))}</button>
       <button type="button" class="chip ${st.sourceSide === 'bottom' ? 'on' : ''}" data-side="bottom">${esc(t('sourceBottom'))}</button>`
    : `<button type="button" class="chip on" data-lay="lr">${esc(t('layoutLR'))}</button>
       <button type="button" class="chip ${st.layout === 'tb' ? 'on' : ''}" data-lay="tb">${esc(t('layoutTB'))}</button>
       <button type="button" class="chip ${st.sourceSide === 'right' ? 'on' : ''}" data-side="right">${esc(t('sourceRight'))}</button>
       <button type="button" class="chip ${st.sourceSide === 'left' ? 'on' : ''}" data-side="left">${esc(t('sourceLeft'))}</button>`;
  const bindLayoutChips = (root) => {
    root.querySelectorAll('[data-lay]').forEach((b) => b.addEventListener('click', async () => {
      st.layout = b.dataset.lay; st.sourceSide = st.layout === 'tb' ? (st.sourceSide === 'bottom' ? 'bottom' : 'top') : (st.sourceSide === 'left' ? 'left' : 'right');
      await draw();
    }));
    root.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', async () => { st.sourceSide = b.dataset.side; await draw(); }));
  };

  async function draw() {
    const canRec = recorderSupported();
    if (st.step === 'stitchTrim' && remixSrc) {
      const srcUrl = remixSrc.src || remixSrc.videoUrl || '';
      el.innerHTML = `<div class="page studio">${pageHead(t('stitch'))}
        <p class="muted sm">${esc(t('stitchPick'))}</p>
        <div class="edit-prev"><video class="preview" playsinline controls src="${esc(srcUrl)}"></video></div>
        <label class="field"><span>${esc(t('stitchRange'))}: <b id="stLbl">0.0ث — 5.0ث</b></span>
          <div class="trim"><input type="range" id="s0" min="0" max="5" step="0.05" value="0"><input type="range" id="s1" min="0" max="5" step="0.05" value="5"></div></label>
        <button class="btn primary block lg" id="stitchGo">${esc(t('stitchThenRecord'))}</button>
      </div>`;
      const v = $('video', el);
      const clamp = () => {
        const dur = v.duration || 5;
        const maxWin = Math.min(5, dur);
        $('#s0', el).max = $('#s1', el).max = String(dur);
        let a = Number($('#s0', el).value), b = Number($('#s1', el).value);
        if (b - a > maxWin) { if (document.activeElement === $('#s1', el)) a = b - maxWin; else b = a + maxWin; }
        if (b < a + 0.15) b = Math.min(dur, a + 0.15);
        st.stitchStart = Math.max(0, a); st.stitchEnd = Math.min(dur, b);
        $('#s0', el).value = st.stitchStart; $('#s1', el).value = st.stitchEnd;
        $('#stLbl', el).textContent = `${st.stitchStart.toFixed(1)}ث — ${st.stitchEnd.toFixed(1)}ث`;
      };
      v.addEventListener('loadedmetadata', () => { st.stitchEnd = Math.min(5, v.duration || 5); $('#s1', el).value = st.stitchEnd; clamp(); });
      $('#s0', el).addEventListener('input', clamp); $('#s1', el).addEventListener('input', clamp);
      v.addEventListener('timeupdate', () => { if (v.currentTime < st.stitchStart || v.currentTime > st.stitchEnd) v.currentTime = st.stitchStart; });
      $('#stitchGo', el).addEventListener('click', async () => { st.step = 'source'; await draw(); });
      return;
    }

    if (st.step === 'source') {
      el.innerHTML = `<div class="page studio">${pageHead(remixType === 'duet' ? t('duet') : remixType === 'stitch' ? t('stitch') : t('studio'))}
        ${remixSrc ? `<div class="note">${esc(remixType === 'duet' ? t('duetHint') : t('stitchHint'))} <bdi>@${esc((remixSrc.user && remixSrc.user.username) || '')}</bdi></div>` : ''}
        ${sound ? `<div class="note">${icon('music', { size: 16 })} ${esc(t('usingSound'))}: <a href="#/sound/${sound.id}">${esc(sound.title)}</a></div>` : ''}
        <p class="muted sm">${esc(t('studioHint'))}</p>
        ${!canRec ? `<div class="warn">${esc(t('noRecorderHint'))}</div>` : ''}
        <div class="studio-src">
          <button class="src-card" id="btnCam" ${canRec ? '' : 'disabled'}>${icon('play', { size: 28 })}<b>${esc(t('recordCam'))}</b><small>${esc(t('recordCamSub'))}</small></button>
          <label class="src-card" id="btnFile">${icon('plus', { size: 28 })}<b>${esc(t('pickVideo'))}</b><small>${esc(t('pickHintStudio'))}</small>
            <input type="file" accept="video/*" class="sr-only"></label>
        </div>
        <a class="btn ghost block" href="#/sounds">${icon('music', { size: 16 })} ${esc(t('soundLibrary'))}</a>
      </div>`;
      $('#btnFile input', el).addEventListener('change', (e) => { const f = e.target.files[0]; if (f) useFile(f); });
      $('#btnCam', el)?.addEventListener('click', async () => {
        st.step = 'camera'; await draw();
      });
      return;
    }

    if (st.step === 'camera') {
      const srcUrl = remixSrc ? (remixSrc.src || '') : '';
      const duetCam = remixType === 'duet' && srcUrl;
      el.innerHTML = `<div class="page studio">${pageHead(t('recordCam'))}
        ${duetCam ? `<div class="duet-stage ${st.layout} src-${st.sourceSide}"><video class="duet-src" playsinline muted autoplay loop src="${esc(srcUrl)}"></video><video class="cam" playsinline muted autoplay></video></div>
          <div class="chips" role="group">${layoutChips()}</div>` : `<div class="cam-wrap"><video class="cam" playsinline muted autoplay></video>
          <div class="cam-hud"><span id="recTime">0:00</span></div></div>`}
        <div class="cam-hud"><span id="recTime">0:00</span></div>
        <div class="studio-bar">
          <button class="btn" id="flip">${esc(t('flipCam'))}</button>
          <button class="btn primary rec-btn" id="rec">${esc(t('startRec'))}</button>
        </div></div>`;
      const preview = $('.cam', el);
      if (!(await startCamera(preview))) { st.step = 'source'; await draw(); return; }
      bindLayoutChips(el);
      const srcVid = $('.duet-src', el);
      if (srcVid) srcVid.play().catch(() => {});
      $('#flip', el).addEventListener('click', async () => { st.facing = st.facing === 'user' ? 'environment' : 'user'; await startCamera(preview); });
      $('#rec', el).addEventListener('click', async () => {
        const btn = $('#rec', el);
        if (st.rec && st.rec.state === 'recording') { st.rec.stop(); return; }
        const mime = pickRecorderMime();
        if (!mime) { toast(t('noRecorderHint'), 'warn'); return; }
        const chunks = [];
        try { st.rec = new MediaRecorder(st.stream, { mimeType: mime }); }
        catch { toast(t('noRecorderHint'), 'warn'); return; }
        st.rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        st.rec.onstop = async () => {
          clearInterval(st.recTimer);
          const blob = new Blob(chunks, { type: st.rec.mimeType || mime });
          st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null;
          if (!blob.size) { toast(t('recEmpty'), 'warn'); st.step = 'source'; await draw(); return; }
          await useFile(new File([blob], `rec-${Date.now()}.webm`, { type: blob.type }));
        };
        st.rec.start(200); st.recSec = 0; btn.textContent = t('stopRec'); btn.classList.add('recording');
        st.recTimer = setInterval(() => {
          st.recSec += 1; const m = Math.floor(st.recSec / 60), s = st.recSec % 60;
          const tEl = $('#recTime', el); if (tEl) tEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
          if (st.recSec >= MAX_REC) st.rec.stop();
        }, 1000);
      });
      return;
    }

    if (st.step === 'edit') {
      const durLabel = (x) => `${x.toFixed(1)}ث`;
      el.innerHTML = `<div class="page studio">${pageHead(t('editClip'))}
        ${remixType === 'duet' && remixSrc ? `<div class="duet-stage ${st.layout} src-${st.sourceSide}"><video class="duet-src" playsinline muted loop src="${esc(remixSrc.src || '')}"></video><video class="preview" playsinline controls src="${esc(st.url)}"></video></div>
          <div class="chips" role="group">${layoutChips()}</div>` : `<div class="edit-prev">
          <video class="preview" playsinline controls src="${esc(st.url)}"></video>
          <div class="text-layer" id="textLayer"></div>
        </div>`}
        <label class="field"><span>${esc(t('trimRange'))}: <b id="trimLbl">${durLabel(st.start)} — ${durLabel(st.end)}</b></span>
          <div class="trim"><input type="range" id="t0" min="0" max="${st.end || 1}" step="0.05" value="${st.start}"><input type="range" id="t1" min="0" max="${st.end || 1}" step="0.05" value="${st.end}"></div></label>
        <div class="chips" role="group" aria-label="${esc(t('speed'))}">${SPEEDS.map((s) => `<button type="button" class="chip ${st.speed === s ? 'on' : ''}" data-sp="${s}">${s}×</button>`).join('')}</div>
        <div class="chips" role="group" aria-label="${esc(t('filters'))}">${Object.entries(FILTERS).map(([k, v]) => `<button type="button" class="chip ${st.filter === k ? 'on' : ''}" data-f="${k}">${esc(t('flt_' + k) === 'flt_' + k ? v.label : t('flt_' + k))}</button>`).join('')}</div>
        <section class="card tight"><h3>${esc(t('textOverlay'))}</h3>
          <div class="text-form"><input id="tx" maxlength="40" placeholder="${esc(t('textPh'))}">
            <input type="color" id="txc" value="#ffffff" aria-label="${esc(t('textColor'))}">
            <select id="txs" aria-label="${esc(t('textSize'))}"><option value="28">ص</option><option value="40" selected>م</option><option value="56">ك</option></select>
            <select id="txp" aria-label="${esc(t('textPos'))}"><option value="0.2">${esc(t('posTop'))}</option><option value="0.5">${esc(t('posMid'))}</option><option value="0.82" selected>${esc(t('posBot'))}</option></select>
            <button type="button" class="btn sm" id="txAdd">${esc(t('addText'))}</button></div>
          <ul class="tx-list" id="txList"></ul>
        </section>
        ${remixSrc ? `<section class="card tight"><h3>${esc(t('audioMix'))}</h3>
          <label class="field"><span>${esc(t('volSource'))}</span><input type="range" id="vsrc" min="0" max="1" step="0.05" value="${st.volSource}"></label>
          <label class="field"><span>${esc(t('volMe'))}</span><input type="range" id="vme" min="0" max="1" step="0.05" value="${st.volMe}"></label>
        </section>` : sound ? `<section class="card tight"><h3>${icon('music', { size: 16 })} ${esc(sound.title)}</h3>
          <label class="field"><span>${esc(t('volOrig'))}</span><input type="range" id="vo" min="0" max="1" step="0.05" value="${st.volOrig}"></label>
          <label class="field"><span>${esc(t('volSound'))}</span><input type="range" id="vs" min="0" max="1" step="0.05" value="${st.volSound}"></label>
        </section>` : ''}
        <button class="btn ghost block" id="setCover">${esc(t('setCover'))}</button>
        <button class="btn primary block lg" id="goExport">${esc(t('exportNext'))}</button>
        <p class="muted sm">${esc(t('exportHint'))}</p>
      </div>`;
      const v = $('video', el);
      const applyLook = () => { v.style.filter = FILTERS[st.filter]?.css || 'none'; v.playbackRate = st.speed; renderTexts(); };
      const renderTexts = () => {
        $('#textLayer', el).innerHTML = st.texts.map((x, i) => `<span class="tx" style="top:${x.y * 100}%;color:${esc(x.color)};font-size:${x.size * 0.45}px">${esc(x.text)}<button type="button" data-rm="${i}" aria-label="${esc(t('delete'))}">×</button></span>`).join('');
      };
      const syncTrim = () => {
        const max = v.duration || st.end;
        $('#t0', el).max = $('#t1', el).max = String(max);
        st.start = Math.min(Number($('#t0', el).value), st.end - 0.15);
        st.end = Math.max(Number($('#t1', el).value), st.start + 0.15);
        $('#t0', el).value = st.start; $('#t1', el).value = st.end;
        $('#trimLbl', el).textContent = `${durLabel(st.start)} — ${durLabel(st.end)}`;
      };
      v.addEventListener('loadedmetadata', () => { if (!st.end || st.end > v.duration) st.end = Math.min(v.duration, maxClip()); syncTrim(); applyLook(); });
      v.addEventListener('timeupdate', () => { if (v.currentTime >= st.end) { v.pause(); v.currentTime = st.start; } });
      applyLook();
      el.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => { st.speed = Number(b.dataset.sp); el.querySelectorAll('[data-sp]').forEach((x) => x.classList.toggle('on', x === b)); applyLook(); }));
      el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); applyLook(); }));
      $('#t0', el).addEventListener('input', syncTrim); $('#t1', el).addEventListener('input', syncTrim);
      $('#txAdd', el).addEventListener('click', () => {
        const text = $('#tx', el).value.trim(); if (!text) return;
        st.texts.push({ text: text.slice(0, 40), color: $('#txc', el).value, size: Number($('#txs', el).value), x: 0.5, y: Number($('#txp', el).value) });
        $('#tx', el).value = ''; renderTexts();
      });
      $('#textLayer', el).addEventListener('click', (e) => { const i = e.target.dataset.rm; if (i != null) { st.texts.splice(+i, 1); renderTexts(); } });
      $('#vo', el)?.addEventListener('input', (e) => { st.volOrig = Number(e.target.value); });
      $('#vs', el)?.addEventListener('input', (e) => { st.volSound = Number(e.target.value); });
      $('#vsrc', el)?.addEventListener('input', (e) => { st.volSource = Number(e.target.value); });
      $('#vme', el)?.addEventListener('input', (e) => { st.volMe = Number(e.target.value); });
      bindLayoutChips(el);
      const srcVid = $('.duet-src', el);
      if (srcVid) srcVid.play().catch(() => {});
      $('#setCover', el).addEventListener('click', async () => { st.cover = v.currentTime || st.start; try { st.poster = await captureFrame(v, st.cover, { filter: st.filter, texts: st.texts }); toast(t('coverSet'), 'ok'); } catch { toast(t('coverFail'), 'warn'); } });
      $('#goExport', el).addEventListener('click', async () => {
        const btn = $('#goExport', el); btn.disabled = true; btn.textContent = t('exporting');
        try {
          if (!st.poster) try { st.poster = await captureFrame(v, st.cover || (st.start + st.end) / 2, { filter: st.filter, texts: st.texts }); } catch {}
          const onP = (p) => { btn.textContent = `${t('exporting')} ${Math.round(p * 100)}٪`; };
          const out = remixType === 'duet' && remixSrc
            ? await exportDuet({ sourceUrl: remixSrc.src, userUrl: st.url, layout: st.layout, sourceSide: st.sourceSide, userStart: st.start, userEnd: st.end, speed: st.speed, filter: st.filter, texts: st.texts, coverTime: st.cover, volSource: st.volSource, volUser: st.volMe }, onP)
            : remixType === 'stitch' && remixSrc
            ? await exportStitch({ sourceUrl: remixSrc.src, userUrl: st.url, stitchStart: st.stitchStart, stitchEnd: st.stitchEnd, userStart: st.start, userEnd: st.end, speed: st.speed, filter: st.filter, texts: st.texts, coverTime: st.cover, volSource: st.volSource, volUser: st.volMe }, onP)
            : await exportClip({
            sourceUrl: st.url, start: st.start, end: st.end, speed: st.speed, filter: st.filter, texts: st.texts,
            coverTime: st.cover, soundUrl: sound?.src || null, volOrig: st.volOrig, volSound: st.volSound
          }, onP);
          st.exported = out; st.poster = out.poster || st.poster;
          st.step = 'publish'; await draw();
        } catch (e) {
          console.warn(e);
          if (!remixType && st.file) { toast(t('rawUploadNote'), 'warn'); st.exported = null; st.step = 'publish'; await draw(); return; }   // نشر الأصل والخادم يجهّزه
          toast(t(e.message === 'noRecorder' ? 'noRecorderHint' : 'exportFail'), 'warn');
          btn.disabled = false; btn.textContent = t('exportNext');
        }
      });
      return;
    }

    // publish
    const file = st.exported ? blobToFile(st.exported.blob, st.exported.mime) : st.file;
    el.innerHTML = `<div class="page studio">${pageHead(t('publish'))}
      <div class="pub-prev">${st.poster ? `<img src="${st.poster}" alt="">` : ''}<p class="muted sm">${esc(t('exportHint'))}</p></div>
      <form class="upload-form" id="pub">
        <label class="field"><span>${esc(t('caption'))}</span><textarea name="caption" rows="3" maxlength="300" placeholder="${esc(t('captionPh'))}"></textarea></label>
        <label class="field"><span>${esc(t('hashtags'))}</span><input name="hashtags" placeholder="${esc(t('hashtagsPh'))}"></label>
        ${sound ? `<p class="note">${icon('music', { size: 16 })} ${esc(sound.title)}</p>` : `<label class="check-row"><input type="checkbox" name="saveSound" value="1"> ${esc(t('saveAsSound'))}</label>`}
        <fieldset class="field"><legend>${esc(t('publishWhen'))}</legend>
          <label class="radio-row"><input type="radio" name="when" value="now" checked> ${esc(t('publishNow'))}</label>
          <label class="radio-row"><input type="radio" name="when" value="draft"> ${esc(t('saveDraft'))}</label>
          <label class="radio-row"><input type="radio" name="when" value="schedule"> ${esc(t('schedulePublish'))}</label>
          <label class="field" id="schedWrap" hidden><span>${esc(t('scheduleAt'))}</span><input type="datetime-local" name="scheduledAt"></label>
        </fieldset>
        <fieldset class="field"><legend>${icon('bag', { size: 16 })} ${esc(t('attachProducts'))}</legend>
          ${products.length ? `<div class="tag-products">${products.map((p) => `<label class="tagp"><input type="checkbox" name="products" value="${p.id}"><img src="${productImg(p)}" alt=""><span><b>${esc(p.name)}</b><small>${esc(fmtKWD(p.price))}</small></span><i class="tick">${icon('check', { size: 14 })}</i></label>`).join('')}</div>`
            : `<p class="muted sm">${esc(store && !active ? t('storeInactive') : t('noStoreForTag'))} <a href="${store ? '#/dashboard' : '#/rent'}">${esc(store ? t('dashboard') : t('rentNow'))}</a></p>`}
        </fieldset>
        <button class="btn primary block lg" type="submit">${esc(t('publish'))}</button>
        <button class="btn ghost block" type="button" id="backEdit">${esc(t('backEdit'))}</button>
      </form></div>`;
    $('#backEdit', el).addEventListener('click', async () => { st.step = 'edit'; st.exported = null; await draw(); });
    el.querySelectorAll('input[name=when]').forEach((r) => r.addEventListener('change', () => { $('#schedWrap', el).hidden = el.querySelector('input[name=when]:checked')?.value !== 'schedule'; }));
    $('#pub', el).addEventListener('submit', async (e) => {
      e.preventDefault(); if (!file) { toast(t('pickFirst'), 'warn'); return; }
      const btn = $('button[type=submit]', el); btn.disabled = true; btn.textContent = t('publishing');
      try {
        const fd = new FormData(e.target);
        const when = fd.get('when') || 'now';
        const payload = {
          file, poster: st.poster, caption: fd.get('caption'), hashtags: String(fd.get('hashtags') || '').split(/[\s,،]+/).filter(Boolean),
          sound: sound?.title || null, soundId: sound?.id || null, saveSound: !sound && fd.get('saveSound') === '1',
          productIds: $$('input[name=products]:checked', el).map((i) => i.value)
        };
        if (remixType && remixSrc) { payload.sourceClipId = remixSrc.id; payload.remixType = remixType; }
        if (when === 'draft') payload.status = 'draft';
        if (when === 'schedule') { payload.status = 'scheduled'; payload.scheduledAt = new Date(fd.get('scheduledAt')).toISOString(); if (!fd.get('scheduledAt') || Number.isNaN(+new Date(fd.get('scheduledAt')))) { toast(t('scheduleNeed'), 'warn'); btn.disabled = false; btn.textContent = t('publish'); return; } }
        const v = await api.createVideo(payload);
        toast(when === 'draft' ? t('draftSaved') : when === 'schedule' ? t('scheduledOk') : v.mediaStatus === 'processing' ? t('publishedProcessing') : t('published'), 'ok'); cleanupMedia(); ctx.navigate(when === 'now' ? '#/watch/' + v.id : '#/drafts');
      } catch (err) {
        console.warn(err); toast(uploadErrorText(err), 'warn');
        btn.disabled = false; btn.textContent = t('publish');
      }
    });
  }

  await draw();
  return () => cleanupMedia();
}
