import { t } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// أيقونات SVG مرسومة يدوياً (بدون مكتبات أو خطوط إيموجي)
const P = {
  gift: '<path d="M3 8h18v4H3z"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M12 8S11 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13.5h2"/>',
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  store: '<path d="M4 9h16l-1.2-4.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-1 .8z"/><path d="M5 9v11h14V9"/><path d="M9.5 20v-5h5v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M4 4h16v16H4z" /><path d="M4 14h5l1 2h4l1-2h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2.1 0 3.7 1.2 5 3 1.3-1.8 2.9-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z"/>',
  share: '<path d="M14 5l7 7-7 7v-4c-5 0-8 1.5-10 5 0-6 3-10 10-11z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  volOff: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 4 6M21 9l-4 6"/>',
  volOn: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  verified: '<path d="M12 2.5l2.4 1.8 3-.2.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3-.2L12 21.5l-2.4-1.8-3 .2-.9-2.9-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.9 3 .2z"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke="#fff"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/>',
  phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  phoneDown: '<path d="M3 15.5c5-4.6 13-4.6 18 0l-2.2 2.6-3.5-1.4v-2.4a12 12 0 0 0-6.6 0v2.4l-3.5 1.4z"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10.5 6-3.5v10l-6-3.5z"/>',
  videoOff: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10.5 6-3.5v10l-6-3.5zM3 3l18 18"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>',
  flip: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
};
const FILLED = new Set(['heart', 'bookmark', 'play', 'verified', 'star']);
export function icon(name, { size = 24, fill = false, cls = '' } = {}) {
  const f = fill && FILLED.has(name);
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

// شعار كليب كات: رأس قطة بأذنين + زر تشغيل (تصميم أصلي)
let lid = 0;
export function logoMark(size = 32) {
  const id = 'lg' + (++lid);
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12c2a0"/><stop offset="1" stop-color="#f5a524"/></linearGradient></defs><path d="M12 22 L14 6 L26 16 Q32 14.5 38 16 L50 6 L52 22 Q56 28 56 36 Q56 58 32 58 Q8 58 8 36 Q8 28 12 22Z" fill="url(#${id})"/><path d="M27 27 L42 36 L27 45Z" fill="#0b1020" stroke="#0b1020" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

// ===== صور مولّدة (SVG) =====
const svgUrl = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const PALS = [['#12c2a0', '#0e7c86'], ['#f5a524', '#e4572e'], ['#6c5ce7', '#00b4d8'], ['#ff6b9a', '#ffb86b'], ['#2ec4b6', '#cbf3f0'], ['#3a86ff', '#8338ec'], ['#06d6a0', '#118ab2'], ['#ffd166', '#ef476f']];
export function genAvatar(seed, initial = '') {
  const h = hash(seed), [a, b] = PALS[h % PALS.length], rot = h % 360;
  const shapes = Array.from({ length: 3 }, (_, i) => { const x = 20 + ((h >>> (i * 5)) % 60), y = 20 + ((h >>> (i * 7)) % 60), r = 10 + ((h >>> (i * 3)) % 18); return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.12 + i * 0.06}"/>`; }).join('');
  const ch = esc(String(initial).slice(0, 1).toUpperCase());
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" gradientTransform="rotate(${rot} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${shapes}<text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="44" fill="#fff">${ch}</text></svg>`);
}
const PRODUCT_SHAPES = {
  bottle: (c) => `<rect x="42" y="18" width="16" height="14" rx="3" fill="#333"/><rect x="30" y="32" width="40" height="52" rx="12" fill="${c}"/><rect x="38" y="48" width="24" height="16" rx="3" fill="#fff" opacity=".7"/>`,
  cup: (c) => `<path d="M26 34h44l-6 46H32z" fill="${c}"/><path d="M70 42h6a8 8 0 0 1 0 16h-8" fill="none" stroke="${c}" stroke-width="5"/><path d="M38 22c0-6 6-6 6-12M50 22c0-6 6-6 6-12" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>`,
  bag: (c) => `<path d="M24 36h52l-4 48H28z" fill="${c}"/><path d="M38 36v-6a12 12 0 0 1 24 0v6" fill="none" stroke="#333" stroke-width="4"/>`,
  box: (c) => `<path d="M20 36 50 22l30 14v32L50 84 20 68z" fill="${c}"/><path d="M20 36l30 14 30-14M50 50v34" stroke="#fff" stroke-width="2" opacity=".6" fill="none"/>`,
  brush: (c) => `<rect x="46" y="14" width="8" height="46" rx="3" fill="#8d6e63"/><path d="M42 60h16l-2 20q-6 8-12 0z" fill="${c}"/>`,
  shirt: (c) => `<path d="M34 18 20 28l8 12 6-4v46h32V36l6 4 8-12-14-10q-6 8-16 8t-16-8z" fill="${c}"/>`,
  game: (c) => `<rect x="18" y="34" width="64" height="34" rx="16" fill="${c}"/><path d="M34 44v14M27 51h14" stroke="#fff" stroke-width="4"/><circle cx="62" cy="47" r="4" fill="#fff"/><circle cx="70" cy="55" r="4" fill="#fff"/>`,
  jar: (c) => `<rect x="32" y="22" width="36" height="10" rx="3" fill="#555"/><rect x="28" y="32" width="44" height="50" rx="10" fill="${c}"/>`
};
export function genProductImage(shape, seed) {
  const h = hash(seed), [a, b] = PALS[h % PALS.length], c = PALS[(h >>> 3) % PALS.length][0];
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}" stop-opacity=".35"/><stop offset="1" stop-color="${b}" stop-opacity=".55"/></linearGradient></defs><rect width="100" height="100" fill="#f4f1ea"/><rect width="100" height="100" fill="url(#g)"/><ellipse cx="50" cy="88" rx="30" ry="4" fill="#000" opacity=".12"/>${(PRODUCT_SHAPES[shape] || PRODUCT_SHAPES.box)(c)}</svg>`);
}
export function genBanner(seed) {
  const h = hash(seed), [a, b] = PALS[h % PALS.length], [c] = PALS[(h >>> 4) % PALS.length];
  const waves = Array.from({ length: 4 }, (_, i) => `<path d="M0 ${60 + i * 18} Q 100 ${30 + i * 20 + (h % 20)} 200 ${60 + i * 16} T 400 ${58 + i * 18} V 160 H 0z" fill="#fff" opacity="${0.06 + i * 0.04}"/>`).join('');
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="400" height="160" fill="url(#g)"/>${waves}</svg>`);
}
export const DEFAULT_BANNER = genBanner('default-ck');

// تصغير صورة مختارة إلى dataURL
export function fileToDataURL(file, max = 512) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

// ===== إشعارات منبثقة =====
export function toast(msg, kind = '') {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; box.append(el);
  setTimeout(() => el.classList.add('out'), 2200); setTimeout(() => el.remove(), 2600);
}

// ===== لوحة سفلية (Bottom sheet) =====
export function openSheet({ title, body, onClose, cls = '' }) {
  const prevFocus = document.activeElement;
  const wrap = document.createElement('div'); wrap.className = 'sheet-wrap ' + cls;
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-grip" aria-hidden="true"></div><header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${esc(t('close'))}">${icon('close', { size: 20 })}</button></header><div class="sheet-body"></div></div>`;
  const bodyEl = $('.sheet-body', wrap); if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  document.body.append(wrap); requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => { wrap.classList.remove('open'); document.removeEventListener('keydown', onKey); setTimeout(() => wrap.remove(), 260); onClose?.(); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  setTimeout(() => ($('input,textarea,button:not([data-close])', bodyEl) || $('.sheet', wrap)).focus?.(), 50);
  return { el: wrap, body: bodyEl, close };
}

export function emptyState(title, sub = '', action = '') {
  return `<div class="empty">${logoMark(56)}<h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}${action}</div>`;
}

// ===== صور الكيانات (مع بدائل مولّدة) =====
export const avatarOf = (u) => u?.avatar || genAvatar(u?.id || 'x', (u?.username || '?')[0]);
export const productImg = (p) => { const im = p?.image; if (im && im.startsWith('gen:')) { const [, shape, seed] = im.split(':'); return genProductImage(shape, seed); } return im || genProductImage('box', p?.id || 'x'); };
export const storeLogo = (s) => s?.logo || genProductImage(s?.logoShape || 'bag', 'logo' + s?.id);
export const storeBanner = (s) => s?.banner || genBanner(s?.id || 'x');
export const verifiedBadge = (title) => `<span class="vbadge" title="${esc(title)}" aria-label="${esc(title)}">${icon('verified', { size: 16, fill: true })}</span>`;
