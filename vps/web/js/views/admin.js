import { api } from '../services/index.js';
import { countryName } from '../countries.js';
import { t, fmtKWD, fmtDate, lang } from '../i18n.js';
import { icon, esc, emptyState } from '../ui.js';
import { pageHead } from './common.js';
import { rentalBadge } from './dashboard.js';
import { toast } from '../ui.js';
import { normContact, storeErrorMessage } from '../contact-url.js';
import { rq } from '../rtc.js';
import { fmtInt, coin } from '../gifts.js';
import { statusPill, statsGrid } from './promote.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (ctx.me.role !== 'admin') { el.innerHTML = `<div class="page">${pageHead(t('admin'))}${emptyState(t('adminOnly'), '', `<a class="btn" href="#/login">${esc(t('demoAdmin'))}</a>`)}</div>`; return; }
  const d = await api.adminSummary();
  const rstatus = ['open', 'actioned', 'dismissed'].includes(params.query.get('r')) ? params.query.get('r') : 'open';
  const cstatus = ['pending', 'paid', 'rejected'].includes(params.query.get('c')) ? params.query.get('c') : 'pending';
  const rep = api.social ? await api.adminReports(rstatus) : null;
  let coinReqs = { requests: [] }; let waSet = { adminWhatsapp: '', whatsappEnabled: false };
  const pstatus = ['pending', 'active', 'ended'].includes(params.query.get('p')) ? params.query.get('p') : 'pending';
  let promos = { promotions: [], counts: {} };
  if (api.mode !== 'local') promos = await rq('GET', '/admin/promotions?status=' + pstatus).catch((e) => { console.warn('[admin promos]', e); return promos; });
  if (api.mode !== 'local') {
    try {
      [coinReqs, waSet] = await Promise.all([
        rq('GET', '/admin/coin-requests?status=' + encodeURIComponent(cstatus)),
        rq('GET', '/admin/settings')
      ]);
    } catch (e) { console.warn('[admin coins]', e); }
  }
  const maxM = Math.max(1, ...d.months.map((m) => m.total));
  const mname = (ts) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { month: 'short' }).format(new Date(ts));
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
    <section class="card wa-admin-set" id="waAdminSet">
      <h2>${esc(t('adminWaLabel'))}</h2>
      <form class="form" id="waForm" novalidate>
        <label class="field"><span class="visually-hidden">${esc(t('adminWaLabel'))}</span><input name="number" type="tel" inputmode="tel" dir="ltr" autocomplete="off" maxlength="30" value="${esc(waSet.adminWhatsapp ? waSet.adminWhatsapp.replace(/^https:\/\/wa\.me\//, '') : '')}" placeholder="${esc(t('adminWaPh'))}"></label>
        <p class="form-err" role="alert"></p>
        <p class="muted sm">${esc(t('waAdminHint'))}</p>
        <div class="paylink-actions"><button class="btn sm primary" type="submit">${esc(t('saveChanges'))}</button>${waSet.adminWhatsapp ? `<button class="btn sm ghost" type="submit" data-clear="1">${esc(t('adminWaClear'))}</button>` : ''}</div>
      </form>
    </section>
    <h2 class="sec-title" id="promos">📣 ${esc(t('pr_admin'))}</h2>
    <div class="seg" role="tablist">
      ${[['pending', 'pr_tabPending', promos.counts?.pending], ['active', 'pr_tabActive', (promos.counts?.active || 0) + (promos.counts?.paused || 0)], ['ended', 'pr_tabEnded']].map(([x, k, c]) => `<a role="tab" href="#/admin?p=${x}" class="${pstatus === x ? 'on' : ''}">${esc(t(k))}${c ? ` <span class="pill">${c}</span>` : ''}</a>`).join('')}
    </div>
    <div class="pr-admin">${promos.promotions?.length ? promos.promotions.map((p) => `<article class="card pr-camp">
      <div class="pr-camp-head">${p.poster ? `<a href="#/watch/${esc(p.videoId)}"><img src="${esc(p.poster)}" alt=""></a>` : '<span class="pr-noimg">🎬</span>'}
        <div class="grow"><b class="pr-cap">${esc(p.caption || '—')}</b><small class="muted"><bdi dir="ltr">@${esc(p.user?.username)}</bdi> · ${esc(fmtDate(p.createdAt))}</small></div>${statusPill(p)}</div>
      <div class="pr-row"><span>${esc(t('pr_goal'))}</span><b>${esc(t('pr_obj_' + p.objective))}</b></div>
      <div class="pr-row"><span>${esc(t('pr_budget'))}</span><b>${coin(14)} <span dir="ltr">${fmtInt(p.totalCoins)}</span> · ${esc(p.days === 1 ? t('pr_day1') : t('pr_daysN', { n: p.days }))}${p.budgetType === 'daily' ? ` · ${esc(t('pr_daily'))}` : ''}</b></div>
      <div class="pr-row"><span>${esc(t('pr_target'))}</span><b>${esc(p.audience === 'smart' ? t('pr_audSmart') : [(p.countries || []).length ? p.countries.map(countryName).join('، ') : t('pr_ctyAll'), p.governorates.length ? p.governorates.map((g) => t('gov_' + g)).join('، ') : '', (p.ageBrackets || []).length ? p.ageBrackets.map((a) => a.replace('-', '–')).join('، ') : (p.ageMin || p.ageMax) ? `${p.ageMin || 13}–${p.ageMax || 65}` : '', p.gender !== 'all' ? t('pr_g_' + p.gender) : '', ...p.interests.map((x) => '#' + x)].filter(Boolean).join(' · '))}</b></div>
      ${p.status !== 'pending' ? statsGrid(p) : ''}
      ${p.status === 'rejected' && p.rejectReason ? `<p class="muted sm">${esc(t('pr_reason'))}: ${esc(p.rejectReason)}</p>` : ''}
      ${p.status === 'ended' && p.endReason ? `<p class="muted sm">${esc(t('pr_end_' + p.endReason))}</p>` : ''}
      <div class="pr-acts">${p.status === 'pending' ? `<button class="btn sm primary" data-pr="approve" data-id="${esc(p.id)}">${esc(t('pr_approve'))}</button><button class="btn sm ghost bad" data-pr="reject" data-id="${esc(p.id)}">${esc(t('pr_reject'))}</button>`
        : p.status === 'active' ? `<button class="btn sm ghost" data-pr="pause" data-id="${esc(p.id)}">${esc(t('pr_pause'))}</button><button class="btn sm ghost bad" data-pr="stop" data-id="${esc(p.id)}">${esc(t('pr_stop'))}</button>`
        : p.status === 'paused' ? `<button class="btn sm primary" data-pr="resume" data-id="${esc(p.id)}">${esc(t('pr_resume'))}</button><button class="btn sm ghost bad" data-pr="stop" data-id="${esc(p.id)}">${esc(t('pr_stop'))}</button>` : ''}</div>
    </article>`).join('') : emptyState(t('pr_noAdmin'))}</div>
    <h2 class="sec-title" id="coinReqs">${esc(t('coinReqs'))}</h2>
    <div class="seg" role="tablist">
      ${['pending', 'paid', 'rejected'].map((x) => `<a role="tab" href="#/admin?c=${x}" class="${cstatus === x ? 'on' : ''}">${esc(x === 'pending' ? t('coinPending') : x === 'paid' ? t('coinPaid') : t('coinRejected'))}</a>`).join('')}
    </div>
    ${coinReqs.requests?.length ? `<div class="table-wrap stack"><table class="tbl"><thead><tr><th>${esc(t('owner'))}</th><th>${esc(t('rechargeCoins'))}</th><th>${esc(t('amount'))}</th><th>${esc(t('date'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
      ${coinReqs.requests.map((r) => `<tr>
        <td data-label="${esc(t('owner'))}"><bdi dir="ltr">@${esc(r.user?.username)}</bdi></td>
        <td data-label="${esc(t('rechargeCoins'))}">${esc(fmtInt(r.coins))} · ${esc(t('pkg_' + r.packageId))}</td>
        <td data-label="${esc(t('amount'))}">${esc(fmtKWD(r.price))}</td>
        <td data-label="${esc(t('date'))}">${esc(fmtDate(r.createdAt))}</td>
        <td data-label="${esc(t('status'))}">${r.status === 'pending' ? `<button class="btn sm primary" data-coin-approve="${r.id}">${esc(t('coinApprove'))}</button> <button class="btn sm ghost" data-coin-reject="${r.id}">${esc(t('coinReject'))}</button>${coinPayLinkForm(r)}` : esc(r.status === 'paid' ? t('coinApproved') : t('coinRejected'))}</td>
      </tr>`).join('')}</tbody></table></div>` : emptyState(t('noCoinReqs'))}
    <h2 class="sec-title">${icon('chart', { size: 18 })} ${esc(t('rentals'))}</h2>
    <div class="table-wrap stack"><table class="tbl"><thead><tr><th>${esc(t('store'))}</th><th>${esc(t('owner'))}</th><th>${esc(t('plan'))}</th><th>${esc(t('amount'))}</th><th>${esc(t('method'))}</th><th>${esc(t('date'))}</th><th>${esc(t('expires'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
    ${d.rentals.map((r) => `<tr>
      <td data-label="${esc(t('store'))}"><a href="#/store/${r.storeId}">${esc(r.store?.name)}</a></td>
      <td data-label="${esc(t('owner'))}"><bdi dir="ltr">@${esc(r.owner?.username)}</bdi></td>
      <td data-label="${esc(t('plan'))}">${esc(t('plan_' + r.planId))}</td>
      <td data-label="${esc(t('amount'))}">${esc(fmtKWD(r.amount))}</td>
      <td data-label="${esc(t('method'))}">${esc(t(r.method))}</td>
      <td data-label="${esc(t('date'))}">${esc(fmtDate(r.paidAt))}</td>
      <td data-label="${esc(t('expires'))}">${r.endAt ? esc(fmtDate(r.endAt)) : '—'}</td>
      <td data-label="${esc(t('status'))}">${rentalBadge(r)}${r.status === 'pending' && api.activateRental ? ` <button class="btn sm primary" data-activate="${r.id}">${esc(t('activate'))}</button> <button class="btn sm ghost" data-cancel="${r.id}">${esc(t('cancelRental'))}</button>${api.setRentalPaymentLink ? payLinkForm(r) : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${rep ? `<h2 class="sec-title" id="reports">${icon('shield', { size: 18 })} ${esc(t('reports'))}</h2>
    <div class="seg" role="tablist"><a role="tab" href="#/admin?r=open" class="${rstatus === 'open' ? 'on' : ''}">${esc(t('openReports'))}</a><a role="tab" href="#/admin?r=actioned" class="${rstatus === 'actioned' ? 'on' : ''}">${esc(t('closedReports'))}</a><a role="tab" href="#/admin?r=dismissed" class="${rstatus === 'dismissed' ? 'on' : ''}">${esc(t('a_dismiss'))}</a></div>
    ${rep.reports.length ? `<div class="table-wrap stack"><table class="tbl"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('reportReason'))}</th><th>${esc(t('target'))}</th><th>${esc(t('reporter'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
    ${rep.reports.map((x) => { const tu = rep.users.find((u) => u.id === x.targetUserId), ru = rep.users.find((u) => u.id === x.reporterId);
      const what = x.type === 'video' ? `<a href="#/watch/${x.videoId}">${esc(x.videoCaption || x.videoId)}</a>` : x.type === 'comment' ? `«${esc(x.commentText ?? '—')}»` : x.type === 'sound' ? `<a href="#/sound/${x.soundId}">${esc(x.soundTitle || '')}</a>` : '';
      const acts = ['dismiss', ...(x.type === 'video' && !x.videoHidden ? ['hide_video'] : []), ...(x.type === 'comment' && x.commentText != null ? ['delete_comment'] : []), ...(x.type === 'sound' && !x.soundHidden ? ['hide_sound'] : []), ...(tu && tu.role !== 'admin' && !tu.banned ? ['ban_user'] : [])];
      return `<tr>
        <td data-label="${esc(t('date'))}">${esc(fmtDate(x.createdAt))}</td>
        <td data-label="${esc(t('reportReason'))}">${esc(t('r_' + x.reason))}${x.details ? `<div class="muted sm">${esc(x.details)}</div>` : ''}</td>
        <td data-label="${esc(t('target'))}">${esc(t('t_' + x.type))}: <a href="#/profile/${x.targetUserId}"><bdi dir="ltr">@${esc(tu?.username)}</bdi></a> ${what}</td>
        <td data-label="${esc(t('reporter'))}"><bdi dir="ltr">@${esc(ru?.username)}</bdi></td>
        <td data-label="${esc(t('status'))}">${x.status === 'open' ? acts.map((a) => `<button class="btn sm ${a === 'dismiss' ? 'ghost' : 'primary'}" data-res="${x.id}" data-action="${a}">${esc(t('a_' + a))}</button>`).join(' ') : esc(t('a_' + x.action))}</td></tr>`; }).join('')}</tbody></table></div>` : emptyState(t('noReports'))}` : ''}
  </div>`;
  // العملات وهدايا البث (خادم فقط)
  if (api.mode !== 'local') {
    const gbox = document.createElement('div'); gbox.className = 'gift-admin'; el.querySelector('.dash-grid')?.after(gbox);
    import('./wallet.js').then((m) => m.renderGiftAdmin(gbox)).catch((e) => console.warn('[gifts admin]', e));
    const pbox = document.createElement('div'); pbox.className = 'plus-admin'; gbox.after(pbox);
    import('./wallet.js').then((m) => m.renderPlusAdmin(pbox)).catch((e) => console.warn('[plus admin]', e));
  }
  el.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.pr; let body = {};
    if (act === 'reject') { const reason = prompt(t('pr_rejectQ'), ''); if (reason === null) return; body = { reason }; }
    if (act === 'stop' && !confirm(t('pr_stop') + '?')) return;
    b.disabled = true;
    try { await rq('POST', `/admin/promotions/${b.dataset.id}/${act}`, body); toast(t('saved_ok'), 'ok'); ctx.rerender(); } catch (e) { toast(e.message, 'warn'); b.disabled = false; }
  }));
  el.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.action !== 'dismiss' && !confirm(t('a_' + b.dataset.action) + '?')) return;
    b.disabled = true; try { await api.resolveReport(b.dataset.res, b.dataset.action); toast(t('saved_ok'), 'ok'); ctx.rerender(); } catch (e) { toast(e.message, 'warn'); b.disabled = false; }
  }));
  el.querySelectorAll('[data-activate]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api.activateRental(b.dataset.activate); toast(t('activated'), 'ok'); ctx.rerender(); } catch (e) { console.warn(e); toast(e.message, 'warn'); b.disabled = false; }
  }));
  // رابط الدفع اليدوي: حفظ/تعديل/مسح + إشعار التاجر
  el.querySelectorAll('form.paylink').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const clear = e.submitter?.dataset.clear === '1'; const fd = new FormData(f); const err = f.querySelector('.form-err'); err.textContent = '';
    const url = clear ? '' : normContact(fd.get('url'));
    if (!clear && !url) { err.textContent = t('payLinkBad'); f.querySelector('[name=url]').focus(); return; }
    f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await api.setRentalPaymentLink(f.dataset.rental, { url, note: clear ? '' : fd.get('note') }); toast(clear ? t('payLinkCleared') : t('payLinkSaved'), 'ok'); ctx.rerender(); }
    catch (ex) { err.textContent = ex.field === 'paymentUrl' ? t('payLinkBad') : ex.message === 'notPending' ? t('payNotPending') : storeErrorMessage(ex, t); f.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  }));
  el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { if (!confirm(t('cancelRental') + '?')) return; await api.cancelRental(b.dataset.cancel); ctx.rerender(); }));
  const waForm = el.querySelector('#waForm');
  if (waForm) waForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const clear = e.submitter?.dataset.clear === '1'; const err = waForm.querySelector('.form-err'); err.textContent = '';
    const number = clear ? '' : String(new FormData(waForm).get('number') || '').trim();
    waForm.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await rq('POST', '/admin/settings/whatsapp', { number }); toast(clear || !number ? t('adminWaCleared') : t('adminWaSaved'), 'ok'); ctx.rerender(); }
    catch (ex) { err.textContent = ex.field === 'adminWhatsapp' || ex.message === 'bad' ? t('adminWaBad') : ex.message; waForm.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  });
  el.querySelectorAll('form.coin-paylink').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const clear = e.submitter?.dataset.clear === '1'; const fd = new FormData(f); const err = f.querySelector('.form-err'); err.textContent = '';
    const url = clear ? '' : normContact(fd.get('url'));
    if (!clear && !url) { err.textContent = t('payLinkBad'); f.querySelector('[name=url]').focus(); return; }
    f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { await rq('POST', `/admin/coin-requests/${f.dataset.request}/payment-link`, { url, note: clear ? '' : fd.get('note') }); toast(clear ? t('payLinkCleared') : t('coinPayLinkSaved'), 'ok'); ctx.rerender(); }
    catch (ex) { err.textContent = ex.field === 'paymentUrl' ? t('payLinkBad') : ex.message === 'notPending' ? t('payNotPending') : storeErrorMessage(ex, t); f.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  }));
  el.querySelectorAll('[data-coin-approve]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await rq('POST', `/admin/coin-requests/${b.dataset.coinApprove}/approve`, {}); toast(t('coinApproved'), 'ok'); ctx.rerender(); }
    catch (e) { toast(e.message, 'warn'); b.disabled = false; }
  }));
  el.querySelectorAll('[data-coin-reject]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('coinRejectQ'))) return;
    b.disabled = true;
    try { await rq('POST', `/admin/coin-requests/${b.dataset.coinReject}/reject`, {}); toast(t('coinRejected'), 'ok'); ctx.rerender(); }
    catch (e) { toast(e.message, 'warn'); b.disabled = false; }
  }));
}

function coinPayLinkForm(r) {
  return `<form class="paylink coin-paylink" data-request="${esc(r.id)}" novalidate>
    <label class="field"><span>${esc(t('payLinkLabel'))}</span><input name="url" type="text" inputmode="url" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="300" value="${esc(r.paymentUrl || '')}" placeholder="${esc(t('payLinkPh'))}"></label>
    <label class="field"><span>${esc(t('payNoteLabel'))}</span><input name="note" type="text" maxlength="200" value="${esc(r.paymentNote || '')}" placeholder="${esc(t('payNotePh'))}"></label>
    <p class="form-err" role="alert"></p>
    <div class="paylink-actions"><button class="btn sm primary" type="submit">${esc(t('paySendUser'))}</button>${r.paymentUrl ? `<button class="btn sm ghost" type="submit" data-clear="1">${esc(t('payClear'))}</button><small class="muted">${esc(t('paySentAt', { d: fmtDate(r.paymentLinkSentAt) }))}</small>` : ''}</div>
  </form>`;
}

function payLinkForm(r) {
  return `<form class="paylink" data-rental="${esc(r.id)}" novalidate>
    <label class="field"><span>${esc(t('payLinkLabel'))}</span><input name="url" type="text" inputmode="url" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="300" value="${esc(r.paymentUrl || '')}" placeholder="${esc(t('payLinkPh'))}"></label>
    <label class="field"><span>${esc(t('payNoteLabel'))}</span><input name="note" type="text" maxlength="200" value="${esc(r.paymentNote || '')}" placeholder="${esc(t('payNotePh'))}"></label>
    <p class="form-err" role="alert"></p>
    <div class="paylink-actions"><button class="btn sm primary" type="submit">${esc(t('paySend'))}</button>${r.paymentUrl ? `<button class="btn sm ghost" type="submit" data-clear="1">${esc(t('payClear'))}</button><small class="muted">${esc(t('paySentAt', { d: fmtDate(r.paymentLinkSentAt) }))}</small>` : ''}</div>
  </form>`;
}
