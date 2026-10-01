import { api } from '../services/index.js';
import { t, fmtKWD } from '../i18n.js';
import { icon, esc, $, $$, toast, productImg } from '../ui.js';
import { pageHead } from './common.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  const store = await api.getMyStore();
  const active = store && api.storeStatus(store).active;
  const products = active ? await api.listProducts(store.id) : [];
  el.innerHTML = `<div class="page narrow">${pageHead(t('upload'))}
    <form class="upload-form" novalidate>
      <label class="drop" id="drop">
        <input type="file" name="file" accept="video/*" class="sr-only" aria-label="${esc(t('pickVideo'))}">
        <div class="drop-empty">${icon('plus', { size: 36 })}<b>${esc(t('pickVideo'))}</b><span class="muted sm">${esc(t('pickHint'))}</span></div>
        <video class="preview" playsinline muted loop hidden></video>
        <span class="drop-change btn sm glass" hidden>${esc(t('change'))}</span>
      </label>
      <label class="field"><span>${esc(t('caption'))}</span><textarea name="caption" rows="3" maxlength="300" placeholder="${esc(t('captionPh'))}"></textarea></label>
      <label class="field"><span>${esc(t('hashtags'))}</span><input name="hashtags" placeholder="${esc(t('hashtagsPh'))}"></label>
      <label class="field"><span>${esc(t('sound'))}</span><input name="sound" placeholder="${esc(t('originalSound'))} - ${esc(ctx.me.username)}"></label>
      <fieldset class="field"><legend>${icon('bag', { size: 16 })} ${esc(t('attachProducts'))}</legend>
        ${products.length ? `<div class="tag-products">${products.map((p) => `<label class="tagp"><input type="checkbox" name="products" value="${p.id}"><img src="${productImg(p)}" alt=""><span><b>${esc(p.name)}</b><small>${esc(fmtKWD(p.price))}</small></span><i class="tick">${icon('check', { size: 14 })}</i></label>`).join('')}</div>`
          : `<p class="muted sm">${esc(store && !active ? t('storeInactive') : t('noStoreForTag'))} <a href="${store ? '#/dashboard' : '#/rent'}">${esc(store ? t('dashboard') : t('rentNow'))}</a></p>`}
      </fieldset>
      <button class="btn primary block lg" type="submit">${esc(t('publish'))}</button>
    </form></div>`;
  const form = $('form', el), fileIn = $('input[type=file]', el), prev = $('video', el);
  let file = null, poster = null, url = null;
  fileIn.addEventListener('change', () => {
    file = fileIn.files[0] || null; if (!file) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file); poster = null;
    prev.hidden = false; $('.drop-empty', el).hidden = true; $('.drop-change', el).hidden = false;
    prev.src = url;
    prev.addEventListener('loadeddata', () => { prev.currentTime = Math.min(0.6, (prev.duration || 1) / 2); }, { once: true });
    prev.addEventListener('seeked', () => {
      try { const c = document.createElement('canvas'); const w = 360; c.width = w; c.height = Math.round(w * (prev.videoHeight / prev.videoWidth || 16 / 9)); c.getContext('2d').drawImage(prev, 0, 0, c.width, c.height); poster = c.toDataURL('image/jpeg', 0.75); } catch { poster = null; }
      prev.play().catch(() => {});
    }, { once: true });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!file) { toast(t('pickFirst'), 'warn'); return; }
    const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = t('publishing');
    try {
      const fd = new FormData(form);
      const v = await api.createVideo({ file, poster, caption: fd.get('caption'), hashtags: String(fd.get('hashtags') || '').split(/[\s,،]+/).filter(Boolean), sound: fd.get('sound')?.trim() || null, productIds: $$('input[name=products]:checked', form).map((i) => i.value) });
      toast(t('published'), 'ok'); ctx.navigate('#/watch/' + v.id);
    } catch (err) { console.warn(err); toast(err.message, 'warn'); btn.disabled = false; btn.textContent = t('publish'); }
  });
  return () => { prev.pause(); if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); };
}
