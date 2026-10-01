import { api } from '../services/index.js';
import { t, fmtKWD, fmtDate, lang } from '../i18n.js';
import { icon, esc, emptyState } from '../ui.js';
import { pageHead } from './common.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (ctx.me.role !== 'admin') { el.innerHTML = `<div class="page">${pageHead(t('admin'))}${emptyState(t('adminOnly'), '', `<a class="btn" href="#/login">${esc(t('demoAdmin'))}</a>`)}</div>`; return; }
  const d = await api.adminSummary();
  const maxM = Math.max(1, ...d.months.map((m) => m.total));
  const mname = (ts) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en', { month: 'short' }).format(new Date(ts));
  const now = Date.now();
  el.innerHTML = `<div class="page wide">${pageHead(t('admin'))}
    <div class="demo-banner">${icon('shield', { size: 18 })}<span>${esc(t('demoPay'))}</span></div>
    <div class="kpis">
      <div class="kpi"><span>${esc(t('revenue'))}</span><b>${esc(fmtKWD(d.revenue))}</b></div>
      <div class="kpi"><span>${esc(t('activeRentals'))}</span><b>${d.activeStores}</b><small>${d.slots.storesUsed}/${d.slots.storesTotal}</small></div>
      <div class="kpi"><span>${esc(t('featured'))}</span><b>${d.slots.featuredUsed}</b><small>/${d.slots.featuredTotal}</small></div>
      <div class="kpi"><span>${esc(t('users'))}</span><b>${d.users}</b></div>
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
    ${d.rentals.map((r) => `<tr><td><a href="#/store/${r.storeId}">${esc(r.store?.name)}</a></td><td><bdi>@${esc(r.owner?.username)}</bdi></td><td>${esc(t('plan_' + r.planId))}</td><td>${esc(fmtKWD(r.amount))}</td><td>${esc(t(r.method))}</td><td>${esc(fmtDate(r.paidAt))}</td><td>${esc(fmtDate(r.endAt))}</td>
      <td><span class="status ${r.endAt > now ? 'ok' : 'bad'}"><span class="dot-s"></span>${esc(r.endAt > now ? t('active') : t('expired'))}</span></td></tr>`).join('')}</tbody></table></div>
  </div>`;
}
