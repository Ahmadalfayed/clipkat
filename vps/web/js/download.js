// © 2026 وطن النهار — تنزيل الفيديو (مجاني بالشعار / بدون شعار لمشتركي كليب كات بلس) وورقة الاشتراك.
import { t, fmtDate } from './i18n.js';
import { icon, esc, $, toast, openSheet } from './ui.js';
import { rq } from './rtc.js';
import { coin, fmtInt, kwd, newKey, coinCfg, packagesHTML, buyPackage } from './gifts.js';
import { confirmDialog } from './views/common.js';

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// أزرار التنزيل داخل قائمة «⋯» أو ورقة المشاركة (تختفي لغير صاحب الفيديو إن أوقف التنزيل)
export function downloadButtonsHTML(v, own) {
  if (!own && v.canDownload === false) return '';
  return `<div class="dl-group" role="group" aria-label="${esc(t('dlFree'))}">
    <button class="btn block ghost dl-btn" data-m="dl-wm">${icon('download', { size: 18 })}<span class="grow"><b>${esc(t('dlFree'))}</b><small>${esc(t('dlFreeSub'))}</small></span></button>
    <button class="btn block ghost dl-btn" data-m="dl-nowm">${icon('download', { size: 18 })}<span class="grow"><b>${esc(t('dlNoWm'))}</b><small>${esc(own ? t('dlNoWmOwn') : t('dlNoWmSub'))}</small></span>${own ? '' : `<span class="plus-pill">${icon('crown', { size: 12 })} ${esc(t('plusTag'))}</span>`}</button>
    ${own && v.downloads != null ? `<small class="muted dl-count">${icon('download', { size: 13 })} ${esc(t('downloadsN', { n: fmtInt(v.downloads) }))}</small>` : ''}
  </div>`;
}

const errMsg = (e) => (e.message === 'downloadOff' ? t('dlOff') : e.message === 'notReady' ? t('dlNotReady') : e.status === 429 ? t('slowDown') : e.message === 'linkExpired' ? t('dlLinkExpired') : t('dlFail'));

// kind: 'wm' | 'nowm'. v: الفيديو، username: اسم صاحبه. يُستدعى بعد تسجيل الدخول.
export async function startDownload(v, kind, { username = '', own = false, skipConfirm = false } = {}) {
  if (!skipConfirm) {
    const ok = await confirmDialog({ title: kind === 'wm' ? t('dlFree') : t('dlNoWm'), text: kind === 'wm' ? t('dlConfirmFreeQ', { u: username }) : t('dlConfirmNoWmQ'), ok: t('dlGo'), okIcon: 'download', okCls: 'primary' });
    if (!ok) return;
  }
  let r;
  try { r = await rq('POST', `/videos/${v.id}/download`, { kind }); }
  catch (e) {
    if (e.message === 'plusRequired') return openPlusSheet({ onActive: () => startDownload(v, 'nowm', { username, own, skipConfirm: true }) });
    return toast(errMsg(e), 'err');
  }
  if (r.status === 'ready') return deliver(r);
  // النسخة بالشعار قيد التجهيز → لوحة تقدّم + متابعة
  const body = document.createElement('div'); body.className = 'dl-panel';
  body.innerHTML = `<div class="dl-spin" aria-hidden="true"></div><p class="dl-title" role="status" aria-live="polite"><b>${esc(t('dlPreparing'))}</b></p><p class="muted">${esc(t('dlPreparingSub'))}</p>`;
  let closed = false;
  const sh = openSheet({ title: t('dlFree'), body, cls: 'dl-sheet', onClose: () => { closed = true; } });
  const t0 = Date.now();
  while (!closed && Date.now() - t0 < 6 * 60000) {
    await sleep(1500);
    if (closed) return;
    try { r = await rq('GET', `/videos/${v.id}/download/status`); } catch (e) { sh.close(); return toast(errMsg(e), 'err'); }
    if (r.status === 'ready') return deliver(r, { sheet: sh, body });
  }
  if (!closed) { sh.close(); toast(t('dlFail'), 'err'); }
}

// التسليم: آيفون → «حفظ الفيديو» عبر navigator.share (يحتاج لمسة مستخدم)، وإلا تنزيل مباشر (Content-Disposition: attachment)
async function deliver(r, { sheet, body } = {}) {
  if (!body) { body = document.createElement('div'); body.className = 'dl-panel'; sheet = openSheet({ title: r.kind === 'wm' ? t('dlFree') : t('dlNoWm'), body, cls: 'dl-sheet' }); }
  const canShareFiles = !!(navigator.canShare && window.File) && r.size < 200 * 1048576;
  body.innerHTML = `<p class="dl-title"><b>${esc(t('dlReady'))}</b></p><p class="muted"><bdi dir="ltr">${esc(r.filename)}</bdi> · ${(r.size / 1048576).toFixed(1)} MB</p>
    <div class="dl-acts">${canShareFiles && isIOS() ? `<button class="btn primary block lg" data-save>${icon('download', { size: 18 })} ${esc(t('dlSaveVideo'))}</button><small class="muted">${esc(t('dlSaveSub'))}</small>` : ''}
    <a class="btn ${canShareFiles && isIOS() ? 'ghost' : 'primary'} block" data-file href="${esc(r.url)}" download="${esc(r.filename)}">${icon('download', { size: 18 })} ${esc(t('dlFile'))}</a></div>`;
  let blobP = null;
  const save = $('[data-save]', body);
  if (save) {
    blobP = fetch(r.url, { credentials: 'same-origin' }).then((x) => { if (!x.ok) throw new Error(x.status === 403 ? 'linkExpired' : 'failed'); return x.blob(); });
    blobP.catch(() => {});
    save.onclick = async () => {
      save.disabled = true;
      try {
        const file = new File([await blobP], r.filename, { type: 'video/mp4' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'ClipKat' }); sheet?.close(); return; }
        $('[data-file]', body).click();
      } catch (e) { if (e.name !== 'AbortError') toast(errMsg(e), 'err'); }
      finally { save.disabled = false; }
    };
  } else {
    // حاسوب/أندرويد: نبدأ التنزيل تلقائياً
    $('[data-file]', body).click(); toast(t('dlStarted'), 'ok');
  }
  $('[data-file]', body).addEventListener('click', () => setTimeout(() => sheet?.close(), 400));
}

