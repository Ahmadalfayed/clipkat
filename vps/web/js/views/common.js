import { t } from '../i18n.js';
import { icon, esc, avatarOf } from '../ui.js';
import { prefsButtons } from '../app.js';

export function pageHead(title, { back = true, extra = '' } = {}) {
  return `<header class="page-head">${back ? `<button class="icon-btn" data-act="back" aria-label="${esc(t('back'))}">${icon('back', { size: 22, cls: 'flip-rtl' })}</button>` : '<span class="ph-spacer"></span>'}<h1>${esc(title)}</h1><div class="ph-tools">${extra}${prefsButtons()}</div></header>`;
}
export function videoGrid(videos, { from = '', own = false } = {}) {
  const inner = (v) => `<img src="${esc(v.poster || '')}" alt="" loading="lazy"><span class="vviews">${icon('play', { size: 12, fill: true })} ${esc(fmtViews(v))}</span>${v.productIds?.length ? `<span class="vshop">${icon('bag', { size: 12 })}</span>` : ''}`;
  return `<div class="vgrid">${videos.map((v) => own
    ? `<div class="vcell" data-vid="${esc(v.id)}"><a class="vcell-link" href="#/watch/${v.id}${from}" aria-label="${esc(v.caption)}">${inner(v)}</a><button class="vmore" data-vmore="${esc(v.id)}" aria-label="${esc(t('videoOptions'))}">⋯</button></div>`
    : `<a class="vcell" href="#/watch/${v.id}${from}" aria-label="${esc(v.caption)}">${inner(v)}</a>`).join('')}</div>`;
}
// حذف فيديو يملكه المستخدم: رسالة تأكيد عربية ثم الحذف من الخادم. يرجع true عند النجاح.
export function confirmDialog({ title, text, ok, cancel = t('cancel'), okIcon = 'trash', okCls = 'danger' }) {
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (done) return; done = true; resolve(v); };
    const body = document.createElement('div'); body.className = 'confirm-box';
    body.innerHTML = `<p class="confirm-text">${esc(text)}</p><div class="confirm-acts"><button class="btn ${okCls} block lg" data-ok>${okIcon ? icon(okIcon, { size: 18 }) : ''} ${esc(ok)}</button><button class="btn ghost block" data-no>${esc(cancel)}</button></div>`;
    const sh = openSheet({ title, body, cls: 'confirm-sheet', onClose: () => finish(false) });
    body.querySelector('[data-ok]').onclick = () => { finish(true); sh.close(); };
    body.querySelector('[data-no]').onclick = () => sh.close();
    setTimeout(() => body.querySelector('[data-no]')?.focus(), 80);   // التركيز على «إلغاء» حتى لا يحذف Enter بالخطأ
  });
}
export async function deleteMyVideo(id) {
  if (!(await confirmDialog({ title: t('deleteVideo'), text: t('deleteVideoQ'), ok: t('deleteVideo') }))) return false;
  try { await api.deleteVideo(id); toast(t('videoDeleted'), 'ok'); return true; }
  catch (e) { toast(t(e.status === 403 ? 'deleteVideoForbidden' : 'deleteVideoFail'), 'err'); return false; }
}
export function videoOptionsSheet(id, onDeleted) {
  const sh = openSheet({ title: t('videoOptions'), body: `<div class="menu-list"><a class="btn block ghost" href="#/watch/${esc(id)}">${icon('play', { size: 16 })} ${esc(t('watchVideo'))}</a><button class="btn block ghost bad del-video" data-m="delete">${icon('trash', { size: 16 })} ${esc(t('deleteVideo'))}</button></div>` });
  sh.body.querySelector('[data-m=delete]').onclick = async () => { sh.close(); if (await deleteMyVideo(id)) onDeleted?.(id); };
  sh.body.querySelector('a').onclick = () => sh.close();
}
import { fmtNum } from '../i18n.js';
const fmtViews = (v) => fmtNum((v.base?.views || 0) + 1);
export function userRow(u, extra = '') {
  return `<a class="urow" href="#/profile/${u.id}"><img class="av" src="${avatarOf(u)}" alt=""><span class="grow"><b>${esc(u.name)}</b><span class="muted"><bdi>@${esc(u.username)}</bdi></span></span>${extra}</a>`;
}

// ===== المرحلة 1: تبليغ وحظر (© 2026 وطن النهار) =====
import { api } from '../services/index.js';
import { openSheet, toast } from '../ui.js';
const REASONS = ['spam', 'harassment', 'hate', 'violence', 'nudity', 'scam', 'ip', 'other'];
export function openReportSheet(type, id) {
  const form = document.createElement('form'); form.className = 'form';
  form.innerHTML = `<fieldset class="field"><legend>${esc(t('reportReason'))}</legend>${REASONS.map((r, i) => `<label class="radio-row"><input type="radio" name="reason" value="${r}" ${i === 0 ? 'checked' : ''}> ${esc(t('r_' + r))}</label>`).join('')}</fieldset>
    <label class="field"><span>${esc(t('reportDetails'))}</span><textarea name="details" rows="2" maxlength="500"></textarea></label>
    <button class="btn primary block" type="submit">${esc(t('report'))}</button>`;
  const title = t(type === 'video' ? 'reportVideo' : type === 'user' ? 'reportUser' : 'reportComment');
  const sh = openSheet({ title, body: form });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(form); const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await api.report({ type, id, reason: fd.get('reason'), details: fd.get('details') }); sh.close(); toast(t('reportSent'), 'ok'); }
    catch (err) { btn.disabled = false; toast(t(err.message === 'alreadyReported' ? 'alreadyReported' : err.message), 'warn'); }
  });
}
export async function confirmBlock(user) {
  if (!confirm(t('blockConfirm', { u: user.username }))) return false;
  await api.block(user.id); toast(t('blockedOk'), 'ok'); return true;
}
