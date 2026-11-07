import { api } from '../services/index.js';
import { t, fmtNum, fmtKWD, timeAgo, lang } from '../i18n.js';
import { icon, esc, $, $$, toast, openSheet, avatarOf, productImg, emptyState, verifiedBadge } from '../ui.js';
import { prefsButtons, brandHTML } from '../app.js';
import { openReportSheet, confirmBlock } from './common.js';
import { POLICY } from '../policy-text.js';

let muted = true; // يبدأ صامتاً (سياسة التشغيل التلقائي في المتصفحات)

const linkify = (s) => esc(s).replace(/#([\p{L}\p{N}_]+)/gu, (m, tag) => `<a href="#/tag/${encodeURIComponent(tag)}" class="htag">#${tag}</a>`);

export async function render(el, params, ctx) {
  const mode = params.name;
  let videos = [];
  if (mode === 'watch') {
    const v = await api.getVideo(params.args[0]);
    if (v) { const list = params.query.get('from') === 'tag' ? await api.listVideos({ tag: params.query.get('tag') }) : await api.listVideos({ userId: v.userId }); const i = list.findIndex((x) => x.id === v.id); videos = [...list.slice(i), ...list.slice(0, i)]; }
  } else videos = await api.listVideos({ tab: mode === 'following' ? 'following' : 'foryou' });

  const top = mode === 'watch'
    ? `<div class="feed-top"><button class="icon-btn glass" data-act="back" aria-label="${esc(t('back'))}">${icon('back', { size: 22, cls: 'flip-rtl' })}</button><span></span><span></span></div>`
    : `<div class="feed-top">
        <div class="feed-brand">${brandHTML(26)}</div>
        <nav class="feed-tabs" aria-label="${esc(t('home'))}">
          <a href="#/following" class="${mode === 'following' ? 'on' : ''}" ${mode === 'following' ? 'aria-current="page"' : ''}>${esc(t('following'))}</a>
          <a href="#/feed" class="${mode === 'feed' ? 'on' : ''}" ${mode === 'feed' ? 'aria-current="page"' : ''}>${esc(t('forYou'))}</a>
        </nav>
        <div class="feed-tools"><a class="icon-btn glass" href="#/discover" aria-label="${esc(t('search'))}">${icon('search', { size: 20 })}</a>${prefsButtons()}</div>
      </div>`;

  if (!videos.length) {
    const body = mode === 'watch' ? emptyState(t('notFound'), api.social ? t('privateProfileSub') : '', `<a class="btn primary" href="#/feed">${esc(t('home'))}</a>`)
      : mode === 'following' && !ctx.me
      ? emptyState(t('loginRequired'), t('emptyFollowingSub'), `<a class="btn primary" href="#/login?next=%23%2Ffollowing">${esc(t('login'))}</a>`)
      : emptyState(t('emptyFollowing'), t('emptyFollowingSub'), `<a class="btn primary" href="#/discover">${esc(t('goDiscover'))}</a>`);
    el.innerHTML = `${top}<div class="feed-empty">${body}</div>`;
    return;
  }

  const slides = await Promise.all(videos.map(async (v) => {
    const [user, stats, products] = await Promise.all([api.getUser(v.userId), api.videoStats(v), api.productsByIds(v.productIds)]);
    const following = ctx.me ? await api.isFollowing(ctx.me.id, v.userId) : false;
    const store = products.length ? await api.getStore(products[0].storeId) : null;
    return { v, user, stats, products, following, store };
  }));

  el.innerHTML = `${top}<div class="feed" id="feed" tabindex="0" aria-label="${esc(t('forYou'))}">${slides.map(slideHTML).join('')}</div>
    <div class="feed-arrows"><button class="icon-btn glass" data-dir="-1" aria-label="↑">${icon('back', { size: 20, cls: 'rot-up' })}</button><button class="icon-btn glass" data-dir="1" aria-label="↓">${icon('back', { size: 20, cls: 'rot-down' })}</button></div>`;
  const feed = $('#feed', el);
  const byId = new Map(slides.map((s) => [s.v.id, s]));

  // تحميل كسول للفيديو + تشغيل/إيقاف حسب الظهور
  const slideEls = $$('.slide', feed);
  async function ensureSrc(sl) { if (!sl) return; const vEl = $('video', sl); if (!vEl.dataset.loaded) { vEl.dataset.loaded = '1'; vEl.src = await api.videoURL(byId.get(sl.dataset.id).v); } }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const sl = en.target, vEl = $('video', sl);
      if (en.isIntersecting && en.intersectionRatio >= 0.6) {
        sl.classList.add('active');
        ensureSrc(sl).then(() => { vEl.muted = muted; vEl.play().catch(() => {}); });
        const i = slideEls.indexOf(sl); ensureSrc(slideEls[i + 1]); ensureSrc(slideEls[i - 1]);
        sl.querySelector('.mute-hint')?.classList.toggle('show', muted);
      } else { sl.classList.remove('active'); vEl.pause(); }
    }
  }, { root: feed, threshold: [0, 0.6, 1] });
  slideEls.forEach((s) => io.observe(s));

  for (const sl of slideEls) {
    const vEl = $('video', sl), bar = $('.progress i', sl);
    vEl.addEventListener('timeupdate', () => { if (vEl.duration) bar.style.width = (vEl.currentTime / vEl.duration) * 100 + '%'; });
  }

  // نقرة: تشغيل الصوت / إيقاف مؤقت — نقرتان: إعجاب
  let lastTap = 0, tapTimer;
  feed.addEventListener('click', async (e) => {
    const sl = e.target.closest('.slide'); if (!sl) return;
    const s = byId.get(sl.dataset.id);
    const btn = e.target.closest('[data-a]');
    if (btn) { e.preventDefault(); return action(btn.dataset.a, s, sl, btn); }
    if (!e.target.closest('.tap-layer')) return;
    const now = Date.now();
    if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; heartBurst(sl, e); if (await ctx.requireLogin()) { await api.setLike(s.v.id); await refreshStats(s, sl); } return; }
    lastTap = now;
    tapTimer = setTimeout(() => singleTap(sl), 300);
  });
  function singleTap(sl) {
    const vEl = $('video', sl);
    if (muted) { muted = false; $$('video', feed).forEach((x) => (x.muted = false)); vEl.play().catch(() => {}); $$('.mute-hint', feed).forEach((h) => h.classList.remove('show')); flash(sl, 'volOn'); updateMuteBtns(); return; }
    if (vEl.paused) { vEl.play().catch(() => {}); flash(sl, 'play'); } else { vEl.pause(); flash(sl, 'pause'); }
  }
  function updateMuteBtns() { $$('[data-a=mute]', feed).forEach((b) => { b.innerHTML = icon(muted ? 'volOff' : 'volOn', { size: 20 }); b.setAttribute('aria-pressed', String(!muted)); }); }
  function flash(sl, kind) {
    const f = $('.flash', sl); f.innerHTML = kind === 'pause' ? `<svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>` : icon(kind, { size: 64, fill: true });
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    f.setAttribute('aria-label', kind === 'pause' ? t('paused') : '');
  }
  function heartBurst(sl, e) {
    const r = sl.getBoundingClientRect(); const h = document.createElement('div'); h.className = 'burst';
    h.style.left = (e.clientX - r.left) + 'px'; h.style.top = (e.clientY - r.top) + 'px';
    h.style.setProperty('--rot', (Math.random() * 30 - 15) + 'deg');
    h.innerHTML = icon('heart', { size: 96, fill: true }); sl.append(h); setTimeout(() => h.remove(), 900);
  }
  async function refreshStats(s, sl) {
    s.stats = await api.videoStats(s.v);
    const like = $('[data-a=like]', sl); like.classList.toggle('on', s.stats.liked); like.setAttribute('aria-pressed', String(s.stats.liked));
    like.querySelector('.ic').outerHTML = icon('heart', { size: 30, fill: s.stats.liked }); $('.n-like', sl).textContent = fmtNum(s.stats.likes);
    const save = $('[data-a=save]', sl); save.classList.toggle('on', s.stats.saved); save.setAttribute('aria-pressed', String(s.stats.saved));
    save.querySelector('.ic').outerHTML = icon('bookmark', { size: 28, fill: s.stats.saved }); $('.n-save', sl).textContent = fmtNum(s.stats.saves);
    $('.n-comment', sl).textContent = fmtNum(s.stats.comments); $('.n-share', sl).textContent = fmtNum(s.stats.shares);
  }

  async function action(a, s, sl, btn) {
    if (a === 'mute') { muted = !muted; $$('video', feed).forEach((x) => (x.muted = muted)); $$('.mute-hint', feed).forEach((h) => h.classList.remove('show')); updateMuteBtns(); return; }
    if (a === 'share') return share(s, sl);
    if (a === 'comments') return openComments(s, sl);
    if (a === 'products') return openProducts(s);
    if (a === 'more') return openMore(s);
    if (!(await ctx.requireLogin())) return;
    if (a === 'like') { const on = await api.toggleLike(s.v.id); if (on) btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 400); await refreshStats(s, sl); }
    if (a === 'save') { const on = await api.toggleSave(s.v.id); toast(on ? t('saved_ok') : t('removed')); await refreshStats(s, sl); }
    if (a === 'follow') {
      const on = await api.toggleFollow(s.v.userId);
      if (api.lastFollow?.requested) { toast(t('requestSent'), 'ok'); return; }
      $$(`.slide[data-user="${s.v.userId}"] [data-a=follow]`, feed).forEach((b) => { b.classList.toggle('done', on); b.innerHTML = icon(on ? 'check' : 'plus', { size: 14 }); b.setAttribute('aria-label', on ? t('unfollow') : t('follow')); });
      toast(on ? `${t('followingBtn')} @${s.user.username}` : t('unfollow'));
    }
  }
  async function share(s, sl) {
    const url = location.href.split('#')[0] + '#/watch/' + s.v.id;
    await api.recordShare(s.v.id); await refreshStats(s, sl);
    try { if (navigator.share) { await navigator.share({ title: s.v.caption, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); } catch { /* المتصفح قد يمنع الحافظة */ }
    toast(t('linkCopied'));
  }
  async function openMore(s) {
    const own = ctx.me?.id === s.v.userId;
    const sh = openSheet({ title: t('more'), body: `<div class="menu-list">
      <button class="btn block ghost" data-m="copy">${esc(t('copyLink'))}</button>
      ${api.social && !own ? `<button class="btn block ghost" data-m="report">${esc(t('reportVideo'))}</button><button class="btn block ghost bad" data-m="block">${esc(t('block'))} @${esc(s.user?.username)}</button>` : ''}</div>` });
    sh.body.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return; sh.close();
      if (m === 'copy') { try { await navigator.clipboard.writeText(location.href.split('#')[0] + '#/watch/' + s.v.id); } catch {} toast(t('linkCopied')); return; }
      if (!(await ctx.requireLogin())) return;
      if (m === 'report') openReportSheet('video', s.v.id);
      if (m === 'block' && (await confirmBlock(s.user))) ctx.rerender();
    });
  }
  async function openComments(s, sl) {
    const body = document.createElement('div'); body.className = 'comments';
    let replyTo = null;
    const cmtHTML = (c, u, isReply) => {
      const mine = ctx.me && (ctx.me.id === c.userId || ctx.me.id === s.v.userId || ctx.me.role === 'admin');
      return `<li class="cmt ${isReply ? 'reply' : ''}" data-cid="${c.id}"><img src="${avatarOf(u)}" alt="" class="av sm"><div class="grow"><b>${esc(u?.name)}</b> <span class="muted">· ${esc(timeAgo(c.createdAt))}</span><p>${esc(c.text)}</p>
        ${api.social ? `<div class="cmt-acts"><button class="linkbtn" data-c="reply" data-u="${esc(u?.username)}">${esc(t('reply'))}</button>${mine ? `<button class="linkbtn" data-c="del">${esc(t('deleteComment'))}</button>` : ''}${ctx.me && ctx.me.id !== c.userId ? `<button class="linkbtn" data-c="report">${esc(t('report'))}</button>` : ''}</div>` : ''}</div></li>`;
    };
    const draw = async () => {
      const list = await api.listComments(s.v.id);
      const users = new Map(await Promise.all([...new Set(list.map((c) => c.userId))].map(async (id) => [id, await api.getUser(id)])));
      const roots = list.filter((c) => !c.parentId || !list.some((p) => p.id === c.parentId));
      const rows = roots.map((c) => cmtHTML(c, users.get(c.userId), false) + list.filter((r) => r.parentId === c.id).sort((a, b) => a.createdAt - b.createdAt).map((r) => cmtHTML(r, users.get(r.userId), true)).join(''));
      $('ul', body).innerHTML = rows.join('') || `<li class="muted center pad">${esc(t('noComments'))}</li>`;
      const meta = api.commentMeta?.[s.v.id];
      const form = $('form', body), note = $('.cmt-note', body);
      const blockedMsg = meta && ctx.me && !meta.canComment ? t(meta.policy === 'nobody' ? 'commentsOff' : 'followersOnly') : '';
      form.hidden = !!blockedMsg; note.hidden = !blockedMsg; note.textContent = blockedMsg;
    };
    body.innerHTML = `<ul class="cmt-list" aria-live="polite"></ul><p class="note cmt-note" hidden></p><div class="reply-bar" hidden><span></span><button class="linkbtn" type="button" data-c="cancel">${esc(t('cancel'))}</button></div><form class="cmt-form"><img src="${avatarOf(ctx.me)}" alt="" class="av sm"><input name="text" maxlength="300" autocomplete="off" placeholder="${esc(t('addComment'))}" aria-label="${esc(t('addComment'))}"><button class="btn primary sm" type="submit">${esc(t('send'))}</button></form>`;
    const sh = openSheet({ title: `${t('comments')} (${fmtNum(s.stats.comments)})`, body, cls: 'comments-sheet' });
    const setReply = (r) => { replyTo = r; const bar = $('.reply-bar', body); bar.hidden = !r; if (r) { $('span', bar).textContent = t('replyingTo', { u: r.u }); $('input', body).focus(); } };
    const refreshHead = async () => { await refreshStats(s, sl); $('.sheet-head h2', sh.el).textContent = `${t('comments')} (${fmtNum(s.stats.comments)})`; };
    await draw();
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      if (b.dataset.c === 'cancel') return setReply(null);
      if (!(await ctx.requireLogin())) { sh.close(); return; }
      const cid = b.closest('[data-cid]')?.dataset.cid;
      if (b.dataset.c === 'reply') setReply({ id: cid, u: b.dataset.u });
      if (b.dataset.c === 'report') openReportSheet('comment', cid);
      if (b.dataset.c === 'del' && confirm(t('deleteComment') + '?')) { await api.deleteComment(cid, s.v.id); toast(t('deleted')); await draw(); await refreshHead(); }
    });
    $('form', body).addEventListener('submit', async (e) => {
      e.preventDefault(); if (!(await ctx.requireLogin())) { sh.close(); return; }
      const inp = $('input', body); const txt = inp.value.trim(); if (!txt) return;
      try { await api.addComment(s.v.id, txt, replyTo?.id || null); } catch (err) { toast(t(err.message), 'warn'); return; }
      inp.value = ''; setReply(null); await draw(); await refreshHead();
    });
  }
  async function openProducts(s) {
    const st = s.store;
    const body = `<ul class="prod-list">${s.products.map((p) => `<li class="prod-row"><img src="${productImg(p)}" alt="" class="pimg"><div class="grow"><b>${esc(p.name)}</b><div class="price">${esc(fmtKWD(p.price))}</div><div class="muted sm">${p.stock > 0 ? esc(t('inStock', { n: p.stock })) : `<span class="bad">${esc(t('outOfStock'))}</span>`}</div></div>${st?.contact && p.stock > 0 ? `<a class="btn primary sm" href="${esc(st.contact)}" target="_blank" rel="noopener">${esc(t('buy'))}</a>` : ''}</li>`).join('')}</ul>
      <p class="buyer-note" role="note">${esc(POLICY.buyerNotice)} <a href="#/policy" data-close>سياسة المتاجر</a></p>
      ${st ? `<a class="btn ghost block" href="#/store/${st.id}" data-close>${icon('store', { size: 18 })} ${esc(t('visitStore'))}: ${esc(st.name)}</a>` : ''}`;
    openSheet({ title: t('taggedProducts'), body });
  }

  // لوحة المفاتيح + أزرار سطح المكتب
  const step = (d) => feed.scrollBy({ top: d * feed.clientHeight, behavior: 'smooth' });
  el.querySelector('.feed-arrows').addEventListener('click', (e) => { const b = e.target.closest('[data-dir]'); if (b) step(+b.dataset.dir); });
  const onKey = (e) => {
    if (document.querySelector('.sheet-wrap') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    if (e.key === ' ' || e.key === 'k') { const sl = $('.slide.active', feed); if (sl) { e.preventDefault(); singleTap(sl); } }
  };
  document.addEventListener('keydown', onKey);

  return () => { io.disconnect(); document.removeEventListener('keydown', onKey); $$('video', feed).forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); }); };
}

