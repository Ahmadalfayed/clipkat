// © 2026 وطن النهار — صلاحيات الديويتو والستيتش وبيانات الإسناد
import { pool, q } from './db.js';
import { canSeeUserContent, isBlockedBetween } from './privacy.js';
import { notify } from './rentals.js';
import { HttpError, isUuid } from './util.js';

export async function assertCanRemix(viewer, sourceId, type) {
  if (!viewer?.id) throw new HttpError(401, 'auth');
  if (type !== 'duet' && type !== 'stitch') throw new HttpError(400, 'bad');
  if (!isUuid(sourceId)) throw new HttpError(404, 'notfound');
  const row = (await q(
    `select v.id, v.user_id, v.is_hidden, v.status, p.allow_duet, p.allow_stitch, p.is_private
     from videos v join profiles p on p.id = v.user_id where v.id = $1`,
    [sourceId]
  )).rows[0];
  if (!row || row.is_hidden || row.status !== 'published') throw new HttpError(404, 'notfound');
  if (!(await canSeeUserContent(viewer, row.user_id))) throw new HttpError(404, 'notfound');
  const allowed = type === 'duet' ? row.allow_duet : row.allow_stitch;
  if (!allowed) throw new HttpError(403, 'remixOff');
  return row;
}

export async function enrichRemix(videos, viewer) {
  if (!videos?.length) return videos || [];
  const ownerIds = [...new Set(videos.map((v) => v.userId).filter(Boolean))];
  const sourceIds = [...new Set(videos.map((v) => v.sourceClipId).filter(Boolean))];
  const allows = ownerIds.length
    ? (await q('select id, allow_duet, allow_stitch from profiles where id = any($1::uuid[])', [ownerIds])).rows
    : [];
  const allowBy = Object.fromEntries(allows.map((r) => [r.id, r]));
  const sources = sourceIds.length
    ? (await q(
      `select v.id, v.user_id, v.is_hidden, v.status, p.username
       from videos v join profiles p on p.id = v.user_id where v.id = any($1::uuid[])`,
      [sourceIds]
    )).rows
    : [];
  const srcBy = Object.fromEntries(sources.map((s) => [s.id, s]));
  const authorIds = [...new Set(sources.map((s) => s.user_id))];
  const visible = new Set();
  if (authorIds.length) {
    const vid = viewer?.id || null;
    const r = await q(
      `select p.id from profiles p where p.id = any($1::uuid[]) and (${viewer?.is_admin ? 'true' : `p.id = $2 or (not p.is_banned and (not p.is_private or exists (select 1 from follows f where f.follower_id = $2 and f.followee_id = p.id)) and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = p.id)))`})`,
      viewer?.is_admin ? [authorIds] : [authorIds, vid]
    );
    for (const row of r.rows) visible.add(row.id);
  }
  for (const v of videos) {
    const a = allowBy[v.userId];
    v.canDuet = !a || a.allow_duet === true;
    v.canStitch = !a || a.allow_stitch === true;
    if (!v.sourceClipId) {
      v.source = v.remixType ? { available: false } : null;
      continue;
    }
    const s = srcBy[v.sourceClipId];
    if (!s || s.is_hidden || s.status !== 'published' || !visible.has(s.user_id)) v.source = { available: false };
    else v.source = { available: true, id: s.id, userId: s.user_id, username: s.username };
  }
  return videos;
}

export async function notifyRemix(newVideo) {
  if (!newVideo?.source_clip_id || !newVideo.remix_type || !newVideo.user_id) return;
  const src = (await q('select user_id from videos where id = $1', [newVideo.source_clip_id])).rows[0];
  if (!src) return;
  if (await isBlockedBetween(newVideo.user_id, src.user_id)) return;
  await notify(pool, { userId: src.user_id, type: 'remix', fromId: newVideo.user_id, videoId: newVideo.id, text: newVideo.remix_type });
}
