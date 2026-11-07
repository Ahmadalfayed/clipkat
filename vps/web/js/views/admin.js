import { api } from '../services/index.js';
import { t, fmtKWD, fmtDate, lang } from '../i18n.js';
import { icon, esc, emptyState } from '../ui.js';
import { pageHead } from './common.js';
import { rentalBadge } from './dashboard.js';
import { toast } from '../ui.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (ctx.me.role !== 'admin') { el.innerHTML = `<div class="page">${pageHead(t('admin'))}${emptyState(t('adminOnly'), '', `<a class="btn" href="#/login">${esc(t('demoAdmin'))}</a>`)}</div>`; return; }
  const d = await api.adminSummary();
  const rstatus = ['open', 'actioned', 'dismissed'].includes(params.query.get('r')) ? params.query.get('r') : 'open';
  const rep = api.social ? await api.adminReports(rstatus) : null;
  const maxM = Math.max(1, ...d.months.map((m) => m.total));
  const mname = (ts) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en', { month: 'short' }).format(new Date(ts));
  const now = Date.now();
  el.innerHTML = `<div class="page wide">${pageHead(t('admin'))}
    <div class="demo-banner">${icon('shield', { size: 18 })}<span>${esc(t('demoPay'))}</span></div>
    <div class="kpis">
      <div class="kpi"><span>${esc(t('revenue'))}</span><b>${esc(fmtKWD(d.revenue))}</b></div>
      <div class="kpi"><span>${esc(t('activeRentals'))}</span><b>${d.activeStores}</b><small>${d.slots.storesUsed}/${d.slots.storesTotal}</small></div>
      <div class="kpi"><span>${esc(t('featured'))}</span><b>${d.slots.featuredUsed}</b><small>/${d.slots.featuredTotal}</small></div>
      ${d.pendingCount ? `<div class="kpi"><span>${esc(t('pendingRentals'))}</span><b>${d.pendingCount}</b></div>` : ''}<div class="kpi"><span>${esc(t('users'))}</span><b>${d.users}</b></div>
      <div class="kpi"><span>${esc(t('totalVideos'))}</span><b>${d.videos}</b></div>
    </div>
    <div class="dash-grid">
      <section class="card"><h2>${esc(t('monthlyRevenue'))}</h2>
        <div class="bars" role="img" aria-label="${esc(t('monthlyRevenue'))}">${d.months.map((m) => `<div class="bar"><i style="height:${Math.max(2, (m.total / maxM) * 100)}%" title="${esc(fmtKWD(m.total))}"></i><small>${esc(mname(m.start))}</small><em>${m.total}</em></div>`).join('')}</div></section>
      <section class="card"><h2>${esc(t('byPlan'))}</h2>
        <ul class="plan-break">${d.byPlan.map((p) => `<li><span>${esc(t('plan_' + p.planId))}</span><span class="muted">×${p.count}</span><b>${esc(fmtKWD(p.total))}</b></li>`).join('')}</ul></section>
    </div>
    <h2 class="sec-title">${icon('chart', { size: 18 })} ${esc(t('rentals'))}</h2>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>${esc(t('store'))}</th><th>${esc(t('owner'))}</th><th>${esc(t('plan'))}</th><th>${esc(t('amount'))}</th><th>${esc(t('method'))}</th><th>${esc(t('date'))}</th><th>${esc(t('expires'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
    ${d.rentals.map((r) => `<tr><td><a href="#/store/${r.storeId}">${esc(r.store?.name)}</a></td><td><bdi>@${esc(r.owner?.username)}</bdi></td><td>${esc(t('plan_' + r.planId))}</td><td>${esc(fmtKWD(r.amount))}</td><td>${esc(t(r.method))}</td><td>${esc(fmtDate(r.paidAt))}</td><td>${r.endAt ? esc(fmtDate(r.endAt)) : '—'}</td>
      <td>${rentalBadge(r)}${r.status === 'pending' && api.activateRental ? ` <button class="btn sm primary" data-activate="${r.id}">${esc(t('activate'))}</button> <button class="btn sm ghost" data-cancel="${r.id}">${esc(t('cancelRental'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${rep ? `<h2 class="sec-title" id="reports">${icon('shield', { size: 18 })} ${esc(t('reports'))}</h2>
    <div class="seg" role="tablist"><a role="tab" href="#/admin?r=open" class="${rstatus === 'open' ? 'on' : ''}">${esc(t('openReports'))}</a><a role="tab" href="#/admin?r=actioned" class="${rstatus === 'actioned' ? 'on' : ''}">${esc(t('closedReports'))}</a><a role="tab" href="#/admin?r=dismissed" class="${rstatus === 'dismissed' ? 'on' : ''}">${esc(t('a_dismiss'))}</a></div>
    ${rep.reports.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('reportReason'))}</th><th>${esc(t('target'))}</th><th>${esc(t('reporter'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
    ${rep.reports.map((x) => { const tu = rep.users.find((u) => u.id === x.targetUserId), ru = rep.users.find((u) => u.id === x.reporterId);
      const what = x.type === 'video' ? `<a href="#/watch/${x.videoId}">${esc(x.videoCaption || x.videoId)}</a>` : x.type === 'comment' ? `«${esc(x.commentText ?? '—')}»` : '';
      const acts = ['dismiss', ...(x.type === 'video' && !x.videoHidden ? ['hide_video'] : []), ...(x.type === 'comment' && x.commentText != null ? ['delete_comment'] : []), ...(tu && tu.role !== 'admin' && !tu.banned ? ['ban_user'] : [])];
      return `<tr><td>${esc(fmtDate(x.createdAt))}</td><td>${esc(t('r_' + x.reason))}${x.details ? `<div class="muted sm">${esc(x.details)}</div>` : ''}</td><td>${esc(t('t_' + x.type))}: <a href="#/profile/${x.targetUserId}"><bdi>@${esc(tu?.username)}</bdi></a> ${what}</td><td><bdi>@${esc(ru?.username)}</bdi></td>
        <td>${x.status === 'open' ? acts.map((a) => `<button class="btn sm ${a === 'dismiss' ? 'ghost' : 'primary'}" data-res="${x.id}" data-action="${a}">${esc(t('a_' + a))}</button>`).join(' ') : esc(t('a_' + x.action))}</td></tr>`; }).join('')}</tbody></table></div>` : emptyState(t('noReports'))}` : ''}
  </div>`;
  el.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.action !== 'dismiss' && !confirm(t('a_' + b.dataset.action) + '?')) return;
    b.disabled = true; try { await api.resolveReport(b.dataset.res, b.dataset.action); toast(t('saved_ok'), 'ok'); ctx.rerender(); } catch (e) { toast(e.message, 'warn'); b.disabled = false; }
  }));
  el.querySelectorAll('[data-activate]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api.activateRental(b.dataset.activate); toast(t('activated'), 'ok'); ctx.rerender(); } catch (e) { console.warn(e); toast(e.message, 'warn'); b.disabled = false; }
  }));
  el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { if (!confirm(t('cancelRental') + '?')) return; await api.cancelRental(b.dataset.cancel); ctx.rerender(); }));
}