// ---------------- ورقة الاشتراك في كليب كات بلس ----------------
export async function openPlusSheet({ onActive } = {}) {
  const body = document.createElement('div'); body.className = 'plus-sheet-body';
  const sh = openSheet({ title: t('plusName'), body, cls: 'plus-sheet' });
  const draw = async () => {
    let p; try { p = await rq('GET', '/plus'); } catch { body.innerHTML = `<p class="muted">${esc(t('plusFail'))}</p>`; return; }
    const P = p.price; const enough = (p.coins || 0) >= P.coins; const st = p.status || {};
    body.innerHTML = `<div class="plus-hero"><span class="plus-crown">${icon('crown', { size: 26 })}</span><div><b>${esc(t('plusName'))}</b><small>${esc(t('plusSubTitle'))}</small></div></div>
      ${st.active ? `<p class="plus-state on">${icon('check', { size: 16 })} ${esc(t('plusActiveUntil', { d: fmtDate(st.expiresAt) }))}</p>` : ''}
      <div class="plus-price"><b dir="ltr">${esc(kwd(P.kwd))}</b> <span class="muted">${esc(t('plusPerMonth'))}</span> <span class="muted">· ${esc(t('plusOr'))} ·</span> ${coin(18)} <b dir="ltr">${fmtInt(P.coins)}</b></div>
      <ul class="plus-benefits">${['plusB1', 'plusB2', 'plusB3', 'plusB4'].map((k) => `<li>${icon('check', { size: 15 })} ${esc(t(k, { d: P.days }))}</li>`).join('')}</ul>
      <div class="plus-pay">
        <button class="btn primary block lg" data-pay="money">${esc(t(st.active ? 'plusRenew' : 'plusPayMoney', { p: kwd(P.kwd) }))}${st.active ? ` · ${esc(kwd(P.kwd))}` : ''}</button>
        ${p.demo ? `<small class="muted plus-demo">${esc(t('plusDemoNote'))}</small>` : ''}
        <button class="btn block lg ${enough ? 'gold' : 'ghost'}" data-pay="coins" ${enough ? '' : 'aria-disabled="true"'}>${coin(18)} ${esc(t('plusPayCoins', { c: fmtInt(P.coins) }))}</button>
        <p class="plus-bal ${enough ? '' : 'low'}">${coin(14)} ${esc(t('plusYourCoins', { c: fmtInt(p.coins || 0) }))}${enough ? '' : ` — ${esc(t('plusNeedCoins', { c: fmtInt(P.coins) }))}`}
          <button class="linkbtn" data-recharge>${esc(t('plusRecharge'))}</button></p>
        <div class="plus-recharge" hidden></div>
      </div>`;
  };
  await draw();
  const done = async (r) => {
    toast(r.demo ? t('plusDemoDone', { d: fmtDate(r.status.expiresAt) }) : t('plusDone', { d: fmtDate(r.status.expiresAt) }), 'ok');
    sh.close(); onActive?.(r.status);
  };
  body.addEventListener('click', async (e) => {
    const rc = e.target.closest('[data-recharge]');
    if (rc) {
      const box = $('.plus-recharge', body); box.hidden = !box.hidden;
      if (!box.hidden && !box.innerHTML) { try { box.innerHTML = packagesHTML(await coinCfg()); } catch { location.hash = '#/coins'; } }
      return;
    }
    const pk = e.target.closest('[data-pkg]');
    if (pk) { if (await buyPackage(pk.dataset.pkg, pk)) await draw(); return; }
    const b = e.target.closest('[data-pay]'); if (!b) return;
    let p; try { p = await rq('GET', '/plus'); } catch { return toast(t('plusFail'), 'err'); }
    const method = b.dataset.pay;
    if (method === 'coins' && (p.coins || 0) < p.price.coins) { const box = $('.plus-recharge', body); box.hidden = false; if (!box.innerHTML) box.innerHTML = packagesHTML(await coinCfg()); return toast(t('plusNeedCoins', { c: fmtInt(p.price.coins) }), 'warn'); }
    const ok = await confirmDialog({ title: t('plusName'), text: method === 'coins' ? t('plusCoinsConfirmQ', { c: fmtInt(p.price.coins), d: p.price.days }) : t('plusMoneyConfirmQ', { p: kwd(p.price.kwd), d: p.price.days }), ok: method === 'coins' ? t('plusPayCoins', { c: fmtInt(p.price.coins) }) : t('plusPayMoney', { p: kwd(p.price.kwd) }), okIcon: 'crown', okCls: 'primary' });
    if (!ok) return;
    b.disabled = true;
    try {
      const r = await rq('POST', '/plus/subscribe', { method, key: newKey() });
      if (r.redirectUrl) { location.href = r.redirectUrl; return; }
      await done(r);
    } catch (er) {
      if (er.message === 'insufficient') { toast(t('plusNeedCoins', { c: fmtInt(p.price.coins) }), 'warn'); await draw(); }
      else toast(er.message === 'payNotReady' || er.message === 'payNotConfigured' ? t('payNotReady') : er.status === 429 ? t('slowDown') : t('plusFail'), 'err');
    } finally { b.disabled = false; }
  });
  return sh;
}
