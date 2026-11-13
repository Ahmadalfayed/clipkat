// © 2026 وطن النهار — «نسيت كلمة السر؟»: طلب رابط الاستعادة (#/forgot) وصفحة كلمة المرور الجديدة (#/reset?t=…)
import { api } from '../services/index.js';
import { t, lang } from '../i18n.js';
import { BRAND } from '../config.js';
import { icon, esc, $, toast } from '../ui.js';
import { pageHead } from './common.js';
import { brandHTML } from '../app.js';

const hero = () => `<div class="auth-hero">${brandHTML(56)}<p class="muted">${esc(BRAND.tagline[lang])}</p></div>`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderForgot(el, ctx) {
  const pre = sessionStorage.getItem('ck:forgotEmail') || ''; sessionStorage.removeItem('ck:forgotEmail');
  const drawForm = (email = pre) => {
    el.innerHTML = `<div class="page narrow">${pageHead(t('forgotTitle'))}${hero()}
      <form class="form" id="forgotForm" novalidate>
        <p class="muted reset-intro">${esc(t('forgotIntro'))}</p>
        <label class="field"><span>${esc(t('email'))}</span><input name="email" type="email" required autocomplete="email" dir="ltr" inputmode="email" value="${esc(email)}"></label>
        <p class="form-err" role="alert"></p>
        <button class="btn primary block lg" type="submit">${esc(t('sendResetLink'))}</button>
        <p class="reset-alt"><a href="#/login">${esc(t('backToLogin'))}</a></p>
      </form></div>`;
    $('#forgotForm', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.form-err', el); err.textContent = '';
      const em = String(new FormData(e.target).get('email') || '').trim();
      if (!EMAIL_RE.test(em)) { err.textContent = t('badEmail'); return; }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try { const r = await api.forgotPassword(em); drawSent(em, r?.message); }
      catch (ex) { err.textContent = ex.message === 'bad' ? t('badEmail') : ex.message; btn.disabled = false; }
    });
    if (!pre) el.querySelector('input[name=email]')?.focus({ preventScroll: true });
  };
  const drawSent = (email, message) => {
    el.innerHTML = `<div class="page narrow">${pageHead(t('forgotTitle'))}${hero()}
      <div class="reset-card" role="status">
        <div class="reset-ico">${icon('inbox', { size: 30 })}</div>
        <h2>${esc(t('forgotSentTitle'))}</h2>
        <p>${esc(message || '')}</p>
        <p class="muted sm">${esc(t('googleHint'))}</p>
      </div>
      <a class="btn primary block lg" href="#/login">${esc(t('backToLogin'))}</a>
      <p class="reset-alt"><button type="button" class="linkbtn" id="again">${esc(t('resendLink'))}</button></p></div>`;
    $('#again', el).addEventListener('click', () => drawForm(email));
  };
  drawForm();
}

async function renderReset(el, params, ctx) {
  const token = params.query.get('t') || '';
  // نُخفي الرمز من شريط العنوان وسجل المتصفح بعد قراءته
  if (token) try { history.replaceState(null, '', location.pathname + location.search + '#/reset'); } catch {}
  const invalid = () => {
    el.innerHTML = `<div class="page narrow">${pageHead(t('resetTitle'))}${hero()}
      <div class="reset-card warn-card" role="alert"><div class="reset-ico">${icon('shield', { size: 30 })}</div><p>${esc(t('resetInvalid'))}</p></div>
      <a class="btn primary block lg" href="#/forgot">${esc(t('requestNewLink'))}</a>
      <p class="reset-alt"><a href="#/login">${esc(t('backToLogin'))}</a></p></div>`;
  };
  let ok = false;
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) { try { ok = await api.checkResetToken(token); } catch { ok = false; } }
  if (!ok) return invalid();
  el.innerHTML = `<div class="page narrow">${pageHead(t('resetTitle'))}${hero()}
    <form class="form" id="resetForm" novalidate>
      <p class="muted reset-intro">${esc(t('resetIntro'))}</p>
      <label class="field"><span>${esc(t('newPassword'))}</span><input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" dir="ltr"></label>
      <label class="field"><span>${esc(t('confirmPassword'))}</span><input name="confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password" dir="ltr"></label>
      <label class="check-row"><input type="checkbox" id="showPw"> <span>${esc(t('showPw'))}</span></label>
      <p class="form-err" role="alert"></p>
      <button class="btn primary block lg" type="submit">${esc(t('savePassword'))}</button>
    </form></div>`;
  $('#showPw', el).addEventListener('change', (e) => el.querySelectorAll('input[name=password],input[name=confirm]').forEach((i) => { i.type = e.target.checked ? 'text' : 'password'; }));
  $('#resetForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target); const err = $('.form-err', el); err.textContent = '';
    const pw = String(fd.get('password') || ''), cf = String(fd.get('confirm') || '');
    if (pw.length < 8) { err.textContent = t('pwShort8'); return; }
    if (pw !== cf) { err.textContent = t('pwMismatch'); return; }
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await api.resetPassword(token, pw, cf);
      await ctx.refreshMe();
      toast(t('resetDone'), 'ok');
      ctx.navigate('#/login');
    } catch (ex) {
      if (ex.message === 'resetInvalid') return invalid();
      err.textContent = ex.message === 'password' ? t('pwShort8') : ex.message === 'mismatch' ? t('pwMismatch') : ex.message;
      btn.disabled = false;
    }
  });
}

export async function render(el, params, ctx) {
  if (params.name === 'reset') return renderReset(el, params, ctx);
  return renderForgot(el, ctx);
}
