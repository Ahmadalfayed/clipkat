import { api } from '../services/index.js';
import { t, fmtKWD, fmtDate, fmtNum } from '../i18n.js';
import { PLANS, STORE_CATEGORIES } from '../config.js';
import { icon, esc, $, $$, toast, openSheet, fileToDataURL, productImg, storeLogo, storeBanner, emptyState, verifiedBadge } from '../ui.js';
import { pageHead } from './common.js';
import { normContact, storeErrorMessage } from '../contact-url.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  const s = await api.getMyStore();
  if (!s) { el.innerHTML = `<div class="page">${pageHead(t('dashboard'))}${emptyState(t('noStoreYet'), t('noStoreSub'), `<a class="btn primary" href="#/rent">${esc(t('rentNow'))}</a>`)}</div>`; return; }
  const st = api.storeStatus(s);
  const products = await api.listProducts(s.id);
  const rentals = await api.listRentals({ storeId: s.id });
  const pct = Math.min(100, Math.round((st.daysLeft / st.plan.days) * 100));
  const max = st.plan.maxProducts;
  el.innerHTML = `<div class="page">${pageHead(t('dashboard'), { extra: `<a class="icon-btn" href="#/store/${s.id}" aria-label="${esc(t('viewStore'))}">${icon('store', { size: 20 })}</a>` })}
    <section class="dash-store" style="--bn:url('${storeBanner(s)}')">
      <img class="sp-logo" src="${storeLogo(s)}" alt=""><div class="grow"><h1>${esc(s.name)} ${s.verified ? verifiedBadge(t('verified')) : ''}</h1><span class="muted sm">${esc(t('cat_' + s.category))}</span></div>
      <a class="btn sm" href="#/store/${s.id}">${esc(t('viewStore'))}</a>
    </section>
    <div class="dash-grid">
      <section class="card stat-card">
        <h2>${esc(t('rentalStatus'))}</h2>
        <div class="status ${st.active ? 'ok' : st.pending ? 'warn-s' : 'bad'}"><span class="dot-s"></span>${esc(st.active ? t('active') : st.pending ? t('pending') : t('expired'))}</div>
        <dl class="kv"><dt>${esc(t('plan'))}</dt><dd>${esc(t('plan_' + s.planId))}${s.featured ? ` · <span class="pill feat">${icon('star', { size: 11, fill: true })} ${esc(t('featured'))}</span>` : ''}</dd>
          <dt>${esc(t('expires'))}</dt><dd>${s.expiresAt ? esc(fmtDate(s.expiresAt)) : '—'}</dd>${s.expiresAt ? `<dt></dt><dd>${esc(t('daysLeft', { n: st.daysLeft }))}</dd>` : ''}</dl>
        <div class="meter"><i style="width:${pct}%"></i></div>
        ${st.pending ? '' : `<div class="renew-row">${PLANS.map((p) => `<a class="btn sm ${p.id === s.planId ? 'primary' : ''}" href="#/checkout/${p.id}?renew=1">${esc(t('renew'))} · ${esc(t('plan_' + p.id))} ${esc(fmtKWD(p.price))}</a>`).join('')}</div>`}
      </section>
      <section class="card stat-card">
        <h2>${esc(t('productsTitle'))}</h2>
        <div class="big">${products.length}<small> / ${max === Infinity ? '∞' : max}</small></div>
        <div class="meter"><i style="width:${max === Infinity ? 5 : Math.min(100, (products.length / max) * 100)}%"></i></div>
        <button class="btn sm ghost" id="settingsBtn">${icon('edit', { size: 16 })} ${esc(t('storeSettings'))}</button>
      </section>
    </div>
    <div class="row-between"><h2 class="sec-title">${icon('bag', { size: 18 })} ${esc(t('productsTitle'))}</h2><button class="btn primary sm" id="addBtn" ${st.active || (st.pending && api.mode !== 'local') ? '' : 'disabled'}>${icon('plus', { size: 16 })} ${esc(t('addProduct'))}</button></div>
    ${st.pending ? payCard(rentals.find((r) => r.status === 'pending')) : ''}
    ${st.pending ? `<div class="note" id="pendingNote">${icon('shield', { size: 18 })}<span>${esc(t('pendingNote'))}</span></div>` : !st.active ? `<div class="warn">${icon('shield', { size: 18 })}<span>${esc(t('storeInactive'))}</span></div>` : ''}
    <ul class="prod-admin">${products.map((p) => `<li data-id="${p.id}"><img src="${productImg(p)}" alt=""><div class="grow"><b>${esc(p.name)}</b><span class="price">${esc(fmtKWD(p.price))}</span><span class="sm ${p.stock ? 'muted' : 'bad'}">${p.stock ? esc(t('inStock', { n: p.stock })) : esc(t('outOfStock'))}</span></div>
      <button class="icon-btn" data-edit="${p.id}" aria-label="${esc(t('edit'))} ${esc(p.name)}">${icon('edit', { size: 18 })}</button><button class="icon-btn danger" data-del="${p.id}" aria-label="${esc(t('delete'))} ${esc(p.name)}">${icon('trash', { size: 18 })}</button></li>`).join('') || `<li class="muted center pad">${esc(t('noProducts'))}</li>`}</ul>
    <h2 class="sec-title">${icon('chart', { size: 18 })} ${esc(t('rentals'))}</h2>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('plan'))}</th><th>${esc(t('amount'))}</th><th>${esc(t('method'))}</th><th>${esc(t('status'))}</th><th>Ref</th></tr></thead><tbody>
      ${rentals.map((r) => `<tr><td>${esc(fmtDate(r.paidAt))}</td><td>${esc(t('plan_' + r.planId))}</td><td>${esc(fmtKWD(r.amount))}</td><td>${esc(t(r.method))}</td><td>${rentalBadge(r)}</td><td dir="ltr"><code>${esc(r.ref)}</code></td></tr>`).join('')}</tbody></table></div>
  </div>`;

  const productForm = (p = {}) => {
    let image = p.image || null;
    const f = document.createElement('form'); f.className = 'form'; f.id = 'productForm';
    f.innerHTML = `<div class="center"><img class="pimg lg" id="pPrev" src="${productImg(p.id ? p : { id: 'new' })}" alt=""></div>
      <label class="field"><span>${esc(t('productName'))} *</span><input name="name" required maxlength="60" value="${esc(p.name || '')}"></label>
      <div class="two"><label class="field"><span>${esc(t('price'))} *</span><input name="price" type="number" min="0" step="0.001" inputmode="decimal" required value="${p.price ?? ''}" dir="ltr"></label>
      <label class="field"><span>${esc(t('stock'))}</span><input name="stock" type="number" min="0" step="1" value="${p.stock ?? 10}" dir="ltr"></label></div>
      <label class="field"><span>${esc(t('image'))}</span><input type="file" accept="image/*" id="pFile"></label>
      <label class="field"><span>${esc(t('description'))}</span><textarea name="description" rows="2" maxlength="200">${esc(p.description || '')}</textarea></label>
      <p class="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${esc(t('saveChanges'))}</button>`;
    const sh = openSheet({ title: p.id ? t('editProduct') : t('addProduct'), body: f });
    $('#pFile', f).addEventListener('change', async (e) => { if (e.target.files[0]) { image = await fileToDataURL(e.target.files[0], 600); $('#pPrev', f).src = image; } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(f);
      if (!String(fd.get('name')).trim() || fd.get('price') === '') { $('.form-err', f).textContent = t('fillAll'); return; }
      try { await api.saveProduct({ id: p.id, name: String(fd.get('name')).trim(), price: fd.get('price'), stock: fd.get('stock'), description: fd.get('description'), image }); sh.close(); toast(t('productSaved'), 'ok'); ctx.rerender(); }
      catch (ex) { $('.form-err', f).textContent = ex.message === 'limit' ? t('limitReached', { n: ex.limit }) : ex.message; }
    });
  };
  $('#addBtn', el).addEventListener('click', () => { if (products.length >= max) { toast(t('limitReached', { n: max }), 'warn'); return; } productForm(); });
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => productForm(products.find((p) => p.id === b.dataset.edit))));
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => { if (!confirm(t('confirmDelete'))) return; await api.deleteProduct(b.dataset.del); toast(t('productDeleted')); ctx.rerender(); }));
  $('#settingsBtn', el).addEventListener('click', () => {
    let logo, banner;
    const f = document.createElement('form'); f.className = 'form';
    f.innerHTML = `<label class="field"><span>${esc(t('storeName'))}</span><input name="name" required maxlength="40" value="${esc(s.name)}"></label>
      <label class="field"><span>${esc(t('category'))}</span><select name="category">${STORE_CATEGORIES.map((c) => `<option value="${c}" ${c === s.category ? 'selected' : ''}>${esc(t('cat_' + c))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('description'))}</span><textarea name="description" rows="2" maxlength="200">${esc(s.description)}</textarea></label>
      <label class="field"><span>${esc(t('contactLink'))}</span><input name="contact" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="300" dir="ltr" value="${esc(s.contact)}" placeholder="${esc(t('contactPh'))}"><small class="muted">${esc(t('contactHint'))}</small></label>
      <div class="two"><label class="field"><span>${esc(t('logo'))}</span><input type="file" accept="image/*" id="sLogo"></label>
      <label class="field ${st.plan.banner ? '' : 'locked'}"><span>${esc(t('banner'))}</span><input type="file" accept="image/*" id="sBanner" ${st.plan.banner ? '' : 'disabled'}>${st.plan.banner ? '' : `<small class="muted">${esc(t('bannerLocked'))}</small>`}</label></div>
      <p class="form-err" role="alert"></p>
      <button class="btn primary block" type="submit">${esc(t('saveChanges'))}</button>`;
    const sh = openSheet({ title: t('storeSettings'), body: f });
    const fErr = () => $('.form-err', f);
    const imgPick = (id, max, setV, field) => $(id, f).addEventListener('change', async (e) => { if (!e.target.files[0]) return; try { setV(await fileToDataURL(e.target.files[0], max)); fErr().textContent = ''; } catch { e.target.value = ''; setV(undefined); fErr().textContent = t('storeErr_' + field); } });
    imgPick('#sLogo', 256, (v) => { logo = v; }, 'logo');
    imgPick('#sBanner', 1000, (v) => { banner = v; }, 'banner');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(f); fErr().textContent = '';
      const contact = normContact(fd.get('contact'));
      if (contact === null) { fErr().textContent = t('storeErr_contact'); $('[name=contact]', f).focus(); return; }
      try { await api.updateStore(s.id, { name: fd.get('name').trim() || s.name, category: fd.get('category'), description: fd.get('description'), contact, logo, banner }); sh.close(); toast(t('saved_ok'), 'ok'); ctx.rerender(); }
      catch (ex) { fErr().textContent = storeErrorMessage(ex, t); }
    });
  });
}

export function rentalBadge(r) {
  const st = r.status || (r.endAt > Date.now() ? 'active' : 'expired');
  const label = st === 'active' ? (r.endAt && r.endAt < Date.now() ? t('expired') : t('active')) : t(st === 'pending' ? 'pending' : st);
  const cls = st === 'active' && !(r.endAt && r.endAt < Date.now()) ? 'ok' : st === 'pending' ? 'warn-s' : 'bad';
  return `<span class="status ${cls}"><span class="dot-s"></span>${esc(label)}</span>`;
}

// بطاقة دفع الإيجار (رابط يدوي من الإدارة) — تظهر فقط والإيجار بانتظار التفعيل
export function payCard(r) {
  if (!r) return '';
  const url = /^https?:\/\//i.test(r.paymentUrl || '') ? r.paymentUrl : '';
  if (!url) return `<section class="card pay-card waiting" id="payCard"><h2>${icon('shield', { size: 18 })} ${esc(t('payRentTitle'))}</h2><p class="pay-amount">${esc(fmtKWD(r.amount))} <small class="muted">· ${esc(t('plan_' + r.planId))}</small></p><p class="muted"><b>${esc(t('payWaiting'))}</b><br>${esc(t('payWaitingSub'))}</p></section>`;
  return `<section class="card pay-card" id="payCard"><h2>${icon('shield', { size: 18 })} ${esc(t('payRentTitle'))}</h2>
    <p class="pay-amount">${esc(fmtKWD(r.amount))} <small class="muted">· ${esc(t('plan_' + r.planId))}</small></p>
    ${r.paymentNote ? `<p class="pay-note">${esc(r.paymentNote)}</p>` : ''}
    <a class="btn primary block lg" id="payRentBtn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t('payRent'))}</a>
    <p class="muted sm">${esc(t('payAfter'))}</p></section>`;
}
