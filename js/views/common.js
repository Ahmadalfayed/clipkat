import { t } from '../i18n.js';
import { icon, esc, avatarOf } from '../ui.js';
import { prefsButtons } from '../app.js';

export function pageHead(title, { back = true, extra = '' } = {}) {
  return `<header class="page-head">${back ? `<button class="icon-btn" data-act="back" aria-label="${esc(t('back'))}">${icon('back', { size: 22, cls: 'flip-rtl' })}</button>` : '<span class="ph-spacer"></span>'}<h1>${esc(title)}</h1><div class="ph-tools">${extra}${prefsButtons()}</div></header>`;
}
export function videoGrid(videos, { from = '' } = {}) {
  return `<div class="vgrid">${videos.map((v) => `<a class="vcell" href="#/watch/${v.id}${from}" aria-label="${esc(v.caption)}"><img src="${esc(v.poster || '')}" alt="" loading="lazy"><span class="vviews">${icon('play', { size: 12, fill: true })} ${esc(fmtViews(v))}</span>${v.productIds?.length ? `<span class="vshop">${icon('bag', { size: 12 })}</span>` : ''}</a>`).join('')}</div>`;
}
import { fmtNum } from '../i18n.js';
const fmtViews = (v) => fmtNum((v.base?.views || 0) + 1);
export function userRow(u, extra = '') {
  return `<a class="urow" href="#/profile/${u.id}"><img class="av" src="${avatarOf(u)}" alt=""><span class="grow"><b>${esc(u.name)}</b><span class="muted"><bdi>@${esc(u.username)}</bdi></span></span>${extra}</a>`;
}
