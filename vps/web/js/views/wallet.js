// © 2026 وطن النهار — محفظة العملات (#/coins) وأرباح صانع المحتوى (#/earnings)
import { t, timeAgo, fmtDate } from '../i18n.js';
import { esc, $, toast, avatarOf, emptyState } from '../ui.js';
import { pageHead } from './common.js';
import { rq } from '../rtc.js';
import { coinCfg, coin, fmtInt, kwd, packagesHTML, demoNoticeHTML, buyPackage, giftName } from '../gifts.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  return params.name === 'earnings' ? earnings(el, params, ctx) : coins(el, params, ctx);
}

let giftMap = new Map();
const ledgerLabel = (x) => {
  let extra = '';
  if (x.kind === 'gift_sent' && x.note) { const [id, n] = x.note.split('×'); const g = giftMap.get(id); extra = ` · ${g ? `${g.emoji} ${giftName(g)}` : id}${n && n !== '1' ? ` ×${n}` : ''}`; }
  return t('led_' + x.kind) + extra;
};

async function coins(el, params, ctx) {
  const [cfg, w] = await Promise.all([coinCfg(true), rq('GET', '/wallet')]);
  giftMap = new Map(cfg.gifts.map((g) => [g.id, g]));
  const paid = params.query.get('paid');
  el.innerHTML = `<div class="page">${pageHead(t('myCoins'))}
    ${paid === '1' ? `<div class="note">${esc(t('coinsAddedShort'))}</div>` : paid === '0' ? `<div class="warn">${esc(t('payFailed'))}</div>` : ''}
    <section class="wallet-hero coins"><span class="wh-label">${esc(t('coinBalance'))}</span><b class="wh-val">${coin(34)} <span dir="ltr" id="wBal">${fmtInt(w.coins)}</span></b><small>${esc(t('coinsUse'))}</small></section>
    ${cfg.demo ? demoNoticeHTML() : ''}
    <h2 class="sec-title">${esc(t('rechargeCoins'))}</h2>
    ${packagesHTML(cfg)}
    <p class="muted sm">${esc(t('coinsTermsShort'))} <a href="/terms">${esc(t('termsOfUse'))}</a></p>
    <h2 class="sec-title">${esc(t('coinHistory'))}</h2>
    <div id="wLed">${ledgerHTML(w.ledger)}</div>
    <a class="set-row link card" href="#/earnings"><span class="grow"><b>💎 ${esc(t('myEarnings'))}</b><small class="muted">${esc(t('earningsSub'))}</small></span></a>
  </div>`;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pkg]'); if (!b) return;
    const nw = await buyPackage(b.dataset.pkg, b);
    if (nw) { $('#wBal', el).textContent = fmtInt(nw.coins); const w2 = await rq('GET', '/wallet').catch(() => null); if (w2) $('#wLed', el).innerHTML = ledgerHTML(w2.ledger); }
  });
}
function ledgerHTML(rows) {
  if (!rows?.length) return `<p class="muted">${esc(t('noCoinHistory'))}</p>`;
  return `<ul class="led-list">${rows.map((x) => `<li><span class="grow"><b>${esc(ledgerLabel(x))}</b>${x.note === 'demo' ? ` <span class="pill">${esc(t('demoMode'))}</span>` : ''}<small class="muted">${esc(timeAgo(x.createdAt))}</small></span><b class="led-d ${x.delta > 0 ? 'plus' : 'minus'}" dir="ltr">${x.delta > 0 ? '+' : ''}${fmtInt(x.delta)}</b></li>`).join('')}</ul>`;
}

