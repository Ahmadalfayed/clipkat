import { api } from '../services/index.js';
import { t, fmtNum } from '../i18n.js';
import { icon, esc, $, storeLogo, emptyState, avatarOf } from '../ui.js';
import { pageHead, videoGrid, userRow } from './common.js';

export async function render(el, params) {
  if (params.name === 'tag') {
    const tag = params.args[0] || '';
    const vids = await api.listVideos({ tag });
    el.innerHTML = `<div class="page">${pageHead('#' + tag)}
    <p class="row-end"><a class="btn sm" href="#/sounds">${icon('music', { size: 16 })} ${esc(t('soundLibrary'))}</a></p><p class="muted pad-x">${fmtNum(vids.length)} ${esc(t('videos'))}</p>${vids.length ? videoGrid(vids, { from: `?from=tag&tag=${encodeURIComponent(tag)}` }) : emptyState(t('noVideos'))}</div>`;
    return;
  }
  const [tags, creators, all] = await Promise.all([api.trendingTags(10), api.topCreators(8), api.listVideos()]);
  el.innerHTML = `<div class="page">${pageHead(t('discover'), { back: false })}
    <p class="row-end"><a class="btn sm" href="#/sounds">${icon('music', { size: 16 })} ${esc(t('soundLibrary'))}</a></p>
    <form class="searchbar" role="search"><span aria-hidden="true">${icon('search', { size: 20 })}</span><input type="search" name="q" placeholder="${esc(t('searchPh'))}" aria-label="${esc(t('search'))}" value="${esc(params.query.get('q') || '')}"></form>
    <div id="results"></div>
    <div id="browse">
      <section><h2 class="sec-title">${icon('star', { size: 18 })} ${esc(t('trendingTags'))}</h2>
        <div class="chips">${tags.map((x, i) => `<a class="chip ${i < 3 ? 'hot' : ''}" href="#/tag/${encodeURIComponent(x.tag)}">#${esc(x.tag)} <small>${fmtNum(x.count)}</small></a>`).join('')}</div></section>
      <section><h2 class="sec-title">${icon('user', { size: 18 })} ${esc(t('topCreators'))}</h2>
        <div class="creators">${creators.map((u) => `<a class="creator" href="#/profile/${u.id}"><img class="av lg" src="${avatarOf(u)}" alt=""><b>${esc(u.name)}</b><span class="muted">${fmtNum(u.stats.followers)} ${esc(t('followers'))}</span></a>`).join('')}</div></section>
      <section><h2 class="sec-title">${icon('play', { size: 18 })} ${esc(t('videos'))}</h2>${videoGrid(all)}</section>
    </div></div>`;
  const input = $('input', el), results = $('#results', el), browse = $('#browse', el);
  let timer;
  const run = async () => {
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; browse.hidden = false; return; }
    const r = await api.search(q); browse.hidden = true;
    results.innerHTML = `<h2 class="sec-title">${esc(t('results'))}</h2>
      ${r.tags.length ? `<div class="chips">${r.tags.map((h) => `<a class="chip" href="#/tag/${encodeURIComponent(h)}">#${esc(h)}</a>`).join('')}</div>` : ''}
      ${r.users.length ? `<h3 class="sub-title">${esc(t('creators'))}</h3><div class="list">${r.users.map((u) => userRow(u)).join('')}</div>` : ''}
      ${r.stores.length ? `<h3 class="sub-title">${esc(t('stores'))}</h3><div class="list">${r.stores.map((s) => `<a class="urow" href="#/store/${s.id}"><img class="av sq" src="${storeLogo(s)}" alt=""><span class="grow"><b>${esc(s.name)}</b><span class="muted">${esc(t('cat_' + s.category))}</span></span></a>`).join('')}</div>` : ''}
      ${r.videos.length ? `<h3 class="sub-title">${esc(t('videos'))}</h3>${videoGrid(r.videos)}` : ''}
      ${!r.tags.length && !r.users.length && !r.videos.length && !r.stores.length ? emptyState(t('results') + ': 0') : ''}`;
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  $('form', el).addEventListener('submit', (e) => { e.preventDefault(); run(); });
  if (input.value) run();
}
