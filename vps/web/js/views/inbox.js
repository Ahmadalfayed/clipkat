import { api } from '../services/index.js';
import { t, timeAgo } from '../i18n.js';
import { icon, esc, $, avatarOf, logoMark, emptyState } from '../ui.js';
import { pageHead } from './common.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  const tab = params.query.get('tab') || 'n';
  const counts = api.social ? await api.unreadBreakdown() : { notifications: 0, messages: 0 };
  el.innerHTML = `<div class="page">${pageHead(t('inbox'), { back: false })}
    <div class="seg" role="tablist">
      <a role="tab" href="#/inbox?tab=n" aria-selected="${tab === 'n'}" class="${tab === 'n' ? 'on' : ''}">${esc(t('notifications'))}${counts.notifications ? ` <span class="pill">${counts.notifications}</span>` : ''}</a>
      <a role="tab" href="#/inbox?tab=m" aria-selected="${tab === 'm'}" class="${tab === 'm' ? 'on' : ''}">${esc(t('messages'))}${counts.messages ? ` <span class="pill">${counts.messages}</span>` : ''}</a>
    </div>
    <div id="inboxBody"></div>
  </div>`;
  const body = $('#inboxBody', el);
  if (tab === 'm') return renderMessages(body, ctx);
  return renderNotes(body, ctx);
}

async function renderNotes(el, ctx) {
  const list = await api.listNotifications();
  const reqs = api.social ? await api.listFollowRequests() : [];
  const rows = await Promise.all(list.map(async (n) => {
    const from = n.fromId ? await api.getUser(n.fromId) : null;
    const v = n.videoId ? await api.getVideo(n.videoId) : null;
    let text;
    if (n.type === 'system') text = n.text === 'welcome' ? t('welcome') : n.text === 'storeReady' ? `${t('myStore')}: ${t('active')}` : n.text;
    else if (n.type === 'remix') text = t(n.text === 'stitch' ? 'n_remix_stitch' : n.text === 'duet' ? 'n_remix_duet' : 'n_remix');
    else text = t('n_' + n.type, { text: n.text || '' });
    return `<li class="notif ${n.read ? '' : 'unread'}">${from ? `<a href="#/profile/${from.id}"><img class="av" src="${avatarOf(from)}" alt=""></a>` : `<span class="av sys">${logoMark(30)}</span>`}
      <div class="grow">${from ? `<b>${esc(from.name)}</b> ` : ''}<span>${esc(text)}</span><div class="muted sm">${esc(timeAgo(n.createdAt))}</div></div>
      ${v ? `<a href="#/watch/${v.id}"><img class="nthumb" src="${esc(v.poster)}" alt=""></a>` : ''}${n.type === 'system' && n.text === 'storeReady' ? `<a class="btn sm" href="#/dashboard">${esc(t('dashboard'))}</a>` : ''}</li>`;
  }));
  el.innerHTML = `${reqs.length ? `<h2 class="sec-title">${esc(t('secRequests'))} <span class="pill">${reqs.length}</span></h2><ul class="notifs">${reqs.map((u) => `<li class="notif"><a href="#/profile/${u.id}"><img class="av" src="${avatarOf(u)}" alt=""></a><div class="grow"><b>${esc(u.name)}</b> <span class="muted"><bdi>@${esc(u.username)}</bdi></span></div><button class="btn sm primary" data-acc="${u.id}">${esc(t('accept'))}</button> <button class="btn sm ghost" data-dec="${u.id}">${esc(t('decline'))}</button></li>`).join('')}</ul>` : ''}
    <div class="row-end"><button class="btn sm ghost" id="markAll">${icon('check', { size: 16 })} ${esc(t('markAll'))}</button></div>
    <ul class="notifs">${rows.join('') || emptyState(t('notifications'))}</ul>`;
  el.querySelectorAll('[data-acc],[data-dec]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; await api.respondFollowRequest(b.dataset.acc || b.dataset.dec, !!b.dataset.acc); ctx.rerender(); }));
  $('#markAll', el)?.addEventListener('click', async () => { await api.markAllRead(); await ctx.refreshMe(); el.querySelectorAll('.unread').forEach((x) => x.classList.remove('unread')); });
}

async function renderMessages(el, ctx) {
  if (!api.social) { el.innerHTML = `<p class="note">${esc(t('serverOnly'))}</p>`; return; }
  const { conversations, users } = await api.listConversations();
  const by = Object.fromEntries((users || []).map((u) => [u.id, u]));
  el.innerHTML = conversations.length
    ? `<ul class="notifs">${conversations.map((c) => {
        const u = by[c.otherId];
        return `<li class="notif ${c.unread ? 'unread' : ''}"><a class="urow grow" href="#/chat/${c.otherId}">
          <img class="av" src="${avatarOf(u)}" alt=""><span class="grow"><b>${esc(u?.name || '')}</b>
          <span class="muted">${esc(c.preview || '')}</span><span class="muted sm">${esc(timeAgo(c.lastAt))}</span></span>
          ${c.unread ? `<b class="pill">${c.unread > 9 ? '9+' : c.unread}</b>` : ''}</a></li>`;
      }).join('')}</ul>`
    : emptyState(t('noConversations'), t('noConversationsSub'));
}