function slideHTML({ v, user, stats, products, following, store }, idx) {
  const p = products[0];
  return `<article class="slide" data-id="${v.id}" data-user="${v.userId}" aria-label="@${esc(user?.username)}: ${esc(v.caption)}">
    <video playsinline loop muted preload="${idx < 2 ? 'auto' : 'none'}" poster="${esc(v.poster || '')}" aria-hidden="true"></video>
    <div class="shade" aria-hidden="true"></div>
    <div class="tap-layer" aria-hidden="true"></div>
    <div class="flash" aria-live="polite"></div>
    <div class="mute-hint">${icon('volOff', { size: 18 })}<span>${esc(t('tapUnmute'))}</span></div>
    <aside class="rail">
      <div class="rail-av"><a href="#/profile/${user?.id}" aria-label="@${esc(user?.username)}"><img src="${avatarOf(user)}" alt="" class="av"></a>
        <button class="follow-plus ${following ? 'done' : ''}" data-a="follow" aria-label="${esc(following ? t('unfollow') : t('follow'))}">${icon(following ? 'check' : 'plus', { size: 14 })}</button></div>
      <button class="rbtn ${stats.liked ? 'on' : ''}" data-a="like" aria-pressed="${stats.liked}" aria-label="${esc(t('like'))}">${icon('heart', { size: 30, fill: stats.liked })}<span class="n-like">${fmtNum(stats.likes)}</span></button>
      <button class="rbtn" data-a="comments" aria-label="${esc(t('comments'))}">${icon('comment', { size: 28 })}<span class="n-comment">${fmtNum(stats.comments)}</span></button>
      <button class="rbtn ${stats.saved ? 'on save' : 'save'}" data-a="save" aria-pressed="${stats.saved}" aria-label="${esc(t('save'))}">${icon('bookmark', { size: 28, fill: stats.saved })}<span class="n-save">${fmtNum(stats.saves)}</span></button>
      <button class="rbtn" data-a="share" aria-label="${esc(t('share'))}">${icon('share', { size: 28, cls: 'flip-rtl' })}<span class="n-share">${fmtNum(stats.shares)}</span></button>
      <button class="rbtn small" data-a="more" aria-label="${esc(t('more'))}"><span aria-hidden="true" style="font-size:22px;line-height:1">⋯</span></button>
      <button class="rbtn small" data-a="mute" aria-pressed="${!muted}" aria-label="${esc(t('tapUnmute'))}">${icon(muted ? 'volOff' : 'volOn', { size: 20 })}</button>
      <div class="disc" aria-hidden="true"><img src="${avatarOf(user)}" alt=""></div>
    </aside>
    <div class="meta">
      <a class="uname" href="#/profile/${user?.id}"><bdi>@${esc(user?.username)}</bdi></a> <span class="when">· ${esc(timeAgo(v.createdAt))}</span>
      <p class="cap">${linkify(v.caption)} ${v.hashtags.filter((h) => !v.caption.includes('#' + h)).map((h) => `<a href="#/tag/${encodeURIComponent(h)}" class="htag">#${esc(h)}</a>`).join(' ')}</p>
      <div class="sound">${icon('music', { size: 14 })}<div class="marquee"><span>${esc(v.sound || `${t('originalSound')} - ${user?.username}`)}</span></div></div>
      ${p ? `<button class="shop-card" data-a="products" aria-label="${esc(t('shopNow'))}: ${esc(p.name)}"><img src="${productImg(p)}" alt="" class="pimg"><span class="grow"><span class="shop-store">${icon('bag', { size: 13 })} ${esc(store?.name || '')}${store?.verified ? verifiedBadge(t('verified')) : ''}</span><b>${esc(p.name)}</b><span class="price">${esc(fmtKWD(p.price))}${products.length > 1 ? ` <em>+${products.length - 1}</em>` : ''}</span></span><span class="shop-cta">${esc(t('shopNow'))}</span></button>` : ''}
    </div>
    <div class="progress" aria-hidden="true"><i></i></div>
  </article>`;
}
