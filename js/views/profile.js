import { api } from '../services/index.js';
import { t, fmtNum } from '../i18n.js';
import { icon, esc, $, toast, openSheet, avatarOf, fileToDataURL, storeLogo, emptyState, verifiedBadge } from '../ui.js';
import { pageHead, videoGrid } from './common.js';

export async function render(el, params, ctx) {
  let id = params.args[0];
  if (params.name === 'me' || id === 'me') { if (!(await ctx.requireLogin())) return; id = ctx.me.id; }
  const user = await api.getUser(id);
  if (!user) { el.innerHTML = `<div class="page">${pageHead('')}${emptyState(t('notFound'))}</div>`; return; }
  const own = ctx.me?.id === user.id;
  const tab = params.query.get('tab') || 'videos';
  const [stats, store, following] = await Promise.all([api.userStats(user.id), api.getStoreByOwner(user.id), ctx.me ? api.isFollowing(ctx.me.id, user.id) : false]);
  const vids = tab === 'saved' && own ? await api.listVideos({ savedBy: user.id }) : tab === 'liked' && own ? await api.listVideos({ likedBy: user.id }) : await api.listVideos({ userId: user.id });
  const storeActive = store && api.storeStatus(store).active;
  const base = `#/profile/${user.id}`;
  el.innerHTML = `<div class="page">${pageHead('@' + user.username, { back: !own })}
    <section class="profile">
      <img class="av xl" src="${avatarOf(user)}" alt="">
      <h1 class="pname">${esc(user.name)} ${user.role === 'admin' ? `<span class="pill">${icon('shield', { size: 12 })} admin</span>` : ''}</h1>
      <div class="pstats">
        <div><b>${fmtNum(stats.following)}</b><span>${esc(t('followingCount'))}</span></div>
        <div><b id="nFollowers">${fmtNum(stats.followers)}</b><span>${esc(t('followers'))}</span></div>
        <div><b>${fmtNum(stats.likes)}</b><span>${esc(t('likes'))}</span></div>
      </div>
      ${user.bio ? `<p class="pbio">${esc(user.bio)}</p>` : ''}
      <div class="pactions">
        ${own ? `<button class="btn" id="editBtn">${icon('edit', { size: 16 })} ${esc(t('editProfile'))}</button>
                 <a class="btn" href="${store ? '#/dashboard' : '#/rent'}">${icon('store', { size: 16 })} ${esc(store ? t('dashboard') : t('rentNow'))}</a>`
              : `<button class="btn ${following ? '' : 'primary'}" id="followBtn" aria-pressed="${following}">${esc(following ? t('followingBtn') : t('follow'))}</button>`}
      </div>
      ${store && storeActive ? `<a class="store-chip" href="#/store/${store.id}"><img src="${storeLogo(store)}" alt=""><span class="grow"><b>${esc(store.name)}${store.verified ? verifiedBadge(t('verified')) : ''}</b><small>${esc(t('visitStore'))}</small></span>${icon('back', { size: 18, cls: 'flip-ltr' })}</a>` : ''}
      ${own ? `<div class="prow">${ctx.me.role === 'admin' ? `<a class="btn sm ghost" href="#/admin">${icon('chart', { size: 16 })} ${esc(t('admin'))}</a>` : ''}<button class="btn sm ghost" id="logoutBtn">${icon('logout', { size: 16 })} ${esc(t('logout'))}</button><button class="btn sm ghost" id="resetBtn">${icon('refresh', { size: 16 })} ${esc(t('resetDemo'))}</button></div>` : ''}
    </section>
    <div class="seg" role="tablist">
      <a role="tab" href="${base}?tab=videos" class="${tab === 'videos' ? 'on' : ''}" aria-selected="${tab === 'videos'}">${icon('play', { size: 16 })} ${esc(t('videos'))}</a>
      ${own ? `<a role="tab" href="${base}?tab=saved" class="${tab === 'saved' ? 'on' : ''}" aria-selected="${tab === 'saved'}">${icon('bookmark', { size: 16 })} ${esc(t('saved'))}</a>
      <a role="tab" href="${base}?tab=liked" class="${tab === 'liked' ? 'on' : ''}" aria-selected="${tab === 'liked'}">${icon('heart', { size: 16 })} ${esc(t('liked'))}</a>` : ''}
    </div>
    ${vids.length ? videoGrid(vids) : emptyState(t('noVideos'), '', own && tab === 'videos' ? `<a class="btn primary" href="#/upload">${esc(t('upload'))}</a>` : '')}
  </div>`;

  $('#followBtn', el)?.addEventListener('click', async (e) => {
    if (!(await ctx.requireLogin())) return;
    const on = await api.toggleFollow(user.id); const b = e.currentTarget;
    b.textContent = on ? t('followingBtn') : t('follow'); b.classList.toggle('primary', !on); b.setAttribute('aria-pressed', String(on));
    $('#nFollowers', el).textContent = fmtNum((await api.userStats(user.id)).followers);
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
