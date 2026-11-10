// © 2026 وطن النهار — المسودات والمقاطع المجدولة
import { api } from '../services/index.js';
import { t } from '../i18n.js';
import { icon, esc, $, toast, emptyState } from '../ui.js';
import { pageHead, videoGrid } from './common.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (!api.social) { el.innerHTML = `<div class="page">${pageHead(t('drafts'))}${emptyState(t('serverOnly'))}</div>`; return; }
  const rows = await api.listDrafts();
  const drafts = rows.filter((v) => v.status === 'draft');
  const sched = rows.filter((v) => v.status === 'scheduled');
  el.innerHTML = `<div class="page">${pageHead(t('drafts'))}
    <h2 class="sec-title">${esc(t('drafts'))}</h2>
    ${drafts.length ? list(drafts, true) : emptyState(t('noDrafts'))}
    <h2 class="sec-title">${esc(t('scheduled'))}</h2>
    ${sched.length ? list(sched, false) : `<p class="muted">${esc(t('noScheduled'))}</p>`}
  </div>`;
  el.querySelectorAll('[data-pub]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; await api.updateVideo(b.dataset.pub, { status: 'published' }); toast(t('published'), 'ok'); ctx.rerender();
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('confirmDeleteDraft'))) return;
    await api.deleteVideo(b.dataset.del);
    toast(t('deleted'), 'ok'); ctx.rerender();
  }));
}
function list(videos, canPub) {
  return `<ul class="draft-list">${videos.map((v) => `<li class="draft-row">
    <a href="#/watch/${v.id}"><img src="${esc(v.poster || '')}" alt=""></a>
    <div class="grow"><b>${esc(v.caption || t('videos'))}</b>
      <div class="muted sm">${v.status === 'scheduled' && v.scheduledAt ? esc(t('scheduledFor', { d: new Date(v.scheduledAt).toLocaleString() })) : esc(t('draft'))}</div></div>
    ${canPub ? `<button class="btn sm primary" data-pub="${v.id}">${esc(t('publishNow'))}</button>` : ''}
    <button class="btn sm ghost" data-del="${v.id}">${esc(t('delete'))}</button>
  </li>`).join('')}</ul>`;
}
