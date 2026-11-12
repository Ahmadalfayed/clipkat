// © 2026 وطن النهار — واجهة العملات وهدايا البث: درج الهدايا، الشحن التجريبي، حركة الهدية، ترتيب الداعمين
import { t, lang } from './i18n.js';
import { esc, $, toast, openSheet, avatarOf } from './ui.js';
import { rq } from './rtc.js';

let cfgP = null;
export const coinCfg = (fresh) => ((!cfgP || fresh) ? (cfgP = rq('GET', '/coins/config').catch((e) => { cfgP = null; throw e; })) : cfgP);
export const giftName = (g) => (lang === 'ar' ? g.nameAr : g.nameEn) || g.id;
export const fmtInt = (n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en').format(n || 0);
export const kwd = (n) => (lang === 'ar' ? `${Number(n).toFixed(3)} د.ك` : `KWD ${Number(n).toFixed(3)}`);
// عملة كليب كات: دائرة ذهبية بشعار القطة (رسم أصلي)
export const coin = (size = 16) => `<svg class="ck-coin" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="ckc" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffc83d"/><stop offset="1" stop-color="#d98a00"/></radialGradient></defs><circle cx="12" cy="12" r="11" fill="url(#ckc)" stroke="#a86400" stroke-width="1.2"/><circle cx="12" cy="12" r="7.6" fill="none" stroke="#a86400" stroke-opacity=".55" stroke-width="1"/><path d="M8.2 15.2V9.6l2 1.6h3.6l2-1.6v5.6c0 .9-1.6 1.8-3.8 1.8s-3.8-.9-3.8-1.8z" fill="#8a5200"/></svg>`;
export const newKey = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

export function demoNoticeHTML() { return `<div class="coin-demo" role="note"><b>${esc(t('demoMode'))}</b> ${esc(t('demoCoinsNote'))}</div>`; }
export function packagesHTML(cfg) {
  return `<div class="pkg-list">${cfg.packages.map((p) => `<button class="pkg" data-pkg="${esc(p.id)}">
    <span class="pkg-coins">${coin(22)} <b dir="ltr">${fmtInt(p.total)}</b></span>
    <span class="pkg-name">${esc(t('pkg_' + p.id))}${p.bonus ? ` <em>+${fmtInt(p.bonus)} ${esc(t('bonus'))}</em>` : ''}</span>
    <span class="pkg-price">${esc(kwd(p.price))}</span></button>`).join('')}</div>`;
}
// شراء باقة (الوضع التجريبي يضيف العملات فوراً بلا أي دفع)
export async function buyPackage(pkgId, btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await rq('POST', '/coins/purchase', { packageId: pkgId, key: newKey() });
    if (r.redirectUrl) { location.href = r.redirectUrl; return null; }
    toast(r.demo ? t('demoCoinsAdded', { n: fmtInt(r.purchase.coins) }) : t('coinsAdded', { n: fmtInt(r.purchase.coins) }), 'ok');
    return r.wallet;
  } catch (e) {
    toast(e.message === 'demoCap' ? t('demoCap') : e.message === 'payNotConfigured' || e.message === 'payNotReady' ? t('payNotReady') : e.status === 429 ? t('slowDown') : t('buyFail'), 'err');
    return null;
  } finally { if (btn) btn.disabled = false; }
}

