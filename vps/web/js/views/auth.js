import { api } from '../services/index.js';
import { t, lang } from '../i18n.js';
import { BRAND } from '../config.js';
import { icon, esc, $, toast } from '../ui.js';
import { pageHead } from './common.js';
import { brandHTML, legalLinksHTML } from '../app.js';

let gsiPromise;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('googleUnavailable'));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

export async function render(el, params, ctx) {
  const next = params.query.get('next') || '#/feed';
  let mode = params.query.get('mode') === 'signup' ? 'signup' : 'login';
  const cloud = api.mode !== 'local';
  const draw = () => {
    el.innerHTML = `<div class="page narrow">${pageHead(mode === 'login' ? t('login') : t('signup'))}
      <div class="auth-hero">${brandHTML(56)}<p class="muted">${esc(BRAND.tagline[lang])}</p></div>
      ${cloud ? `<div class="note" role="note">${icon('shield', { size: 18 })}<span>${esc(t('cloudNoteApi'))}</span></div>` : `<div class="warn" role="note">${icon('shield', { size: 18 })}<span>${esc(t('insecureNote'))}</span></div>`}
      <div class="seg" role="tablist"><button role="tab" data-m="login" aria-selected="${mode === 'login'}" class="${mode === 'login' ? 'on' : ''}">${esc(t('login'))}</button><button role="tab" data-m="signup" aria-selected="${mode === 'signup'}" class="${mode === 'signup' ? 'on' : ''}">${esc(t('signup'))}</button></div>
      <form class="form" id="authForm" novalidate>
        ${mode === 'signup' ? `<label class="field"><span>${esc(t('displayName'))}</span><input name="name" maxlength="40" autocomplete="name"></label>` : ''}
        ${cloud ? `<label class="field"><span>${esc(t('email'))}</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>` : ''}
        ${!cloud || mode === 'signup' ? `<label class="field"><span>${esc(t('username'))}</span><input name="username" required autocomplete="username" dir="ltr" pattern="[a-z0-9._]{3,24}" placeholder="a-z 0-9 . _"></label>` : ''}
        <label class="field"><span>${esc(t('password'))}</span><input name="password" type="password" required minlength="${cloud ? 8 : 6}" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" dir="ltr"></label>
        ${cloud && mode === 'login' ? `<p class="forgot-row"><a href="#/forgot" class="forgot-link" id="forgotLink">${esc(t('forgotPw'))}</a></p>` : ''}
        <p class="form-err" role="alert"></p>
        <button class="btn primary block lg" type="submit">${esc(mode === 'login' ? t('login') : t('signup'))}</button>
      </form>
      ${cloud && api.googleClientId ? `<div class="google-auth">
        <p class="auth-or"><span>${esc(t('orDivider'))}</span></p>
        <div id="googleBtn" class="google-btn-slot" role="group" aria-label="${esc(t('continueWithGoogle'))}"></div>
      </div>` : ''}
      ${legalLinksHTML()}
      ${cloud ? '' : `<div class="demo-logins">
        <button class="btn ghost block" data-demo="sara.travels">${icon('user', { size: 16 })} ${esc(t('demoUser'))}</button>
        <button class="btn ghost block" data-demo="fahad.coffee">${icon('store', { size: 16 })} ${esc(t('demoSeller'))}</button>
        <button class="btn ghost block" data-demo="admin">${icon('shield', { size: 16 })} ${esc(t('demoAdmin'))}</button>
        <p class="muted sm center">demo1234</p>
      </div>`}</div>`;
    el.querySelector('#forgotLink')?.addEventListener('click', (e) => { const em = String(el.querySelector('input[name=email]')?.value || '').trim(); if (em) { e.preventDefault(); sessionStorage.setItem('ck:forgotEmail', em); ctx.navigate('#/forgot'); } });
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; draw(); }));
    el.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', async () => { await api.login(b.dataset.demo, 'demo1234'); done(); }));
    $('#authForm', el).addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target); const err = $('.form-err', el); err.textContent = '';
      const username = String(fd.get('username') || '').trim(), password = String(fd.get('password') || ''), email = String(fd.get('email') || '').trim();
      if ((cloud ? !email : !username) || !password || (cloud && mode === 'signup' && !username)) { err.textContent = t('fillAll'); return; }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        if (mode === 'login') await (cloud ? api.login(email, password) : api.login(username, password));
        else await api.signUp({ email, username, password, name: fd.get('name') });
        done();
      } catch (ex) {
        const m = ex.message;
        if (m === 'confirm') { err.className = 'form-ok'; err.textContent = t('confirmEmailSent'); mode = 'login'; btn.disabled = false; return; }
        err.textContent = m === 'taken' ? t('userTaken') : m === 'password' ? t(cloud ? 'pwShort8' : 'pwShort') : m === 'username' ? t('username') + ': a-z 0-9 . _ (3-24)' : m === 'unconfirmed' ? t('unconfirmed') : m === 'emailTaken' ? t('emailTaken') : m === 'bad' ? t('badLogin') : m;
        btn.disabled = false;
      }
    });
    const slot = el.querySelector('#googleBtn');
    if (slot && api.googleClientId) {
      const err = $('.form-err', el);
      const googleErr = (code) => {
        const msg = code === 'badGoogle' || code === 'bad' ? t('badGoogle') : code === 'googleDisabled' ? t('googleDisabled') : code === 'googleLinked' ? t('googleLinked') : code === 'emailTaken' ? t('emailTaken') : code === 'taken' ? t('userTaken') : (t(code) !== code ? t(code) : t('badGoogle'));
        if (err) err.textContent = msg;
        toast(msg, 'warn');
      };
      const onCred = async (resp) => {
        if (err) err.textContent = '';
        try {
          await api.loginWithGoogle(resp.credential);
          done();
        } catch (ex) { googleErr(ex.message); }
      };
      const googleWidth = () => {
        const form = el.querySelector('#authForm');
        const raw = (form && form.clientWidth) || slot.clientWidth || 0;
        return Math.max(200, Math.min(Math.floor(raw || 320), 400));
      };
      const paintGoogle = () => {
        if (!el.contains(slot) || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: api.googleClientId,
          callback: onCred,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          context: mode === 'signup' ? 'signup' : 'signin',
          itp_support: true
        });
        slot.replaceChildren();
        const w = googleWidth();
        window.google.accounts.id.renderButton(slot, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: w,
          locale: lang === 'ar' ? 'ar' : 'en'
        });
        slot.setAttribute('aria-label', t('continueWithGoogle'));
      };
      loadGsi().then(() => requestAnimationFrame(() => requestAnimationFrame(paintGoogle)))
        .catch(() => googleErr('googleUnavailable'));
    }
  };
  const done = async () => { await ctx.refreshMe(); toast(t('welcome'), 'ok'); ctx.navigate(next.startsWith('#/login') ? '#/feed' : next); };
  draw();
}
