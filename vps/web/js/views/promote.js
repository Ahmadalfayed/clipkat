// © 2026 وطن النهار — «روّج فيديوك»: معالج إنشاء حملة (#/promote/<videoId>) وصفحة «حملاتي» (#/campaigns)
import { api } from '../services/index.js';
import { t, fmtDate } from '../i18n.js';
import { esc, $, $$, toast, emptyState, icon } from '../ui.js';
import { pageHead, confirmDialog } from './common.js';
import { rq } from '../rtc.js';
import { coin, fmtInt } from '../gifts.js';

const OBJ_ICON = { views: '👀', profile: '🏪', follows: '➕', messages: '💬' };
const AGES = [13, 18, 25, 35, 45, 55, 65];
const errMsg = (e) => { const k = 'e_' + (e?.message || ''); const s = t(k); return s === k ? (e?.message || 'error') : s; };

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (api.mode === 'local') { el.innerHTML = `<div class="page">${pageHead(t('promoteVideo'))}${emptyState(t('notFound'))}</div>`; return; }
  return params.name === 'campaigns' ? campaigns(el, params, ctx) : wizard(el, params, ctx);
}

// ---------------- اختيار الفيديو ----------------
async function pickVideo(el, ctx) {
  const raw = await api.listVideos({ userId: ctx.me.id });
  const vids = (Array.isArray(raw) ? raw : raw.videos || []).filter((v) => (v.status || 'published') === 'published' && v.mediaStatus !== 'processing');
  el.innerHTML = `<div class="page">${pageHead(t('promoteVideo'), { extra: `<a class="btn sm ghost" href="#/campaigns">${esc(t('myCampaigns'))}</a>` })}
    <h2 class="sec-title">${esc(t('pr_pickVideo'))}</h2>
    ${vids.length ? `<div class="vgrid pr-pick">${vids.map((v) => `<a class="vcell" href="#/promote/${v.id}" aria-label="${esc(v.caption)}"><img src="${esc(v.poster || '')}" alt="" loading="lazy"><span class="pr-pick-cta">${esc(t('promote'))}</span></a>`).join('')}</div>`
      : emptyState(t('pr_noVideos'), '', `<a class="btn primary" href="#/upload">${esc(t('upload'))}</a>`)}
  </div>`;
}