async function earnings(el, _params, ctx) {
  const d = await rq('GET', '/earnings');
  const pending = d.payouts.find((p) => p.status === 'pending');
  const canReq = !pending && d.diamonds >= d.payoutMinDiamonds;
  el.innerHTML = `<div class="page">${pageHead(t('myEarnings'))}
    <section class="wallet-hero gems"><span class="wh-label">${esc(t('diamondBalance'))}</span><b class="wh-val">💎 <span dir="ltr">${fmtInt(d.diamonds)}</span></b><small>${esc(t('approxValue'))}: <b>${esc(kwd(d.valueKwd))}</b></small></section>
    <div class="kpis"><div class="kpi"><span>${esc(t('lifetimeDiamonds'))}</span><b>💎 ${fmtInt(d.lifetimeDiamonds)}</b></div><div class="kpi"><span>${esc(t('giftsReceived'))}</span><b>${fmtInt(d.giftsCount)}</b></div></div>
    <p class="muted sm">${esc(t('earnExplain', { share: 100 - d.platformShare, value: d.diamondKwd }))}</p>
    ${d.demo ? demoNoticeHTML().replace(esc(t('demoCoinsNote')), esc(t('demoPayoutNote'))) : ''}
    <section class="card"><h2>${esc(t('requestPayout'))}</h2>
      ${pending ? `<p class="note">${esc(t('payoutPendingNote', { n: fmtInt(pending.diamonds), v: kwd(pending.amount) }))}</p>` : d.diamonds < d.payoutMinDiamonds ? `<p class="muted">${esc(t('payoutMinNote', { n: fmtInt(d.payoutMinDiamonds), v: kwd(d.payoutMinDiamonds * d.diamondKwd) }))}</p>` : ''}
      <form class="form" id="poForm" ${canReq ? '' : 'hidden'}>
        <label class="field"><span>${esc(t('payoutAmount'))} (💎)</span><input name="diamonds" type="number" inputmode="numeric" min="${d.payoutMinDiamonds}" max="${d.diamonds}" step="1" value="${d.diamonds}" required dir="ltr"><small class="muted" id="poVal"></small></label>
        <label class="field"><span>${esc(t('accountName'))}</span><input name="accountName" maxlength="80" minlength="2" required autocomplete="name"></label>
        <label class="field"><span>${esc(t('ibanLabel'))}</span><input name="account" maxlength="60" minlength="4" required dir="ltr" autocomplete="off" placeholder="KW00 XXXX 0000 0000 0000 0000 0000 00"></label>
        <label class="field"><span>${esc(t('payoutNote'))}</span><input name="note" maxlength="300"></label>
        <p class="muted sm">${esc(t('payoutManual'))}</p>
        <button class="btn primary block" type="submit">${esc(t('sendPayoutReq'))}</button>
      </form></section>
    ${d.payouts.length ? `<h2 class="sec-title">${esc(t('payoutHistory'))}</h2><ul class="led-list">${d.payouts.map((p) => `<li><span class="grow"><b>💎 ${fmtInt(p.diamonds)} · ${esc(kwd(p.amount))}</b>${p.demo ? ` <span class="pill">${esc(t('demoMode'))}</span>` : ''}<small class="muted">${esc(fmtDate(p.createdAt))}${p.adminNote ? ` — ${esc(p.adminNote)}` : ''}</small></span><span class="po-st ${p.status}">${esc(t('po_' + p.status))}</span></li>`).join('')}</ul>` : ''}
    <h2 class="sec-title">${esc(t('giftHistory'))}</h2>
    ${d.history.length ? `<ul class="led-list">${d.history.map((x) => `<li><img class="av sm" src="${avatarOf(x.from)}" alt=""><span class="grow"><b>${esc(x.from?.name || '')}</b><small class="muted">${esc(x.gift ? `${x.gift.emoji} ${giftName(x.gift)}` : '')}${x.qty > 1 ? ` ×${x.qty}` : ''} · ${esc(timeAgo(x.createdAt))}</small></span><b class="led-d plus" dir="ltr">+${fmtInt(x.diamonds)} 💎</b></li>`).join('')}</ul>` : emptyState(t('noGiftsYet'), t('noGiftsYetSub'), `<a class="btn primary" href="#/golive">${esc(t('goLive'))}</a>`)}
  </div>`;
  const f = $('#poForm', el);
  if (f) {
    const upd = () => { const n = Number(f.diamonds.value) || 0; $('#poVal', el).textContent = `≈ ${kwd(n * d.diamondKwd)}`; };
    f.diamonds.addEventListener('input', upd); upd();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await rq('POST', '/payouts', { diamonds: Number(f.diamonds.value), accountName: f.accountName.value, account: f.account.value, note: f.note.value, method: 'bank' });
        toast(t('payoutSent'), 'ok'); ctx.rerender();
      } catch (er) { toast(t(er.message === 'payoutMin' ? 'payoutMinErr' : er.message === 'insufficient' ? 'notEnoughDiamonds' : er.message === 'payoutPending' ? 'payoutPendingErr' : er.status === 429 ? 'slowDown' : 'payoutFail'), 'err'); }
      finally { btn.disabled = false; }
    });
  }
}

