// © 2026 وطن النهار — شاشة الإعدادات والخصوصية (كل خيار هنا محفوظ ومطبّق فعلياً في الخادم)
import { api } from '../services/index.js';
import { t } from '../i18n.js';
import { icon, esc, $, toast, avatarOf, emptyState } from '../ui.js';
import { pageHead, userRow } from './common.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (!api.social) { el.innerHTML = `<div class="page">${pageHead(t('settings'))}${emptyState(t('settings'), t('serverOnly'))}</div>`; return; }
  const [st, reqs, blocks] = await Promise.all([api.getSettings(), api.listFollowRequests(), api.listBlocks()]);
  const urow = (u, btns) => `<li class="set-user">${userRow(u)}<span class="set-btns">${btns}</span></li>`;
  el.innerHTML = `<div class="page">${pageHead(t('settings'))}
    <section class="card set-sec"><h2>${icon('shield', { size: 18 })} ${esc(t('secPrivacy'))}</h2>
      <label class="set-row"><span class="grow"><b>${esc(t('privateAccount'))}</b><small class="muted">${esc(t('privateAccountSub'))}</small></span>
        <input type="checkbox" role="switch" id="sPrivate" ${st.isPrivate ? 'checked' : ''} aria-label="${esc(t('privateAccount'))}"></label>
      <label class="set-row"><span class="grow"><b>${esc(t('whoComments'))}</b></span>
        <select id="sComments" aria-label="${esc(t('whoComments'))}">${['everyone', 'followers', 'nobody'].map((p) => `<option value="${p}" ${st.commentPolicy === p ? 'selected' : ''}>${esc(t('cp_' + p))}</option>`).join('')}</select></label>
    </section>
    <section class="card set-sec"><h2>${icon('user', { size: 18 })} ${esc(t('secRequests'))} ${reqs.length ? `<span class="pill">${reqs.length}</span>` : ''}</h2>
      ${reqs.length ? `<ul class="set-list">${reqs.map((u) => urow(u, `<button class="btn sm primary" data-acc="${u.id}">${esc(t('accept'))}</button><button class="btn sm ghost" data-dec="${u.id}">${esc(t('decline'))}</button>`)).join('')}</ul>` : `<p class="muted">${esc(t('noRequests'))}</p>`}
    </section>
    <section class="card set-sec"><h2>${icon('close', { size: 18 })} ${esc(t('secBlocked'))}</h2>
      ${blocks.length ? `<ul class="set-list">${blocks.map((u) => urow(u, `<button class="btn sm" data-unb="${u.id}">${esc(t('unblock'))}</button>`)).join('')}</ul>` : `<p class="muted">${esc(t('noBlocked'))}</p>`}
    </section>
    <section class="card set-sec"><h2>${icon('edit', { size: 18 })} ${esc(t('secAccount'))}</h2>
      <a class="set-row link" href="#/profile/${ctx.me.id}"><img class="av sm" src="${avatarOf(ctx.me)}" alt=""><span class="grow">${esc(t('editProfileLink'))}</span>${icon('back', { size: 16, cls: 'flip-ltr' })}</a>
      <form class="form" id="pwForm" autocomplete="on"><h3>${esc(t('changePassword'))}</h3>
        <input type="text" name="username" autocomplete="username" value="${esc(ctx.me.username)}" hidden>
        <label class="field"><span>${esc(t('currentPassword'))}</span><input type="password" name="current" autocomplete="current-password" required maxlength="128"></label>
        <label class="field"><span>${esc(t('newPassword'))}</span><input type="password" name="next" autocomplete="new-password" required minlength="8" maxlength="128"></label>
        <button class="btn primary" type="submit">${esc(t('changePassword'))}</button></form>
      <button class="btn ghost block" id="logoutAll">${icon('logout', { size: 16 })} ${esc(t('logoutAll'))}</button>
    </section>
    <section class="card set-sec"><a class="set-row link" href="#/sounds">${icon('music', { size: 18 })}<span class="grow"><b>${esc(t('soundLibrary'))}</b></span>${icon('back', { size: 16, cls: 'flip-ltr' })}</a>
    <a class="set-row link" href="#/policy">${icon('store', { size: 18 })}<span class="grow"><b>سياسة تأجير المتاجر والتعاملات</b><small class="muted">كليب كات تؤجّر المتاجر فقط ولا تستلم أموال المشتريات</small></span>${icon('back', { size: 16, cls: 'flip-ltr' })}</a></section>
    <section class="card set-sec soon"><h2>${esc(t('secSoon'))}</h2><p class="muted">${esc(t('soonList'))}</p></section>
    <p class="muted center sm">© 2026 وطن النهار</p>
  </div>`;

  const save = async (patch, ctl) => {
    ctl.disabled = true;
    try { const r = await api.updateSettings(patch); $('#sPrivate', el).checked = r.isPrivate; $('#sComments', el).value = r.commentPolicy; toast(t('saved_ok'), 'ok'); if (patch.isPrivate === false) ctx.rerender(); }
    catch (e) { toast(e.message, 'warn'); ctx.rerender(); } finally { ctl.disabled = false; }
  };
  $('#sPrivate', el).addEventListener('change', (e) => save({ isPrivate: e.target.checked }, e.target));
  $('#sComments', el).addEventListener('change', (e) => save({ commentPolicy: e.target.value }, e.target));
  el.querySelectorAll('[data-acc],[data-dec]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true; await api.respondFollowRequest(b.dataset.acc || b.dataset.dec, !!b.dataset.acc); ctx.rerender();
  }));
  el.querySelectorAll('[data-unb]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; await api.unblock(b.dataset.unb); toast(t('unblockedOk'), 'ok'); ctx.rerender(); }));
  $('#pwForm', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(e.target); const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try { await api.changePassword(fd.get('current'), fd.get('next')); e.target.reset(); toast(t('passwordChanged'), 'ok'); }
    catch (err) { toast(t(err.message === 'badPassword' ? 'badPassword' : err.message), 'warn'); } finally { btn.disabled = false; }
  });
  $('#logoutAll', el).addEventListener('click', async () => { if (!confirm(t('logoutAllConfirm'))) return; await api.logoutAll(); await ctx.refreshMe(); ctx.navigate('#/feed'); });
}
