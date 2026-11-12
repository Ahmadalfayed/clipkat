import { api } from '../services/index.js';
import { t, fmtNum } from '../i18n.js';
import { icon, esc, $, toast, openSheet, avatarOf, fileToDataURL, storeLogo, emptyState, verifiedBadge } from '../ui.js';
import { pageHead, videoGrid, openReportSheet, confirmBlock, videoOptionsSheet } from './common.js';
import { callButtons, wireCallButtons } from '../calls.js';
import { rtcConfig, rq } from '../rtc.js';

export async function render(el, params, ctx) {
  let id = params.args[0];
  if (params.name === 'me' || id === 'me') { if (!(await ctx.requireLogin())) return; id = ctx.me.id; }
  const user = api.social ? await api.getProfileFresh(id) : await api.getUser(id);
  if (!user) { el.innerHTML = `<div class="page">${pageHead('')}${emptyState(t('notFound'))}</div>`; return; }
  const own = ctx.me?.id === user.id;
  const rel = user.relation || {}; const locked = !own && api.social && (rel.blockedByMe || (user.isPrivate && !rel.following && ctx.me?.role !== 'admin'));
  const tab = params.query.get('tab') || 'videos';
  const [stats, store, following] = await Promise.all([api.userStats(user.id), api.getStoreByOwner(user.id), ctx.me ? api.isFollowing(ctx.me.id, user.id) : false]);
  const vids = locked ? [] : tab === 'saved' && own ? await api.listVideos({ savedBy: user.id }) : tab === 'liked' && own ? await api.listVideos({ likedBy: user.id }) : await api.listVideos({ userId: user.id });
  const storeActive = store && api.storeStatus(store).active;
  const base = `#/profile/${user.id}`;
  el.innerHTML = `<div class="page">${pageHead('@' + user.username, { back: !own })}
    <section class="profile">
      <img class="av xl" src="${avatarOf(user)}" alt="">
      <h1 class="pname">${esc(user.name)} ${user.isPrivate ? `<span class="pill" title="${esc(t('privateAccount'))}">🔒</span>` : ''} ${user.role === 'admin' ? `<span class="pill">${icon('shield', { size: 12 })} admin</span>` : ''}</h1>
      <div class="pstats">
        <div><b>${fmtNum(stats.following)}</b><span>${esc(t('followingCount'))}</span></div>
        <div><b id="nFollowers">${fmtNum(stats.followers)}</b><span>${esc(t('followers'))}</span></div>
        <div><b>${fmtNum(stats.likes)}</b><span>${esc(t('likes'))}</span></div>
      </div>
      ${user.bio ? `<p class="pbio">${esc(user.bio)}</p>` : ''}
      <div class="pactions">
        ${own ? `<button class="btn" id="editBtn">${icon('edit', { size: 16 })} ${esc(t('editProfile'))}</button>
                 <a class="btn" href="${store ? '#/dashboard' : '#/rent'}">${icon('store', { size: 16 })} ${esc(store ? t('dashboard') : t('rentNow'))}</a>
                 ${api.social ? `<a class="btn" href="#/settings" aria-label="${esc(t('settings'))}">${icon('shield', { size: 16 })} ${esc(t('settings'))}</a><a class="btn" href="#/drafts">${esc(t('drafts'))}</a>` : ''}`
              : rel.blockedByMe ? `<button class="btn" id="unblockBtn">${esc(t('unblock'))}</button>`
              : `<button class="btn ${following || rel.requested ? '' : 'primary'}" id="followBtn" aria-pressed="${following}">${esc(following ? t('followingBtn') : rel.requested ? t('requested') : t('follow'))}</button>`}
        ${!own && api.social && ctx.me && !rel.blockedByMe ? `<a class="btn" href="#/chat/${user.id}">${esc(t('message'))}</a>` : ''}
        <span class="pcall" id="pfCall"></span>
        ${!own && api.social && ctx.me ? `<button class="btn" id="moreBtn" aria-label="${esc(t('more'))}">⋯</button>` : ''}
      </div>
      ${store && storeActive ? `<a class="store-chip" href="#/store/${store.id}"><img src="${storeLogo(store)}" alt=""><span class="grow"><b>${esc(store.name)}${store.verified ? verifiedBadge(t('verified')) : ''}</b><small>${esc(t('visitStore'))}</small></span>${icon('back', { size: 18, cls: 'flip-ltr' })}</a>` : ''}
      ${own ? `<div class="prow">${ctx.me.role === 'admin' ? `<a class="btn sm ghost" href="#/admin">${icon('chart', { size: 16 })} ${esc(t('admin'))}</a>` : ''}<button class="btn sm ghost" id="logoutBtn">${icon('logout', { size: 16 })} ${esc(t('logout'))}</button>${api.mode === 'local' ? `<button class="btn sm ghost" id="resetBtn">${icon('refresh', { size: 16 })} ${esc(t('resetDemo'))}</button>` : ''}</div>` : ''}
    </section>
    <div class="seg" role="tablist">
      <a role="tab" href="${base}?tab=videos" class="${tab === 'videos' ? 'on' : ''}" aria-selected="${tab === 'videos'}">${icon('play', { size: 16 })} ${esc(t('videos'))}</a>
      ${own ? `<a role="tab" href="${base}?tab=saved" class="${tab === 'saved' ? 'on' : ''}" aria-selected="${tab === 'saved'}">${icon('bookmark', { size: 16 })} ${esc(t('saved'))}</a>
      <a role="tab" href="${base}?tab=liked" class="${tab === 'liked' ? 'on' : ''}" aria-selected="${tab === 'liked'}">${icon('heart', { size: 16 })} ${esc(t('liked'))}</a>` : ''}
    </div>
    ${locked ? emptyState(rel.blockedByMe ? t('blockedProfile') : t('privateProfile'), rel.blockedByMe ? '' : t('privateProfileSub')) : vids.length ? videoGrid(vids, { own: own && tab === 'videos' && api.social }) : emptyState(t('noVideos'), '', own && tab === 'videos' ? `<a class="btn primary" href="#/upload">${esc(t('upload'))}</a>` : '')}
  </div>`;

  // خيارات مقاطعي (حذف الفيديو) — تظهر لصاحب الحساب فقط
  el.querySelector('.vgrid')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vmore]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    videoOptionsSheet(b.dataset.vmore, (id) => {
      el.querySelector(`.vcell[data-vid="${CSS.escape(id)}"]`)?.remove();
      if (!el.querySelector('.vgrid .vcell')) ctx.rerender();
    });
  });
  // أزرار الاتصال (للمتابعين المتبادلين أو من بينهم محادثة) + شارة «مباشر» إن كان يبث الآن
  (async () => {
    const box = $('#pfCall', el); if (!box || !api.social) return;
    const cfg = await rtcConfig(); if (!cfg.enabled) return;
    let html = '';
    const lv = (await rq('GET', '/live').catch(() => null))?.lives?.find((l) => l.userId === user.id);
    if (lv && !own) html += `<a class="btn live-pill" href="#/live/${lv.id}">${icon('live', { size: 16 })} ${esc(t('liveNow'))}</a>`;
    if (!own && ctx.me && !rel.blockedByMe) html += await callButtons(user);
    if (!el.isConnected) return;
    box.innerHTML = html; wireCallButtons(box, user);
  })().catch(() => {});
  $('#followBtn', el)?.addEventListener('click', async (e) => {
    if (!(await ctx.requireLogin())) return;
    const b = e.currentTarget; const on = await api.toggleFollow(user.id); const req = !!api.lastFollow?.requested;
    if (req) toast(t('requestSent'), 'ok');
    if (api.social && user.isPrivate) return ctx.rerender();
    b.textContent = on ? t('followingBtn') : req ? t('requested') : t('follow'); b.classList.toggle('primary', !on && !req); b.setAttribute('aria-pressed', String(on));
    $('#nFollowers', el).textContent = fmtNum((await api.userStats(user.id)).followers);
  });
  $('#unblockBtn', el)?.addEventListener('click', async () => { await api.unblock(user.id); toast(t('unblockedOk'), 'ok'); ctx.rerender(); });
  $('#moreBtn', el)?.addEventListener('click', () => {
    const sh = openSheet({ title: '@' + user.username, body: `<div class="menu-list">
      <button class="btn block ghost" data-m="copy">${esc(t('copyLink'))}</button>
      <button class="btn block ghost" data-m="report">${esc(t('reportUser'))}</button>
      ${rel.blockedByMe ? '' : `<button class="btn block ghost bad" data-m="block">${esc(t('block'))}</button>`}</div>` });
    sh.body.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return; sh.close();
      if (m === 'copy') { try { await navigator.clipboard.writeText(location.href.split('#')[0] + '#/profile/' + user.id); } catch {} toast(t('linkCopied')); }
      if (m === 'report') openReportSheet('user', user.id);
      if (m === 'block' && (await confirmBlock(user))) ctx.rerender();
    });
  });
  $('#logoutBtn', el)?.addEventListener('click', async () => { await api.logout(); ctx.navigate('#/feed'); });
  $('#resetBtn', el)?.addEventListener('click', async () => { if (confirm(t('resetConfirm'))) { await api.resetDemo(); location.hash = '#/feed'; location.reload(); } });
  $('#editBtn', el)?.addEventListener('click', () => {
    let avatar = user.avatar;
    const body = document.createElement('form'); body.className = 'form';
    body.innerHTML = `<div class="center"><img class="av xl" id="avPrev" src="${avatarOf(user)}" alt=""><label class="btn sm">${esc(t('changeAvatar'))}<input type="file" accept="image/*" class="sr-only" id="avFile"></label></div>
      <label class="field"><span>${esc(t('displayName'))}</span><input name="name" maxlength="40" value="${esc(user.name)}" required></label>
      <label class="field"><span>${esc(t('bio'))}</span><textarea name="bio" rows="3" maxlength="160">${esc(user.bio)}</textarea></label>
      <button class="btn primary block" type="submit">${esc(t('saveChanges'))}</button>`;
    const sh = openSheet({ title: t('editProfile'), body });
    $('#avFile', body).addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { avatar = await fileToDataURL(f, 256); $('#avPrev', body).src = avatar; } });
    body.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(body);
      await api.updateProfile({ name: fd.get('name').trim() || user.name, bio: fd.get('bio').trim(), avatar });
      sh.close(); toast(t('saved_ok'), 'ok'); ctx.rerender();
    });
  });
}
