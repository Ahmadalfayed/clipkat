import { api } from './services/index.js';
import { t, setLang, lang, brandName } from './i18n.js';
import { BRAND } from './config.js';
import { icon, logoMark, toast, $, esc } from './ui.js';

const routes = {
  feed: () => import('./views/feed.js'), following: () => import('./views/feed.js'), watch: () => import('./views/feed.js'),
  discover: () => import('./views/discover.js'), tag: () => import('./views/discover.js'),
  upload: () => import('./views/studio.js'), inbox: () => import('./views/inbox.js'),
  sound: () => import('./views/sound.js'), sounds: () => import('./views/sound.js'),
  chat: () => import('./views/chat.js'), drafts: () => import('./views/drafts.js'),
  profile: () => import('./views/profile.js'), me: () => import('./views/profile.js'), login: () => import('./views/auth.js'),
  stores: () => import('./views/stores.js'), store: () => import('./views/stores.js'), rent: () => import('./views/stores.js'),
  checkout: () => import('./views/checkout.js'), dashboard: () => import('./views/dashboard.js'), admin: () => import('./views/admin.js'), settings: () => import('./views/settings.js'), policy: () => import('./views/policy.js')
};
const IMMERSIVE = new Set(['feed', 'following', 'watch']);
const NAV = [['feed', 'home', 'home'], ['stores', 'store', 'stores'], ['upload', 'plus', 'create'], ['inbox', 'inbox', 'inbox'], ['me', 'user', 'me']];

let cleanup = null, renderId = 0;
export const ctx = {
  me: null,
  navigate: (h) => { location.hash = h; },
  async requireLogin() { if (!ctx.me) { toast(t('loginRequired')); ctx.navigate('#/login?next=' + encodeURIComponent(location.hash)); return false; } return true; },
  async refreshMe() { ctx.me = await api.currentUser(); await renderNav(); },
  rerender: () => route()
};

export function setTheme(th) { document.documentElement.dataset.theme = th; localStorage.setItem('ck:theme', th); document.querySelector('meta[name=theme-color]')?.setAttribute('content', th === 'dark' ? '#0b1020' : '#f7f5f0'); }
export const theme = () => document.documentElement.dataset.theme;
export function toggleTheme() { setTheme(theme() === 'dark' ? 'light' : 'dark'); }
export function toggleLang() { setLang(lang === 'ar' ? 'en' : 'ar'); document.title = `${brandName()} — ${t('prototype')}`; route(); }
export function prefsButtons() {
  return `<button class="icon-btn" data-act="lang" aria-label="${esc(t('language'))}: ${lang === 'ar' ? 'English' : 'العربية'}"><span class="lang-txt">${lang === 'ar' ? 'EN' : 'ع'}</span></button>
  <button class="icon-btn" data-act="theme" aria-label="${esc(t('theme'))}">${icon(theme() === 'dark' ? 'sun' : 'moon', { size: 20 })}</button>`;
}
export const brandHTML = (size = 28) => `<span class="brand">${logoMark(size)}<span class="brand-name">${esc(brandName())}</span></span>`;

function renderDemoNotice() {
  let el = document.getElementById('demoNotice');
  const app = $('#app');
  if (sessionStorage.getItem('ck:noticeHidden')) { el?.remove(); app?.classList.remove('has-demo'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'demoNotice'; el.setAttribute('role', 'note'); app.append(el); }
  app.classList.add('has-demo');
  el.innerHTML = `<span>${esc(t(api.mode !== 'local' ? 'demoNoticeCloud' : 'demoNotice'))}</span><button type="button" aria-label="${esc(t('hideNotice'))}">${icon('close', { size: 12 })}</button>`;
  el.querySelector('button').onclick = () => { sessionStorage.setItem('ck:noticeHidden', '1'); el.remove(); app.classList.remove('has-demo'); };
}

async function renderNav() {
  const nav = $('#nav'); const cur = (location.hash.slice(2).split(/[/?]/)[0]) || 'feed';
  const unread = ctx.me ? await api.unreadCount() : 0;
  nav.innerHTML = NAV.map(([r, ic, label]) => {
    const active = cur === r || (r === 'feed' && (cur === 'following')) || (r === 'me' && cur === 'profile' && location.hash.includes(ctx.me?.id || '#')) || (r === 'stores' && ['store', 'rent', 'checkout', 'dashboard'].includes(cur)) || (r === 'inbox' && cur === 'chat');
    if (r === 'upload') return `<a href="#/upload" class="nav-plus" aria-label="${esc(t(label))}">${icon('plus', { size: 26 })}</a>`;
    return `<a href="#/${r}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${icon(ic, { size: 24 })}<span>${esc(t(label))}</span>${r === 'inbox' && unread ? `<b class="dot" aria-label="${unread}">${unread > 9 ? '9+' : unread}</b>` : ''}</a>`;
  }).join('');
}

async function route() {
  const id = ++renderId;
  const raw = location.hash.slice(2) || 'feed';
  const [path, qs] = raw.split('?');
  const [name, ...rest] = path.split('/');
  const params = { name, args: rest.map(decodeURIComponent), query: new URLSearchParams(qs || '') };
  const loader = routes[name];
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  const app = $('#app'); app.classList.toggle('immersive', IMMERSIVE.has(name));
  const view = $('#view'); view.innerHTML = '<div class="loading" aria-busy="true"><span class="spinner"></span></div>'; view.scrollTop = 0; window.scrollTo(0, 0);
  ctx.me = await api.currentUser();
  await renderNav(); renderDemoNotice();
  if (!loader) { view.innerHTML = `<div class="page"><p class="empty">${esc(t('notFound'))}</p></div>`; return; }
  const mod = await loader();
  if (id !== renderId) return;
  const el = document.createElement('div'); el.className = 'view-inner';
  view.innerHTML = ''; view.append(el);
  cleanup = (await mod.render(el, params, ctx)) || null;
  el.querySelector('h1')?.setAttribute('tabindex', '-1');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'theme') { toggleTheme(); b.innerHTML = icon(theme() === 'dark' ? 'sun' : 'moon', { size: 20 }); }
  if (b.dataset.act === 'lang') toggleLang();
  if (b.dataset.act === 'back') { history.length > 1 ? history.back() : ctx.navigate('#/feed'); }
});

(async function boot() {
  setLang(lang); setTheme(localStorage.getItem('ck:theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  document.title = `${brandName()} — ${t('prototype')}`;
  window.addEventListener('hashchange', route);
  await api.init();
  if (!location.hash) location.replace('#/feed');
  await route();
  window.__CK_READY = true;
})().catch((e) => { console.error(e); $('#view').innerHTML = `<p class="empty">Error: ${esc(e.message)}</p>`; });