// ---------- قسم لوحة المشرف: إيرادات الهدايا وطلبات السحب ومنح العملات ----------
export async function renderGiftAdmin(box) {
  const st = box.dataset.st || 'pending';
  const [s, p] = await Promise.all([rq('GET', '/admin/gifts'), rq('GET', `/admin/payouts?status=${st}`)]);
  const T = s.totals;
  box.innerHTML = `<h2 class="sec-title" id="giftsAdmin">🎁 ${esc(t('giftRevenue'))}</h2>
    ${s.demo ? `<div class="demo-banner"><span><b>${esc(t('demoMode'))}</b> — ${esc(t('adminDemoNote'))}</span></div>` : ''}
    <div class="kpis">
      <div class="kpi"><span>${esc(t('giftCoinsSpent'))}</span><b>${fmtInt(T.giftCoins)}</b><small>${fmtInt(T.gifts)} 🎁</small></div>
      <div class="kpi"><span>${esc(t('platformShare'))} (${s.platformShare}%)</span><b>${fmtInt(T.platformCoins)}</b><small>≈ ${esc(kwd(T.platformKwdEst))}</small></div>
      <div class="kpi"><span>${esc(t('hostsDiamonds'))}</span><b>💎 ${fmtInt(T.hostDiamonds)}</b></div>
      <div class="kpi"><span>${esc(t('pendingPayouts'))}</span><b>${T.pendingPayouts}</b><small>${esc(kwd(T.pendingKwd))}</small></div>
      <div class="kpi"><span>${esc(t('coinsSold'))}</span><b>${fmtInt(s.purchases.reduce((a, x) => a + x.coins, 0))}</b><small>${s.purchases.map((x) => `${esc(x.provider === 'demo' ? t('demoMode') : x.provider)}: ${esc(kwd(x.kwd))}`).join(' · ') || '—'}</small></div>
      <div class="kpi"><span>${esc(t('grantedCoins'))}</span><b>${fmtInt(T.grantedCoins)}</b></div>
    </div>
    <section class="card"><h2>${esc(t('payoutRequests'))}</h2>
      <div class="seg-tabs">${['pending', 'approved', 'rejected'].map((x) => `<button class="btn sm ${x === st ? 'primary' : 'ghost'}" data-pst="${x}">${esc(t('po_' + x))}</button>`).join('')}</div>
      ${p.payouts.length ? `<ul class="led-list">${p.payouts.map((x) => `<li class="po-row"><img class="av sm" src="${avatarOf(x.user)}" alt=""><span class="grow"><b>${esc(x.user?.name || '')} <bdi dir="ltr" class="muted">@${esc(x.user?.username || '')}</bdi></b>
        <small>💎 ${fmtInt(x.diamonds)} · <b>${esc(kwd(x.amount))}</b>${x.demo ? ` <span class="pill">${esc(t('demoMode'))}</span>` : ''}</small>
        <small class="muted">${esc(x.accountName)} · <bdi dir="ltr">${esc(x.account)}</bdi>${x.note ? ` · ${esc(x.note)}` : ''} · ${esc(fmtDate(x.createdAt))}</small>${x.adminNote ? `<small class="muted">${esc(x.adminNote)}</small>` : ''}</span>
        ${x.status === 'pending' ? `<span class="po-acts"><button class="btn sm primary" data-pa="approve" data-id="${x.id}">${esc(t('approve'))}</button><button class="btn sm ghost" data-pa="reject" data-id="${x.id}">${esc(t('reject'))}</button></span>` : `<span class="po-st ${x.status}">${esc(t('po_' + x.status))}</span>`}</li>`).join('')}</ul>` : `<p class="muted">${esc(t('noPayouts'))}</p>`}
    </section>
    <div class="dash-grid">
      <section class="card"><h2>${esc(t('grantCoins'))}</h2>
        <form class="form" id="grantForm"><label class="field"><span>${esc(t('usernameLabel'))}</span><input name="user" required maxlength="64" dir="ltr" placeholder="@username"></label>
        <label class="field"><span>${esc(t('coinsLabel'))}</span><input name="coins" type="number" min="1" max="1000000" step="1" required dir="ltr"></label>
        <label class="field"><span>${esc(t('payoutNote'))}</span><input name="note" maxlength="200"></label>
        <button class="btn primary" type="submit">${coin(16)} ${esc(t('grantCoins'))}</button></form></section>
      <section class="card"><h2>${esc(t('topHosts'))}</h2>${s.topHosts.length ? `<ol class="top-list">${s.topHosts.map((x, i) => `<li><span class="tl-rank r${i + 1}">${i + 1}</span><img class="av sm" src="${avatarOf(x.user)}" alt=""><span class="grow"><b>${esc(x.user?.name || '')}</b><small class="muted">${fmtInt(x.gifts)} 🎁</small></span><span class="tl-coins">💎 <b dir="ltr">${fmtInt(x.diamonds)}</b></span></li>`).join('')}</ol>` : `<p class="muted">${esc(t('noGiftsYet'))}</p>`}</section>
    </div>`;
  box.onclick = async (e) => {
    const tb = e.target.closest('[data-pst]'); if (tb) { box.dataset.st = tb.dataset.pst; return renderGiftAdmin(box); }
    const ab = e.target.closest('[data-pa]'); if (!ab) return;
    const approve = ab.dataset.pa === 'approve';
    const note = approve ? (prompt(t('approveNoteQ')) ?? null) : prompt(t('rejectNoteQ'));
    if (note === null) return;
    ab.disabled = true;
    try { await rq('POST', `/admin/payouts/${ab.dataset.id}/${ab.dataset.pa}`, { note: note.slice(0, 300) }); toast(approve ? t('payoutApproved') : t('payoutRejected'), 'ok'); renderGiftAdmin(box); }
    catch { toast(t('payoutFail'), 'err'); ab.disabled = false; }
  };
  $('#grantForm', box).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await rq('POST', '/admin/coins/grant', { user: f.user.value.trim(), coins: Number(f.coins.value), note: f.note.value }); toast(t('granted', { n: fmtInt(Number(f.coins.value)), u: r.user.username, b: fmtInt(r.coins) }), 'ok'); f.reset(); renderGiftAdmin(box); }
    catch (er) { toast(er.message === 'noUser' ? t('noSuchUser') : t('grantFail'), 'err'); btn.disabled = false; }
  };
}

