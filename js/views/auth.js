import { api } from '../services/index.js';
import { t, lang } from '../i18n.js';
import { BRAND } from '../config.js';
import { icon, esc, $, toast } from '../ui.js';
import { pageHead } from './common.js';
import { brandHTML } from '../app.js';

export async function render(el, params, ctx) {
  const next = params.query.get('next') || '#/feed';
  let mode = params.query.get('mode') === 'signup' ? 'signup' : 'login';
  const draw = () => {
    el.innerHTML = `<div class="page narrow">${pageHead(mode === 'login' ? t('login') : t('signup'))}
      <div class="auth-hero">${brandHTML(56)}<p class="muted">${esc(BRAND.tagline[lang])}</p></div>
      <div class="warn" role="note">${icon('shield', { size: 18 })}<span>${esc(t('insecureNote'))}</span></div>
      <div class="seg" role="tablist"><button role="tab" data-m="login" aria-selected="${mode === 'login'}" class="${mode === 'login' ? 'on' : ''}">${esc(t('login'))}</button><button role="tab" data-m="signup" aria-selected="${mode === 'signup'}" class="${mode === 'signup' ? 'on' : ''}">${esc(t('signup'))}</button></div>
      <form class="form" id="authForm" novalidate>
        ${mode === 'signup' ? `<label class="field"><span>${esc(t('displayName'))}</span><input name="name" maxlength="40" autocomplete="name"></label>` : ''}
        <label class="field"><span>${esc(t('username'))}</span><input name="username" required autocomplete="username" dir="ltr" pattern="[a-z0-9._]{3,24}" placeholder="a-z 0-9 . _"></label>
        <label class="field"><span>${esc(t('password'))}</span><input name="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" dir="ltr"></label>
        <p class="form-err" role="alert"></p>
        <button class="btn primary block lg" type="submit">${esc(mode === 'login' ? t('login') : t('signup'))}</button>
      </form>
      <div class="demo-logins">
        <button class="btn ghost block" data-demo="sara.travels">${icon('user', { size: 16 })} ${esc(t('demoUser'))}</button>
        <button class="btn ghost block" data-demo="fahad.coffee">${icon('store', { size: 16 })} ${esc(t('demoSeller'))}</button>
        <button class="btn ghost block" data-demo="admin">${icon('shield', { size: 16 })} ${esc(t('demoAdmin'))}</button>
        <p class="muted sm center">demo1234</p>
      </div></div>`;
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; draw(); }));
    el.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', async () => { await api.login(b.dataset.demo, 'demo1234'); done(); }));
    $('#authForm', el).addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target); const err = $('.form-err', el); err.textContent = '';
      const username = String(fd.get('username') || '').trim(), password = String(fd.get('password') || '');
      if (!username || !password) { err.textContent = t('fillAll'); return; }
      try {
        if (mode === 'login') await api.login(username, password);
        else await api.signUp({ username, password, name: fd.get('name') });
        done();
      } catch (ex) { err.textContent = ex.message === 'taken' ? t('userTaken') : ex.message === 'password' ? t('pwShort') : ex.message === 'username' ? t('username') + ': a-z 0-9 . _ (3-24)' : t('badLogin'); }
    });
  };
  const done = async () => { await ctx.refreshMe(); toast(t('welcome'), 'ok'); ctx.navigate(next.startsWith('#/login') ? '#/feed' : next); };
  draw();
}
