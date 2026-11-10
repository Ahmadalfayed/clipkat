// © 2026 وطن النهار — محادثة 1:1 (نص + مشاركة مقطع) مع تحديث دوري كل 4 ثوانٍ
import { api } from '../services/index.js';
import { t, timeAgo } from '../i18n.js';
import { icon, esc, $, toast, avatarOf, emptyState } from '../ui.js';
import { pageHead, openReportSheet } from './common.js';

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  if (!api.social) { el.innerHTML = `<div class="page">${pageHead(t('messages'))}${emptyState(t('serverOnly'))}</div>`; return; }
  const otherId = params.args[0];
  const other = await api.getUser(otherId);
  if (!other) { el.innerHTML = `<div class="page">${pageHead(t('messages'))}${emptyState(t('notFound'))}</div>`; return; }
  let conv = await api.getConversationWith(otherId);
  let lastId = null, timer = 0, sending = false;

  const drawMsgs = async (initial = false) => {
    if (!conv?.id) { const box = $('#msgs', el); if (box && initial) box.innerHTML = `<li class="muted center pad">${esc(t('noMessages'))}</li>`; return; }
    const r = lastId && !initial ? await api.listMessages(conv.id, { after: lastId }) : await api.listMessages(conv.id);
    const list = r.messages || [];
    if (!list.length && !initial) return;
    const box = $('#msgs', el); if (!box) return;
    const atBottom = initial || (box.scrollHeight - box.scrollTop - box.clientHeight < 80);
    if (initial) box.innerHTML = '';
    for (const m of list) {
      if (initial || !box.querySelector(`[data-mid="${m.id}"]`)) box.insertAdjacentHTML('beforeend', msgHTML(m, ctx.me, other));
    }
    if (list.length) lastId = list[list.length - 1].id;
    if (atBottom) box.scrollTop = box.scrollHeight;
    await api.readConversation(conv.id);
  };

  el.innerHTML = `<div class="page chat-page">${pageHead(other.name, { extra: `<a class="icon-btn" href="#/profile/${other.id}" aria-label="@${esc(other.username)}"><img class="av sm" src="${avatarOf(other)}" alt=""></a>` })}
    <ul class="msgs" id="msgs"></ul>
    <form class="chat-form" id="cf">
      <button type="button" class="icon-btn" id="shareClip" aria-label="${esc(t('shareClip'))}">${icon('play', { size: 20 })}</button>
      <input name="text" maxlength="500" autocomplete="off" placeholder="${esc(t('messagePh'))}" aria-label="${esc(t('messages'))}">
      <button class="btn primary sm" type="submit">${esc(t('send'))}</button>
    </form>
  </div>`;
  await drawMsgs(true);

  const send = async (body) => {
    if (sending) return; sending = true;
    try {
      const r = await api.sendMessage(otherId, body);
      conv = { id: r.conversationId };
      await drawMsgs(true);
    } catch (e) {
      toast(t(e.message === 'blocked' ? 'blocked' : e.message === 'messagesOff' ? 'messagesOff' : e.message === 'followersOnly' ? 'msgFollowersOnly' : e.message === 'mutualOnly' ? 'msgMutualOnly' : e.message === 'private' ? 'privateProfile' : e.message), 'warn');
    } finally { sending = false; }
  };

  $('#cf', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const inp = $('input[name=text]', el); const text = inp.value.trim(); if (!text) return;
    inp.value = ''; await send({ type: 'text', text });
  });
  $('#shareClip', el).addEventListener('click', async () => {
    const mine = await api.listVideos({ userId: ctx.me.id });
    const body = document.createElement('div');
    body.innerHTML = mine.length
      ? `<ul class="share-clips">${mine.slice(0, 24).map((v) => `<li><button type="button" class="urow" data-vid="${v.id}"><img class="av sq" src="${esc(v.poster || '')}" alt=""><span class="grow">${esc(v.caption || t('videos'))}</span></button></li>`).join('')}</ul>`
      : emptyState(t('noVideos'));
    const { openSheet } = await import('../ui.js');
    const sh = openSheet({ title: t('shareClip'), body });
    body.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-vid]')?.dataset.vid; if (!id) return; sh.close(); await send({ type: 'clip', videoId: id });
    });
  });
  $('#msgs', el).addEventListener('click', async (e) => {
    const mid = e.target.closest('[data-mid]')?.dataset.mid;
    if (e.target.dataset.act === 'del' && mid && confirm(t('deleteMessage') + '?')) { await api.deleteMessage(mid); const li = e.target.closest('[data-mid]'); if (li) li.outerHTML = msgHTML({ id: mid, senderId: ctx.me.id, type: 'text', text: '', deleted: true, createdAt: Date.now() }, ctx.me, other); }
    if (e.target.dataset.act === 'report' && mid) openReportSheet('message', mid);
  });

  timer = setInterval(() => drawMsgs(false), 4000);
  return () => clearInterval(timer);
}

function msgHTML(m, me, other) {
  const mine = m.senderId === me.id;
  if (m.deleted) return `<li class="msg ${mine ? 'mine' : ''} deleted" data-mid="${m.id}"><span class="muted sm">${esc(t('messageDeleted'))}</span></li>`;
  const clip = m.type === 'clip' && m.videoId
    ? `<a class="msg-clip" href="#/watch/${m.videoId}"><span>${esc(t('sharedClip'))}</span></a>`
    : (m.type === 'clip' ? `<span class="muted">${esc(t('clipUnavailable'))}</span>` : '');
  const acts = mine
    ? `<button type="button" class="linkbtn" data-act="del">${esc(t('deleteMessage'))}</button>`
    : `<button type="button" class="linkbtn" data-act="report">${esc(t('report'))}</button>`;
  return `<li class="msg ${mine ? 'mine' : ''}" data-mid="${m.id}">
    ${mine ? '' : `<img class="av sm" src="${avatarOf(other)}" alt="">`}
    <div class="bubble"><p>${esc(m.text)}</p>${clip}<div class="muted sm">${esc(timeAgo(m.createdAt))} ${acts}</div></div>
  </li>`;
}
