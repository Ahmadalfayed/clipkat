import { api } from '../services/index.js';
import { t, timeAgo } from '../i18n.js';
import { icon, esc, $, avatarOf, logoMark, emptyState } from '../ui.js';
import { pageHead } from './common.js';

const MOCK_THREADS = [
  { from: 'u_noura', ar: 'شكراً على الطلب! الشحن خلال يومين', en: 'Thanks for your order! Shipping in 2 days', h: 1 },
  { from: 'u_fahad', ar: 'تبي الحبوب مطحونة أو حبوب كاملة؟', en: 'Ground or whole beans?', h: 5 },
  { from: 'u_khaled', ar: 'جرب الإعداد اللي قلت لك عليه', en: 'Try the setting I told you about', h: 26 }
];

export async function render(el, params, ctx) {
  if (!(await ctx.requireLogin())) return;
  const tab = params.query.get('tab') || 'n';
  const list = await api.listNotifications();
  const { lang } = await import('../i18n.js');
  const rows = await Promise.all(list.map(async (n) => {
    const from = n.fromId ? await api.getUser(n.fromId) : null;
    const v = n.videoId ? await api.getVideo(n.videoId) : null;
    let text;
    if (n.type === 'system') text = n.text === 'welcome' ? t('welcome') : n.text === 'storeReady' ? `${t('myStore')}: ${t('active')}` : n.text;
    else text = t('n_' + n.type, { text: n.text || '' });
    return `<li class="notif ${n.read ? '' : 'unread'}">${from ? `<a href="#/profile/${from.id}"><img class="av" src="${avatarOf(from)}" alt=""></a>` : `<span class="av sys">${logoMark(30)}</span>`}
      <div class="grow">${from ? `<b>${esc(from.name)}</b> ` : ''}<span>${esc(text)}</span><div class="muted sm">${esc(timeAgo(n.createdAt))}</div></div>
      ${v ? `<a href="#/watch/${v.id}"><img class="nthumb" src="${esc(v.poster)}" alt=""></a>` : ''}${n.type === 'system' && n.text === 'storeReady' ? `<a class="btn sm" href="#/dashboard">${esc(t('dashboard'))}</a>` : ''}</li>`;
  }));
  const threads = await Promise.all(MOCK_THREADS.map(async (m) => { const u = await api.getUser(m.from); return `<li class="notif"><img class="av" src="${avatarOf(u)}" alt=""><div class="grow"><b>${esc(u.name)}</b><div class="muted">${esc(m[lang])}</div></div><span class="muted sm">${esc(timeAgo(Date.now() - m.h * 3600000))}</span></li>`; }));
  el.innerHTML = `<div class="page">${pageHead(t('inbox'), { back: false })}
    <div class="seg" role="tablist"><a role="tab" href="#/inbox?tab=n" aria-selected="${tab === 'n'}" class="${tab === 'n' ? 'on' : ''}">${esc(t('notifications'))}</a><a role="tab" href="#/inbox?tab=m" aria-selected="${tab === 'm'}" class="${tab === 'm' ? 'on' : ''}">${esc(t('messages'))}</a></div>
    ${tab === 'n' ? `<div class="row-end"><button class="btn sm ghost" id="markAll">${icon('check', { size: 16 })} ${esc(t('markAll'))}</button></div><ul class="notifs">${rows.join('') || emptyState(t('notifications'))}</ul>`
      : `<p class="note">${esc(t('mockInbox'))}</p><ul class="notifs">${threads.join('')}</ul>`}
  </div>`;
  $('#markAll', el)?.addEventListener('click', async () => { await api.markAllRead(); await ctx.refreshMe(); el.querySelectorAll('.unread').forEach((x) => x.classList.remove('unread')); });
}