// ---------- حركة الهدية فوق البث (للمضيف وكل المشاهدين) ----------
const bigQueue = []; let bigBusy = false;
export function showGiftFx(stage, m) {
  if (!stage || !m?.gift) return;
  const lane = stage.querySelector('.gift-lane') || stage.appendChild(Object.assign(document.createElement('div'), { className: 'gift-lane' }));
  if (m.id && lane.querySelector(`[data-gid="${CSS.escape(m.id)}"]`)) return;
  const u = m.from || {};
  const row = document.createElement('div'); row.className = `gift-toast tier${m.gift.tier}`; if (m.id) row.dataset.gid = m.id;
  row.innerHTML = `<img class="av xs" src="${avatarOf(u)}" alt=""><span class="gt-txt"><b>${esc(u.name || u.username || '')}</b><small>${esc(t('sentGift', { gift: giftName(m.gift) }))}</small></span><span class="gt-emoji">${esc(m.gift.emoji)}</span>${m.qty > 1 ? `<span class="gt-qty" dir="ltr">×${m.qty}</span>` : ''}`;
  lane.append(row); while (lane.children.length > 3) lane.firstElementChild.remove();
  setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 400); }, 3600);
  if (m.gift.tier >= 2) { bigQueue.push([stage, m]); if (bigQueue.length > 6) bigQueue.shift(); runBig(); }
  else burstSmall(stage, m.gift.emoji, Math.min(m.qty || 1, 8));
}
function burstSmall(stage, emoji, n) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span'); s.className = 'gift-pop'; s.textContent = emoji;
    s.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 120)}px`); s.style.animationDelay = `${i * 140}ms`;
    stage.append(s); setTimeout(() => s.remove(), 2400 + i * 140);
  }
}
function runBig() {
  if (bigBusy || !bigQueue.length) return; bigBusy = true;
  const [stage, m] = bigQueue.shift();
  if (!stage.isConnected) { bigBusy = false; return runBig(); }
  const fx = document.createElement('div'); fx.className = `gift-fx tier${m.gift.tier}`; fx.setAttribute('aria-hidden', 'true');
  const sparks = Array.from({ length: m.gift.tier === 3 ? 18 : 10 }, (_, i) => `<i style="--a:${Math.round((360 / (m.gift.tier === 3 ? 18 : 10)) * i)}deg;--d:${80 + Math.round(Math.random() * 90)}px;--h:${Math.round(Math.random() * 60 + 20)}"></i>`).join('');
  fx.innerHTML = `<div class="gfx-glow"></div><div class="gfx-sparks">${sparks}</div><div class="gfx-emoji">${esc(m.gift.emoji)}</div><div class="gfx-cap"><b>${esc(m.from?.name || '')}</b> · ${esc(giftName(m.gift))}${m.qty > 1 ? ` <span dir="ltr">×${m.qty}</span>` : ''}</div>`;
  stage.append(fx);
  const dur = m.gift.tier === 3 ? 3200 : 2100;
  setTimeout(() => { fx.remove(); bigBusy = false; runBig(); }, dur);
}

// ---------- ترتيب الداعمين ----------
export function topChipHTML() { return `<button class="live-top-gifters" id="lvTopG" hidden aria-label="${esc(t('topGifters'))}"><span class="tg-cup">🏆</span><span class="tg-avs"></span></button><span class="live-gems" id="lvGems" hidden>💎 <b dir="ltr">0</b></span>`; }
export function renderTop(el, top, liveDiamonds) {
  const chip = $('#lvTopG', el); const gems = $('#lvGems', el);
  if (chip) { chip.hidden = !top?.length; chip.querySelector('.tg-avs').innerHTML = (top || []).slice(0, 3).map((x) => `<img class="av xs" src="${avatarOf(x.user)}" alt="">`).join(''); }
  if (gems && liveDiamonds !== undefined) { gems.hidden = !liveDiamonds; gems.querySelector('b').textContent = fmtInt(liveDiamonds); }
}
export async function openTopSheet(liveId) {
  const d = await rq('GET', `/live/${liveId}/gifters`).catch(() => ({ top: [] }));
  const body = d.top.length ? `<ol class="top-list">${d.top.map((x, i) => `<li><span class="tl-rank r${i + 1}">${i + 1}</span><img class="av sm" src="${avatarOf(x.user)}" alt=""><span class="grow"><b>${esc(x.user?.name || '')}</b><small class="muted" dir="ltr">@${esc(x.user?.username || '')}</small></span><span class="tl-coins">${coin(16)} <b dir="ltr">${fmtInt(x.coins)}</b></span></li>`).join('')}</ol>` : `<p class="muted center">${esc(t('noGiftersYet'))}</p>`;
  openSheet({ title: `🏆 ${t('topGifters')}`, body });
}

// ---------- درج الهدايا للمشاهد ----------
export async function openGiftTray(stage, { liveId, onSent }) {
  if (stage.querySelector('.gift-tray')) return;
  let cfg, w;
  try { [cfg, w] = await Promise.all([coinCfg(), rq('GET', '/wallet')]); } catch { toast(t('liveJoinFail'), 'err'); return; }
  let balance = w.coins, sel = cfg.gifts[0]?.id, qty = 1, sending = false;
  const tray = document.createElement('div'); tray.className = 'gift-tray'; tray.setAttribute('role', 'dialog'); tray.setAttribute('aria-label', t('sendGift'));
  tray.innerHTML = `<div class="gt-head"><b>${esc(t('sendGift'))}</b><span class="gt-bal">${coin(18)} <b dir="ltr" id="gtBal">${fmtInt(balance)}</b></span><button class="btn sm gt-recharge" id="gtRe">${esc(t('recharge'))}</button><button class="icon-btn gt-x" id="gtX" aria-label="${esc(t('close'))}">✕</button></div>
    <div class="gt-grid" role="listbox" aria-label="${esc(t('sendGift'))}">${cfg.gifts.map((g) => `<button class="gt-item tier${g.tier}" role="option" data-g="${esc(g.id)}" aria-label="${esc(giftName(g))} — ${g.coins}"><span class="gi-emoji">${esc(g.emoji)}</span><span class="gi-name">${esc(giftName(g))}</span><span class="gi-cost">${coin(12)} <b dir="ltr">${fmtInt(g.coins)}</b></span></button>`).join('')}</div>
    <div class="gt-foot"><div class="gt-qty" role="radiogroup" aria-label="${esc(t('quantity'))}">${[1, 5, 10].map((n) => `<button data-q="${n}" role="radio" dir="ltr">×${n}</button>`).join('')}</div><button class="btn primary gt-send" id="gtSend"></button></div>
    <div class="gt-recharge-box" id="gtBox" hidden>${cfg.demo ? demoNoticeHTML() : ''}${packagesHTML(cfg)}</div>`;
  stage.append(tray); requestAnimationFrame(() => tray.classList.add('open'));
  const giftOf = (id) => cfg.gifts.find((g) => g.id === id);
  const paint = () => {
    tray.querySelectorAll('[data-g]').forEach((b) => { const on = b.dataset.g === sel; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    tray.querySelectorAll('[data-q]').forEach((b) => { const on = Number(b.dataset.q) === qty; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const g = giftOf(sel); const cost = (g?.coins || 0) * qty;
    const btn = $('#gtSend', tray); btn.innerHTML = `${esc(t('send'))} · ${coin(14)} <b dir="ltr">${fmtInt(cost)}</b>`;
    btn.classList.toggle('short', cost > balance); $('#gtBal', tray).textContent = fmtInt(balance);
  };
  paint();
  const close = () => { tray.classList.remove('open'); setTimeout(() => tray.remove(), 220); stage.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (!tray.contains(e.target) && !e.target.closest('#lvGift')) close(); };
  setTimeout(() => stage.addEventListener('pointerdown', outside, true), 0);
  $('#gtX', tray).onclick = close;
  $('#gtRe', tray).onclick = () => { const b = $('#gtBox', tray); b.hidden = !b.hidden; };
  tray.addEventListener('click', async (e) => {
    const gb = e.target.closest('[data-g]'); if (gb) { sel = gb.dataset.g; paint(); return; }
    const qb = e.target.closest('[data-q]'); if (qb) { qty = Number(qb.dataset.q); paint(); return; }
    const pb = e.target.closest('[data-pkg]');
    if (pb) { const nw = await buyPackage(pb.dataset.pkg, pb); if (nw) { balance = nw.coins; paint(); $('#gtBox', tray).hidden = true; } }
  });
  $('#gtSend', tray).onclick = async () => {
    const g = giftOf(sel); if (!g || sending) return;
    if (g.coins * qty > balance) { $('#gtBox', tray).hidden = false; toast(t('notEnoughCoins'), 'warn'); return; }
    sending = true; const btn = $('#gtSend', tray); btn.disabled = true;
    try {
      const r = await rq('POST', `/live/${liveId}/gifts`, { giftId: g.id, qty, key: newKey() });
      balance = r.wallet?.coins ?? balance; paint();
      if (!r.duplicate) onSent?.(r);
    } catch (er) {
      if (er.message === 'insufficient') { $('#gtBox', tray).hidden = false; toast(t('notEnoughCoins'), 'warn'); rq('GET', '/wallet').then((x) => { balance = x.coins; paint(); }).catch(() => {}); }
      else toast(er.status === 429 ? t('slowDown') : er.status === 410 ? t('liveEnded') : t('giftFail'), 'err');
    } finally { sending = false; btn.disabled = false; }
  };
  return close;
}
