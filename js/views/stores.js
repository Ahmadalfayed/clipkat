import { api } from '../services/index.js';
import { t, fmtKWD, fmtNum, fmtDate } from '../i18n.js';
import { PLANS, STORE_CATEGORIES } from '../config.js';
import { icon, esc, $, $$, storeLogo, storeBanner, productImg, emptyState, verifiedBadge, logoMark } from '../ui.js';
import { pageHead, videoGrid } from './common.js';

export async function render(el, params, ctx) {
  if (params.name === 'store') return storePage(el, params, ctx);
  if (params.name === 'rent') return rentPage(el, params, ctx);
  return marketplace(el, params, ctx);
}

function storeCard(s) {
  return `<a class="store-card ${s.featured ? 'is-featured' : ''}" href="#/store/${s.id}">
    <div class="sc-banner" style="background-image:url('${storeBanner(s)}')">${s.featured ? `<span class="pill feat">${icon('star', { size: 12, fill: true })} ${esc(t('featured'))}</span>` : ''}</div>
    <div class="sc-body"><img class="sc-logo" src="${storeLogo(s)}" alt=""><div class="grow"><b>${esc(s.name)}${s.verified ? verifiedBadge(t('verified')) : ''}</b><span class="muted sm">${esc(t('cat_' + s.category))} · ${fmtNum(s.productCount)} ${esc(t('products'))}</span></div></div></a>`;
}

async function marketplace(el, params, ctx) {
  const q = params.query.get('q') || '', cat = params.query.get('cat') || '';
  const [slots, featured] = await Promise.all([api.slots(), api.listStores()]);
  const myStore = ctx.me ? await api.getMyStore() : null;
  el.innerHTML = `<div class="page">${pageHead(t('storesTitle'), { back: false })}
    <section class="hero">
      <div class="hero-txt"><h2>${esc(t('rentTitle'))}</h2><p>${esc(t('storesSub'))}</p>
        <a class="btn primary" href="${myStore ? '#/dashboard' : '#/rent'}">${icon('store', { size: 18 })} ${esc(myStore ? t('dashboard') : t('rentYourStore'))}</a></div>
      <div class="slots">
        <div class="slot"><b>${slots.storesTotal - slots.storesUsed}</b><span>${esc(t('slotsAvail'))}</span><div class="meter"><i style="width:${(slots.storesUsed / slots.storesTotal) * 100}%"></i></div><small>${slots.storesUsed} / ${slots.storesTotal}</small></div>
        <div class="slot gold"><b>${slots.featuredTotal - slots.featuredUsed}</b><span>${esc(t('featuredAvail'))}</span><div class="meter"><i style="width:${(slots.featuredUsed / slots.featuredTotal) * 100}%"></i></div><small>${slots.featuredUsed} / ${slots.featuredTotal}</small></div>
      </div>
    </section>
    <form class="searchbar" role="search"><span aria-hidden="true">${icon('search', { size: 20 })}</span><input type="search" name="q" value="${esc(q)}" placeholder="${esc(t('storeSearchPh'))}" aria-label="${esc(t('search'))}"></form>
    <div class="chips" role="group" aria-label="${esc(t('category'))}"><button class="chip ${!cat ? 'on' : ''}" data-cat="">${esc(t('all'))}</button>${STORE_CATEGORIES.map((c) => `<button class="chip ${cat === c ? 'on' : ''}" data-cat="${c}" aria-pressed="${cat === c}">${esc(t('cat_' + c))}</button>`).join('')}</div>
    ${!q && !cat ? `<h2 class="sec-title">${icon('star', { size: 18, fill: true })} ${esc(t('featured'))}</h2><div class="hscroll">${featured.filter((s) => s.featured).map(storeCard).join('')}</div>` : ''}
    <h2 class="sec-title">${icon('store', { size: 18 })} ${esc(t('stores'))}</h2>
    <div class="store-grid" id="storeGrid"></div></div>`;
  const grid = $('#storeGrid', el), input = $('input', el);
  let curCat = cat;
  const draw = async () => { const list = await api.listStores({ q: input.value, category: curCat }); grid.innerHTML = list.map(storeCard).join('') || emptyState(t('noStores')); };
  let tm; input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(draw, 180); });
  $('form', el).addEventListener('submit', (e) => { e.preventDefault(); draw(); });
  $$('[data-cat]', el).forEach((b) => b.addEventListener('click', () => { curCat = b.dataset.cat; $$('[data-cat]', el).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); draw(); }));
  await draw();
}