// ---------------- المعالج ----------------
async function wizard(el, params, ctx) {
  const vid = params.args[0];
  if (!vid) return pickVideo(el, ctx);
  const [v, cfg, w, ints, me] = await Promise.all([
    api.getVideo(vid), rq('GET', '/promote/config'), rq('GET', '/wallet'),
    rq('GET', '/promote/interests').catch(() => ({ interests: [] })), api.getProfileFresh ? api.getProfileFresh(ctx.me.id) : ctx.me
  ]);
  if (!v || v.userId !== ctx.me.id) { el.innerHTML = `<div class="page">${pageHead(t('promoteVideo'))}${emptyState(t('notFound'))}</div>`; return; }
  const s = { step: 0, objective: 'views', audience: 'smart', governorates: [], ageMin: '', ageMax: '', gender: 'all', interests: [], budgetType: 'daily', daily: 20, total: 100, days: 5 };
  const steps = ['pr_stepGoal', 'pr_stepAudience', 'pr_stepBudget', 'pr_stepReview'];
  const totalCoins = () => (s.budgetType === 'daily' ? s.daily * s.days : s.total);
  const est = () => { const imp = totalCoins() * cfg.perCoin; return { low: Math.floor(imp * 0.8), high: Math.ceil(imp * 1.2), imp }; };
  const balance = w.coins;

  el.innerHTML = `<div class="page pr-wiz">${pageHead(t('promoteVideo'), { extra: `<a class="btn sm ghost" href="#/campaigns">${esc(t('myCampaigns'))}</a>` })}
    <div class="pr-video card"><img src="${esc(v.poster || '')}" alt=""><div class="grow"><b class="pr-cap">${esc(v.caption || '—')}</b><small class="muted">${esc(t('pr_balance'))}: ${coin(14)} <b dir="ltr">${fmtInt(balance)}</b></small></div></div>
    ${me?.isPrivate ? `<div class="warn">${esc(t('pr_privateAcc'))} <a href="#/settings">${esc(t('settings'))}</a></div>` : ''}
    <ol class="pr-steps" aria-label="${esc(t('promoteVideo'))}">${steps.map((k, i) => `<li data-i="${i}"><span>${i + 1}</span><em>${esc(t(k))}</em></li>`).join('')}</ol>
    <div id="prBody"></div>
    <div class="pr-bar"><button class="btn ghost" id="prPrev">${esc(t('pr_prev'))}</button><button class="btn primary" id="prNext">${esc(t('pr_next'))}</button></div>
  </div>`;
  const body = $('#prBody', el);

  const goalHTML = () => `<h2 class="sec-title">${esc(t('pr_goalQ'))}</h2><div class="pr-opts" role="radiogroup">${cfg.objectives.map((o) => `
    <button type="button" class="pr-opt ${s.objective === o ? 'on' : ''}" role="radio" aria-checked="${s.objective === o}" data-obj="${o}"><span class="pr-ic" aria-hidden="true">${OBJ_ICON[o]}</span><span class="grow"><b>${esc(t('pr_obj_' + o))}</b><small>${esc(t('pr_obj_' + o + 'Sub'))}</small></span><i class="pr-radio" aria-hidden="true"></i></button>`).join('')}</div>`;

  const audHTML = () => `<div class="pr-opts" role="radiogroup">
      ${['smart', 'manual'].map((a) => `<button type="button" class="pr-opt ${s.audience === a ? 'on' : ''}" role="radio" aria-checked="${s.audience === a}" data-aud="${a}"><span class="pr-ic" aria-hidden="true">${a === 'smart' ? '✨' : '🎯'}</span><span class="grow"><b>${esc(t(a === 'smart' ? 'pr_audSmart' : 'pr_audManual'))}</b><small>${esc(t(a === 'smart' ? 'pr_audSmartSub' : 'pr_audManualSub'))}</small></span><i class="pr-radio" aria-hidden="true"></i></button>`).join('')}
    </div>
    ${s.audience === 'manual' ? `<section class="card pr-manual">
      <h3>${esc(t('pr_gov'))}</h3>
      <div class="chips wrap"><button type="button" class="chip ${s.governorates.length ? '' : 'on'}" data-gov="">${esc(t('pr_govAll'))}</button>${cfg.governorates.map((g) => `<button type="button" class="chip ${s.governorates.includes(g) ? 'on' : ''}" data-gov="${g}">${esc(t('gov_' + g))}</button>`).join('')}</div>
      <h3>${esc(t('pr_age'))}</h3>
      <div class="pr-age"><select id="ageMin" aria-label="${esc(t('pr_age'))} min"><option value="">${esc(t('pr_ageAll'))}</option>${AGES.slice(0, -1).map((a) => `<option ${String(s.ageMin) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select><span>—</span><select id="ageMax" aria-label="${esc(t('pr_age'))} max"><option value="">${esc(t('pr_ageAll'))}</option>${AGES.slice(1).map((a) => `<option ${String(s.ageMax) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <h3>${esc(t('pr_gender'))}</h3>
      <div class="seg">${['all', 'male', 'female'].map((g) => `<button type="button" class="${s.gender === g ? 'on' : ''}" data-gender="${g}">${esc(t('pr_g_' + g))}</button>`).join('')}</div>
      <h3>${esc(t('pr_interests'))}</h3>
      ${ints.interests.length ? `<div class="chips wrap">${ints.interests.map((x) => `<button type="button" class="chip ${s.interests.includes(x) ? 'on' : ''}" data-int="${esc(x)}">#${esc(x)}</button>`).join('')}</div>` : `<p class="muted sm">${esc(t('pr_noInterests'))}</p>`}
      <p class="note sm">${esc(t('pr_demoNote'))}</p>
    </section>` : ''}`;

  const estHTML = () => {
    const e = est(); const tot = totalCoins(); const short = tot > balance; const low = tot < cfg.minCoins;
    return `<section class="card pr-est" aria-live="polite">
      <div class="pr-est-head"><b>${esc(t('pr_estimate'))}</b><span class="pill">${esc(t('pr_estimateTag'))}</span></div>
      <p class="pr-est-num" dir="ltr">${fmtInt(e.low)} – ${fmtInt(e.high)}</p><small class="muted">${esc(t('pr_impr'))}</small>
      <p class="muted sm">${esc(t('pr_estimateHow', { n: cfg.perCoin }))}</p>
      <div class="pr-sum"><span>${esc(t('pr_total'))}</span><b>${coin(16)} <span dir="ltr">${fmtInt(tot)}</span></b></div>
      <div class="pr-sum"><span>${esc(t('pr_balance'))}</span><b>${coin(16)} <span dir="ltr">${fmtInt(balance)}</span></b></div>
      ${low ? `<p class="form-err">${esc(t('pr_min', { n: cfg.minCoins }))}</p>` : short ? `<div class="warn sm">${esc(t('pr_needCoins'))} <a class="btn sm primary" href="#/coins">${esc(t('pr_recharge'))}</a></div>` : ''}
    </section>`;
  };
  const budgetHTML = () => {
    const quick = s.budgetType === 'daily' ? [10, 20, 50, 100] : [50, 100, 200, 500];
    return `<section class="card">
      <h3>${esc(t('pr_budgetType'))}</h3>
      <div class="seg">${['daily', 'total'].map((b) => `<button type="button" class="${s.budgetType === b ? 'on' : ''}" data-btype="${b}">${esc(t(b === 'daily' ? 'pr_daily' : 'pr_totalType'))}</button>`).join('')}</div>
      <label class="pr-amount">${coin(22)}<input id="prAmt" type="number" inputmode="numeric" min="1" max="${cfg.maxCoins}" dir="ltr" value="${s.budgetType === 'daily' ? s.daily : s.total}" aria-label="${esc(t(s.budgetType === 'daily' ? 'pr_coinsPerDay' : 'pr_coinsTotal'))}"><span>${esc(t(s.budgetType === 'daily' ? 'pr_coinsPerDay' : 'pr_coinsTotal'))}</span></label>
      <div class="chips wrap">${quick.map((x) => `<button type="button" class="chip ${(s.budgetType === 'daily' ? s.daily : s.total) === x ? 'on' : ''}" data-q="${x}">${fmtInt(x)}</button>`).join('')}</div>
      <h3>${esc(t('pr_days'))}: <b id="prDaysV">${esc(s.days === 1 ? t('pr_day1') : t('pr_daysN', { n: s.days }))}</b></h3>
      <input id="prDays" class="pr-range" type="range" min="1" max="${cfg.maxDays}" value="${s.days}" aria-label="${esc(t('pr_days'))}">
    </section>
    ${estHTML()}`;
  };

  const reviewHTML = () => {
    const e = est(); const tot = totalCoins();
    const target = s.audience === 'smart' ? t('pr_audSmart') : [s.governorates.length ? s.governorates.map((g) => t('gov_' + g)).join('، ') : t('pr_govAll'), (s.ageMin || s.ageMax) ? `${s.ageMin || 13}–${s.ageMax || 65}` : t('pr_ageAll'), t('pr_g_' + s.gender), ...s.interests.map((x) => '#' + x)].join(' · ');
    return `<section class="card pr-review">
      <div class="pr-row"><span>${esc(t('pr_goal'))}</span><b>${OBJ_ICON[s.objective]} ${esc(t('pr_obj_' + s.objective))}</b></div>
      <div class="pr-row"><span>${esc(t('pr_target'))}</span><b>${esc(target)}</b></div>
      <div class="pr-row"><span>${esc(t('pr_budget'))}</span><b>${s.budgetType === 'daily' ? `${fmtInt(s.daily)} ${esc(t('pr_coinsPerDay'))} × ${s.days}` : `${fmtInt(s.total)} ${esc(t('pr_coinsTotal'))}`}</b></div>
      <div class="pr-row"><span>${esc(t('pr_days'))}</span><b>${esc(s.days === 1 ? t('pr_day1') : t('pr_daysN', { n: s.days }))}</b></div>
      <div class="pr-row"><span>${esc(t('pr_estimate'))} <span class="pill">${esc(t('pr_estimateTag'))}</span></span><b dir="ltr">${fmtInt(e.low)} – ${fmtInt(e.high)}</b></div>
      <div class="pr-row total"><span>${esc(t('pr_total'))}</span><b>${coin(18)} <span dir="ltr">${fmtInt(tot)}</span></b></div>
    </section>
    <p class="muted sm">${esc(t('pr_reviewNote'))}</p>
    ${tot > balance ? `<div class="warn sm">${esc(t('pr_needCoins'))} <a class="btn sm primary" href="#/coins">${esc(t('pr_recharge'))}</a></div>` : ''}`;
  };

  function draw() {
    body.innerHTML = [goalHTML, audHTML, budgetHTML, reviewHTML][s.step]();
    $$('.pr-steps li', el).forEach((li, i) => { li.classList.toggle('on', i === s.step); li.classList.toggle('done', i < s.step); if (i === s.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    $('#prPrev', el).style.visibility = s.step ? 'visible' : 'hidden';
    updateNext();
  }
  // تحديث جزئي أثناء الكتابة/السحب (بدون إعادة رسم الحقول حتى لا ينقطع السحب أو الكتابة)
  function updateNext() { const nb = $('#prNext', el); const tot = totalCoins(); nb.textContent = s.step === 3 ? t('pr_submit', { n: fmtInt(tot) }) : t('pr_next'); nb.disabled = (s.step >= 2 && (tot < cfg.minCoins || tot > balance)) || (s.step === 3 && !!me?.isPrivate); }
  function redrawBudget() {
    const dv = $('#prDaysV', el); if (dv) dv.textContent = s.days === 1 ? t('pr_day1') : t('pr_daysN', { n: s.days });
    const cur = s.budgetType === 'daily' ? s.daily : s.total;
    $$('[data-q]', body).forEach((c) => c.classList.toggle('on', +c.dataset.q === cur));
    const ec = $('.pr-est', body); if (ec) ec.outerHTML = estHTML();
    updateNext();
  }

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.obj) s.objective = b.dataset.obj;
    else if (b.dataset.aud) s.audience = b.dataset.aud;
    else if (b.dataset.gov !== undefined) { const g = b.dataset.gov; s.governorates = !g ? [] : s.governorates.includes(g) ? s.governorates.filter((x) => x !== g) : [...s.governorates, g]; if (s.governorates.length === cfg.governorates.length) s.governorates = []; }
    else if (b.dataset.gender) s.gender = b.dataset.gender;
    else if (b.dataset.int) { const x = b.dataset.int; s.interests = s.interests.includes(x) ? s.interests.filter((y) => y !== x) : [...s.interests, x].slice(0, 10); }
    else if (b.dataset.btype) s.budgetType = b.dataset.btype;
    else if (b.dataset.q) { if (s.budgetType === 'daily') s.daily = +b.dataset.q; else s.total = +b.dataset.q; const inp = $('#prAmt', el); if (inp) inp.value = b.dataset.q; redrawBudget(); return; }
    else return;
    draw();
  });
  body.addEventListener('change', (e) => {
    if (e.target.id === 'ageMin') s.ageMin = e.target.value;
    if (e.target.id === 'ageMax') s.ageMax = e.target.value;
    if (s.ageMin && s.ageMax && +s.ageMin > +s.ageMax) { [s.ageMin, s.ageMax] = [s.ageMax, s.ageMin]; draw(); }
  });
  body.addEventListener('input', (e) => {
    if (e.target.id === 'prAmt') { const n = Math.max(0, Math.min(cfg.maxCoins, Math.floor(+e.target.value || 0))); if (s.budgetType === 'daily') s.daily = n; else s.total = n; redrawBudget(); }
    if (e.target.id === 'prDays') { s.days = +e.target.value; redrawBudget(); }
  });
  $('#prPrev', el).onclick = () => { if (s.step) { s.step--; draw(); window.scrollTo(0, 0); } };
  $('#prNext', el).onclick = async (ev) => {
    if (s.step < 3) { s.step++; draw(); window.scrollTo(0, 0); return; }
    const btn = ev.currentTarget; btn.disabled = true;
    const payload = { videoId: v.id, objective: s.objective, audience: s.audience, budgetType: s.budgetType, days: s.days, dailyCoins: s.daily, totalCoins: s.total };
    if (s.audience === 'manual') Object.assign(payload, { governorates: s.governorates, ageMin: s.ageMin || null, ageMax: s.ageMax || null, gender: s.gender, interests: s.interests });
    try { await rq('POST', '/promotions', payload); toast(t('pr_submitted'), 'ok'); ctx.navigate('#/campaigns'); }
    catch (e) { toast(errMsg(e), 'warn'); btn.disabled = false; }
  };
  draw();
}

// ---------------- حملاتي ----------------
export const statusPill = (p) => `<span class="pr-st st-${esc(p.status)}">${esc(t('pr_st_' + p.status))}</span>`;
export function statsGrid(p) {
  const cells = [['pr_impressions', p.impressions], ['pr_views', p.views], ['pr_clicks', p.clicks], ['pr_follows', p.follows], ['pr_spent', p.spentCoins, true], ['pr_remaining', p.remainingCoins, true]];
  return `<div class="pr-stats">${cells.map(([k, n, c]) => `<div><b dir="ltr">${c ? coin(13) + ' ' : ''}${fmtInt(n)}</b><span>${esc(t(k))}</span></div>`).join('')}</div>`;
}
const pct = (p) => Math.min(100, Math.round((p.impressions / Math.max(1, p.maxImpressions)) * 100));

async function campaigns(el, params, ctx) {
  const d = await rq('GET', '/promotions');
  const list = d.promotions || [];
  el.innerHTML = `<div class="page">${pageHead(t('myCampaigns'), { extra: `<a class="btn sm primary" href="#/promote">${icon('plus', { size: 14 })} ${esc(t('newCampaign'))}</a>` })}
    ${list.length ? list.map((p) => `<article class="card pr-camp" data-id="${esc(p.id)}">
      <div class="pr-camp-head">${p.poster ? `<img src="${esc(p.poster)}" alt="">` : '<span class="pr-noimg">🎬</span>'}
        <div class="grow"><b class="pr-cap">${esc(p.caption || '—')}</b><small class="muted">${OBJ_ICON[p.objective]} ${esc(t('pr_obj_' + p.objective))} · ${esc(fmtDate(p.createdAt))}</small></div>${statusPill(p)}</div>
      ${statsGrid(p)}
      <div class="pr-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(p)}"><i style="width:${pct(p)}%"></i></div>
      <small class="muted pr-foot">${esc(t('pr_of', { a: fmtInt(p.impressions), b: fmtInt(p.maxImpressions) }))} ${esc(t('pr_impr'))}${p.endAt && ['active', 'paused'].includes(p.status) ? ` · ${esc(t('pr_endsAt'))} ${esc(fmtDate(p.endAt))}` : ''}${p.refundedCoins ? ` · ${esc(t('pr_refunded'))}: ${fmtInt(p.refundedCoins)}` : ''}</small>
      ${p.status === 'rejected' && p.rejectReason ? `<p class="warn sm">${esc(t('pr_reason'))}: ${esc(p.rejectReason)}</p>` : ''}
      ${p.status === 'ended' && p.endReason ? `<p class="muted sm">${esc(t('pr_end_' + p.endReason))}</p>` : ''}
      ${p.status === 'pending' ? `<button class="btn sm ghost bad" data-cancel="${esc(p.id)}">${esc(t('pr_cancel'))}</button>` : ''}
    </article>`).join('') : emptyState(t('pr_noCampaigns'), t('pr_noCampaignsSub'), `<a class="btn primary" href="#/promote">${esc(t('promoteVideo'))}</a>`)}
  </div>`;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    if (!(await confirmDialog({ title: t('pr_cancel'), text: t('pr_cancelQ'), ok: t('pr_cancel'), okIcon: '' }))) return;
    b.disabled = true;
    try { await rq('POST', `/promotions/${b.dataset.cancel}/cancel`); toast(t('pr_cancelled'), 'ok'); ctx.rerender(); } catch (er) { toast(errMsg(er), 'warn'); b.disabled = false; }
  });
}
