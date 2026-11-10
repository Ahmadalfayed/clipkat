// © 2026 وطن النهار — صفحة الصوت والمكتبة (مقاطع تستخدم هذا الصوت + استخدم هذا الصوت)
import { api } from '../services/index.js';
import { t, timeAgo } from '../i18n.js';
import { icon, esc, $, toast, emptyState, avatarOf } from '../ui.js';
import { pageHead, videoGrid, userRow, openReportSheet } from './common.js';

const fmtDur = (ms) => `${Math.max(1, Math.round((ms || 0) / 1000))}ث`;

export async function render(el, params, ctx) {
  if (params.name === 'sounds' || !params.args[0]) return listPage(el, ctx);
  return detailPage(el, params.args[0], ctx);
}

async function listPage(el, ctx) {
  if (!api.social) { el.innerHTML = `<div class="page">${pageHead(t('soundLibrary'))}${emptyState(t('soundLibrary'), t('serverOnly'))}</div>`; return; }
  const rows = await api.listSounds();
  el.innerHTML = `<div class="page">${pageHead(t('soundLibrary'))}
    <p class="note">${esc(t('soundLibNote'))}</p>
    <form class="form tight" id="upSnd">
      <label class="field"><span>${esc(t('uploadSound'))}</span><input type="file" name="file" accept="audio/*,video/*" required></label>
      <label class="field"><span>${esc(t('soundTitle'))}</span><input name="title" maxlength="80" required placeholder="${esc(t('soundTitlePh'))}"></label>
      <button class="btn primary" type="submit">${esc(t('publishSound'))}</button>
    </form>
    ${rows.length ? `<ul class="sound-list">${rows.map(sRow).join('')}</ul>` : emptyState(t('noSounds'), t('noSoundsSub'))}
  </div>`;
  $('#upSnd', el).addEventListener('submit', async (e) => {
    e.preventDefault(); if (!(await ctx.requireLogin())) return;
    const fd = new FormData(e.target); const f = fd.get('file'); const title = String(fd.get('title') || '').trim();
    if (!f || !f.size) return; const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try { const s = await api.uploadSound({ file: f, title }); toast(t('soundSaved'), 'ok'); ctx.navigate('#/sound/' + s.id); }
    catch (err) { toast(t(err.message === 'tooLong' ? 'soundTooLong' : err.message === 'badFile' || err.message === 'noAudio' ? 'badSound' : err.message), 'warn'); btn.disabled = false; }
  });
}

function sRow(s) {
  return `<li class="sound-row"><a href="#/sound/${s.id}"><span class="eq" aria-hidden="true">${icon('music', { size: 18 })}</span>
    <span class="grow"><b>${esc(s.title)}</b><small class="muted">${fmtDur(s.durationMs)} · ${esc(t('usedBy', { n: s.usesCount }))}</small></span>
    <span class="btn sm">${esc(t('useSound'))}</span></a></li>`;
}

async function detailPage(el, id, ctx) {
  if (!api.social) { el.innerHTML = `<div class="page">${pageHead(t('sound'))}${emptyState(t('serverOnly'))}</div>`; return; }
  const s = await api.getSound(id);
  if (!s) { el.innerHTML = `<div class="page">${pageHead(t('sound'))}${emptyState(t('soundHidden') === t('soundHidden') ? t('notFound') : t('soundHidden'))}</div>`; return; }
  const [owner, vids] = await Promise.all([api.getUser(s.userId), api.listSoundVideos(s.id)]);
  el.innerHTML = `<div class="page">${pageHead(s.title)}
    <section class="card sound-head">
      <h1>${icon('music', { size: 22 })} ${esc(s.title)}</h1>
      <p class="muted">${fmtDur(s.durationMs)} · ${esc(t('usedBy', { n: s.usesCount }))} · ${esc(timeAgo(s.createdAt))}</p>
      ${owner ? userRow(owner) : ''}
      <audio controls preload="none" src="${esc(s.src)}" style="width:100%"></audio>
      <p class="muted sm">${esc(t('soundLibNote'))}</p>
      <div class="pactions">
        <a class="btn primary" href="#/upload?sound=${s.id}">${esc(t('useSound'))}</a>
        ${ctx.me && ctx.me.id !== s.userId ? `<button class="btn" id="repSnd">${esc(t('reportSound'))}</button>` : ''}
      </div>
    </section>
    <h2 class="sec-title">${esc(t('clipsWithSound'))}</h2>
    ${vids.length ? videoGrid(vids) : emptyState(t('noVideos'))}
  </div>`;
  $('#repSnd', el)?.addEventListener('click', () => openReportSheet('sound', s.id));
}