// ---------------- إدارة «كليب كات بلس» (© 2026 وطن النهار) ----------------
export async function renderPlusAdmin(box) {
  const s = await rq('GET', '/admin/plus'); const T = s.totals;
  box.innerHTML = `<h2 class="sec-title" id="plusAdmin">👑 ${esc(t('plusAdmin'))}</h2>
    <div class="kpis">
      <div class="kpi"><span>${esc(t('plusActiveSubs'))}</span><b>${fmtInt(T.active)}</b></div>
      <div class="kpi"><span>${esc(t('plusMoneyRev'))}</span><b>${esc(kwd(T.moneyKwd))}</b><small>${T.moneyCount} · ${esc(t('demoMode'))}: ${esc(kwd(T.demoKwd))}</small></div>
      <div class="kpi"><span>${esc(t('plusCoinsRev'))}</span><b>${coin(16)} ${fmtInt(T.coins)}</b><small>${T.coinsCount}</small></div>
      <div class="kpi"><span>${esc(t('plusDownloads'))}</span><b>${fmtInt(T.downloadsWm + T.downloadsNowm)}</b><small>${esc(t('dlFree'))}: ${fmtInt(T.downloadsWm)} · ${esc(t('dlNoWm'))}: ${fmtInt(T.downloadsNowm)}</small></div>
    </div>
    <div class="dash-grid">
      <section class="card"><h2>${esc(t('plusActiveSubs'))}</h2>${s.subscribers.length ? `<ul class="led-list">${s.subscribers.map((x) => `<li class="po-row"><img class="av sm" src="${avatarOf(x)}" alt=""><span class="grow"><b>${esc(x.name)} <bdi dir="ltr" class="muted">@${esc(x.username)}</bdi></b><small class="muted">${esc(t('plusActiveUntil', { d: fmtDate(x.expiresAt) }))}</small></span><button class="btn sm ghost" data-revoke="${esc(x.username)}">${esc(t('plusRevoke'))}</button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('plusNoSubs'))}</p>`}</section>
      <section class="card"><h2>${esc(t('plusGrant'))}</h2>
        <form class="form" id="plusGrantForm"><label class="field"><span>${esc(t('usernameLabel'))}</span><input name="user" required maxlength="64" dir="ltr" placeholder="@username"></label>
        <label class="field"><span>${esc(t('plusDays'))}</span><input name="days" type="number" min="1" max="366" step="1" value="${s.price.days}" required dir="ltr"></label>
        <button class="btn primary" type="submit">👑 ${esc(t('plusGrant'))}</button></form></section>
    </div>`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-revoke]'); if (!b) return;
    if (!confirm(t('plusRevokeQ', { u: b.dataset.revoke }))) return;
    b.disabled = true;
    try { await rq('POST', '/admin/plus/revoke', { user: b.dataset.revoke }); toast(t('plusRevoked', { u: b.dataset.revoke }), 'ok'); renderPlusAdmin(box); }
    catch { toast(t('plusFail'), 'err'); b.disabled = false; }
  };
  $('#plusGrantForm', box).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await rq('POST', '/admin/plus/grant', { user: f.user.value.trim(), days: Number(f.days.value) }); toast(t('plusGranted', { u: r.user.username }), 'ok'); renderPlusAdmin(box); }
    catch (er) { toast(er.message === 'notfound' ? t('noSuchUser') : t('plusFail'), 'err'); btn.disabled = false; }
  };
}