async function storePage(el, params, ctx) {
  const s = await api.getStore(params.args[0]);
  if (!s) { el.innerHTML = `<div class="page">${pageHead('')}${emptyState(t('notFound'))}</div>`; return; }
  const status = api.storeStatus(s);
  const [products, owner, vids] = await Promise.all([api.listProducts(s.id), api.getUser(s.ownerId), api.listVideos({ productStoreId: s.id })]);
  const own = ctx.me?.id === s.ownerId;
  el.innerHTML = `<div class="page store-page">${pageHead(s.name, { extra: own ? `<a class="icon-btn" href="#/dashboard" aria-label="${esc(t('dashboard'))}">${icon('edit', { size: 20 })}</a>` : '' })}
    <div class="sp-banner" style="background-image:url('${storeBanner(s)}')" role="img" aria-label="${esc(t('banner'))}"></div>
    <section class="sp-head">
      <img class="sp-logo" src="${storeLogo(s)}" alt="${esc(t('logo'))}">
      <div class="grow"><h1>${esc(s.name)} ${s.verified ? verifiedBadge(t('verified')) : ''}</h1>
        <div class="muted sm">${esc(t('cat_' + s.category))} · <a href="#/profile/${owner.id}"><bdi>@${esc(owner.username)}</bdi></a> ${s.featured ? `<span class="pill feat">${icon('star', { size: 11, fill: true })} ${esc(t('featured'))}</span>` : ''}</div></div>
      ${s.contact ? `<a class="btn primary" href="${esc(s.contact)}" target="_blank" rel="noopener">${icon('comment', { size: 16 })} ${esc(t('buy'))}</a>` : ''}
    </section>
    ${s.description ? `<p class="sp-desc">${esc(s.description)}</p>` : ''}
    ${!status.active ? `<div class="warn">${icon('shield', { size: 18 })}<span>${esc(t('storeInactive'))}</span></div>` : ''}
    <h2 class="sec-title">${icon('bag', { size: 18 })} ${esc(t('productsTitle'))} <small class="muted">(${products.length})</small></h2>
    ${products.length ? `<div class="prod-grid">${products.map((p) => `<article class="prod-card"><img src="${productImg(p)}" alt="${esc(p.name)}" loading="lazy"><div class="pc-body"><h3>${esc(p.name)}</h3><div class="price">${esc(fmtKWD(p.price))}</div>
      <div class="sm ${p.stock > 0 ? 'muted' : 'bad'}">${p.stock > 0 ? esc(t('inStock', { n: p.stock })) : esc(t('outOfStock'))}</div>
      ${status.active && p.stock > 0 && s.contact ? `<a class="btn sm primary block" href="${esc(s.contact)}${s.contact.includes('wa.me') ? `?text=${encodeURIComponent(p.name)}` : ''}" target="_blank" rel="noopener">${esc(t('buy'))}</a>` : `<button class="btn sm block" disabled>${esc(t('outOfStock'))}</button>`}</div></article>`).join('')}</div>` : emptyState(t('noProducts'))}
    ${vids.length ? `<h2 class="sec-title">${icon('play', { size: 18 })} ${esc(t('storeVideos'))}</h2>${videoGrid(vids)}` : ''}
  </div>`;
}

export function planFeatures(p) {
  return [
    [true, p.maxProducts === Infinity ? t('f_unlimited') : t('f_products', { n: p.maxProducts })],
    [true, t('f_page')], [true, t('f_tag')],
    [p.banner, p.banner ? t('f_banner') : t('f_noBanner')],
    [p.featured, t('f_featured')], [p.verified, t('f_verified')]
  ];
}

async function rentPage(el, params, ctx) {
  const slots = await api.slots();
  const myStore = ctx.me ? await api.getMyStore() : null;
  const full = slots.storesUsed >= slots.storesTotal && !myStore;
  el.innerHTML = `<div class="page">${pageHead(t('rentTitle'))}
    <p class="lead">${esc(t('rentSub'))}</p>
    ${myStore ? `<div class="note">${icon('store', { size: 18 })} ${esc(t('alreadyHaveStore'))} <a href="#/dashboard">${esc(t('dashboard'))}</a></div>` : ''}
    <div class="slots inline"><span>${icon('store', { size: 16 })} ${esc(t('slotsAvail'))}: <b>${slots.storesTotal - slots.storesUsed}</b> ${esc(t('of'))} ${slots.storesTotal}</span><span>${icon('star', { size: 16 })} ${esc(t('featuredAvail'))}: <b>${slots.featuredTotal - slots.featuredUsed}</b> ${esc(t('of'))} ${slots.featuredTotal}</span></div>
    <div class="plans">${PLANS.map((p) => `<article class="plan ${p.popular ? 'popular' : ''}" data-plan="${p.id}">
      ${p.popular ? `<span class="pill pop">${esc(t('popular'))}</span>` : ''}
      <h2>${esc(t('plan_' + p.id))}</h2>
      <div class="plan-price"><b>${esc(fmtKWD(p.price))}</b><span>${esc(t('per_' + p.id))}</span></div>
      <ul>${planFeatures(p).map(([ok, txt]) => `<li class="${ok ? 'ok' : 'no'}">${icon(ok ? 'check' : 'close', { size: 16 })}<span>${esc(txt)}</span></li>`).join('')}</ul>
      ${p.featured && slots.featuredUsed >= slots.featuredTotal ? `<p class="muted sm">${esc(t('featuredFull'))}</p>` : ''}
      ${full ? `<button class="btn block" disabled>${esc(t('soldOut'))}</button>` : `<a class="btn block ${p.popular ? 'primary' : ''}" href="#/checkout/${p.id}${myStore ? '?renew=1' : ''}">${esc(myStore ? t('renew') : t('choose'))}</a>`}
    </article>`).join('')}</div></div>`;
}
