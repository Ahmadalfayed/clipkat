import { api } from '../services/index.js';
import { startPayment, PAYMENT_METHODS } from '../services/payments.js';
import { t, fmtKWD, fmtDate } from '../i18n.js';
import { PLANS, STORE_CATEGORIES } from '../config.js';
import { icon, esc, $, $$, toast, fileToDataURL, emptyState } from '../ui.js';
import { pageHead } from './common.js';
import { POLICY } from '../policy-text.js';
import { planFeatures } from './stores.js';
import { normContact, storeErrorMessage } from '../contact-url.js';

const METHOD_ICONS = {
  knet: '<svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><rect width="40" height="24" rx="4" fill="#1d4f91"/><rect x="4" y="4" width="32" height="16" rx="2" fill="#fff"/><rect x="7" y="8" width="26" height="8" rx="1" fill="#f5a524"/></svg>',
  card: '<svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><rect width="40" height="24" rx="4" fill="#334"/><rect y="6" width="40" height="4" fill="#111"/><rect x="5" y="14" width="14" height="3" rx="1" fill="#ccc"/></svg>',
  applepay: '<svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><rect width="40" height="24" rx="4" fill="#000"/><circle cx="14" cy="13" r="5" fill="#fff"/><path d="M14 6q2-3 4-2-1 3-4 2z" fill="#fff"/><rect x="22" y="9" width="12" height="2" rx="1" fill="#fff"/><rect x="22" y="13" width="9" height="2" rx="1" fill="#fff"/></svg>'
};

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  const plan = PLANS.find((p) => p.id === params.args[0]);
  if (!plan) { el.innerHTML = `<div class="page">${pageHead(t('checkout'))}${emptyState(t('notFound'))}</div>`; return; }
  const store = await api.getMyStore();
  const renew = !!store;
  let logo = null, banner = null;
  el.innerHTML = `<div class="page narrow">${pageHead(renew ? t('renewTitle') : t('checkout'))}
    <div class="demo-banner" role="note">${icon('shield', { size: 18 })}<span>${esc(t('demoPay'))}</span></div>
    <section class="card summary"><h2>${esc(t('orderSummary'))}</h2>
      <div class="sum-row"><span>${esc(t('plan'))}: <b>${esc(t('plan_' + plan.id))}</b> (${plan.days}d)</span><b>${esc(fmtKWD(plan.price))}</b></div>
      <ul class="mini-feats">${planFeatures(plan).filter(([ok]) => ok).map(([, x]) => `<li>${icon('check', { size: 14 })} ${esc(x)}</li>`).join('')}</ul>
      ${renew ? `<p class="muted sm">${esc(store.name)} — ${esc(t('expires'))}: ${esc(fmtDate(store.expiresAt))}</p>` : ''}
      <div class="sum-row total"><span>${esc(t('total'))}</span><b>${esc(fmtKWD(plan.price))}</b></div>
      <a class="sm" href="#/rent">${esc(t('change'))}</a>
    </section>
    <form class="form" id="coForm" novalidate>
      ${renew ? '' : `<section class="card"><h2>${esc(t('storeInfo'))}</h2>
        <label class="field"><span>${esc(t('storeName'))} *</span><input name="name" required maxlength="40"><small class="muted">40 / <bdi class="cnt" data-for="name">0</bdi></small></label>
        <label class="field"><span>${esc(t('category'))}</span><select name="category">${STORE_CATEGORIES.map((c) => `<option value="${c}">${esc(t('cat_' + c))}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('description'))}</span><textarea name="description" rows="2" maxlength="200"></textarea><small class="muted">200 / <bdi class="cnt" data-for="description">0</bdi></small></label>
        <label class="field"><span>${esc(t('contactLink'))}</span><input name="contact" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="300" dir="ltr" placeholder="${esc(t('contactPh'))}"><small class="muted">${esc(t('contactHint'))}</small></label>
        <div class="two"><label class="field"><span>${esc(t('logo'))}</span><input type="file" accept="image/*" id="logoFile"></label>
        <label class="field ${plan.banner ? '' : 'locked'}"><span>${esc(t('banner'))}</span><input type="file" accept="image/*" id="bannerFile" ${plan.banner ? '' : 'disabled'}>${plan.banner ? '' : `<small class="muted">${esc(t('bannerLocked'))}</small>`}</label></div>
      </section>`}
      <section class="card"><h2>${esc(t('payMethod'))}</h2>
        <div class="methods" role="radiogroup" aria-label="${esc(t('payMethod'))}">${PAYMENT_METHODS.map((m, i) => `<label class="method"><input type="radio" name="method" value="${m}" ${i === 0 ? 'checked' : ''}>${METHOD_ICONS[m]}<span>${esc(t(m))}</span></label>`).join('')}</div>
      </section>
      <section class="card policy-accept"><p class="note">كليب كات تؤجّرك مساحة المتجر فقط. أموال مشترياتك تصل لك مباشرة من المشترين، والبيع والتوصيل والإرجاع والفواتير مسؤوليتك أمامهم.</p>
        <label class="radio-row"><input type="checkbox" name="acceptPolicy" value="${esc(POLICY.version)}" required> <span>قرأت وأوافق على <a href="#/policy" target="_blank" rel="noopener">سياسة تأجير المتاجر</a> (الإصدار <bdi dir="ltr">${esc(POLICY.version)}</bdi>)</span></label></section>
      <p class="form-err" role="alert"></p>
      <button class="btn primary block lg" type="submit" id="payBtn">${esc(t('payDemo', { amount: fmtKWD(plan.price) }))}</button>
    </form></div>`;
  // تحويل الصور (بما فيها HEIC من الآيفون) إلى JPEG صغير؛ نحتفظ بالوعد حتى ينتظره الإرسال، ونعرض رسالة واضحة إن تعذّر قراءة الصورة
  const err0 = () => $('.form-err', el);
  const pending = {};
  const pick = (id, max, setV, field) => $(id, el)?.addEventListener('change', (e) => {
    const file = e.target.files[0]; setV(null); err0().textContent = ''; markBad(null); if (!file) return;
    pending[field] = fileToDataURL(file, max).then(setV).catch(() => { e.target.value = ''; setV(null); err0().textContent = t('storeErr_' + field); markBad(field); throw Object.assign(new Error('bad image'), { field }); });
    pending[field].catch(() => {});
  });
  pick('#logoFile', 256, (v) => { logo = v; }, 'logo');
  pick('#bannerFile', 1000, (v) => { banner = v; }, 'banner');
  // نعلّم الحقل الخاطئ ونكتب الرسالة تحته مباشرة (وأيضاً فوق زر الدفع)
  const markBad = (name) => {
    $$('[aria-invalid]', el).forEach((x) => x.removeAttribute('aria-invalid')); $$('.field-err', el).forEach((x) => x.remove());
    const inp = name && $(`[name=${name}], #${name}File`, el); if (!inp) return;
    inp.setAttribute('aria-invalid', 'true');
    const m = document.createElement('small'); m.className = 'field-err'; m.setAttribute('role', 'alert'); m.textContent = err0().textContent; inp.closest('.field')?.append(m);
    inp.focus(); inp.scrollIntoView({ block: 'center' });
  };
  $$('.cnt', el).forEach((c) => { const inp = $(`[name=${c.dataset.for}]`, el); inp.addEventListener('input', () => { c.textContent = inp.value.length; }); });
  $('#coForm', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(e.target); const err = $('.form-err', el); err.textContent = '';
    if (fd.get('acceptPolicy') !== POLICY.version) { err.textContent = 'يجب الموافقة على سياسة تأجير المتاجر أولاً'; $('input[name=acceptPolicy]', el).focus(); return; }
    if (!renew) {
      const name = String(fd.get('name') || '').trim(), desc = String(fd.get('description') || '').trim();
      if (!name || name.length > 40) { err.textContent = t('storeErr_name'); markBad('name'); return; }
      if (desc.length > 200) { err.textContent = t('storeErr_description'); markBad('description'); return; }
      const c = normContact(fd.get('contact'));
      if (c === null) { err.textContent = t('storeErr_contact'); markBad('contact'); return; }
      if (c) $('input[name=contact]', el).value = c;                 // نعرض الرابط النهائي الذي سيُحفظ
      fd.set('contact', c);
      try { await Promise.all(Object.values(pending)); } catch (ex) { err.textContent = storeErrorMessage(ex, t); markBad(ex.field); return; }
    }
    markBad(null);
    const btn = $('#payBtn', el); btn.disabled = true; btn.innerHTML = `<span class="spinner sm"></span> ${esc(t('processing'))}`;
    try {
      const payment = await startPayment({ amount: plan.price, method: fd.get('method'), description: `${plan.id} store rental` });
      if (!payment.ok) throw new Error(payment.error || 'payment');
      if (renew) await api.renewRental({ storeId: store.id, planId: plan.id, payment });
      else await api.createStoreWithRental({ planId: plan.id, payment, store: { name: fd.get('name'), category: fd.get('category'), description: fd.get('description'), contact: fd.get('contact'), logo, banner } });
      toast(api.mode !== 'local' ? t('rentalPending') : t('paySuccess', { ref: payment.ref }), 'ok'); await ctx.refreshMe(); ctx.navigate('#/dashboard');
    } catch (ex) { console.warn(ex); err.textContent = storeErrorMessage(ex, t); markBad(ex.field); btn.disabled = false; btn.textContent = t('payDemo', { amount: fmtKWD(plan.price) }); }
  });
}
