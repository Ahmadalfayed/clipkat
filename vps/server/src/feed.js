// © 2026 وطن النهار — ترتيب فيد «لك»: حداثة، تفاعل، من تتابعهم، أصوات/وسوم تفاعلت معها، مع استبعاد المحظور والمخفي والمشاهد
import { q } from './db.js';
import { VIDEO_COLS, mapVideo } from './mappers.js';
import { visibleSql } from './privacy.js';
import { enrichRemix } from './remix.js';
import { isUuid } from './util.js';

export function parseCursor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const id = raw.includes('_') ? raw.slice(raw.lastIndexOf('_') + 1) : raw;
  return isUuid(id) ? { id } : null;
}
export const makeCursor = (id) => id;

export async function forYou({ viewer, cursor = null, limit = 8, excludeSeen = true }) {
  const n = Math.max(1, Math.min(Number(limit) || 8, 20));
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const vid = add(viewer?.id || null);
  let vis = `not v.is_hidden and v.status = 'published'`;
  if (!viewer?.is_admin) vis += ` and ${visibleSql('v.user_id', `${vid}::uuid`)}`;

  const scoreSql = `(
    36.0 / (2.0 + greatest(0, extract(epoch from now() - v.created_at) / 3600.0))
    + ln(2 + (select count(*) from likes l where l.video_id = v.id)) * 8
    + ln(2 + (select count(*) from comments c where c.video_id = v.id)) * 6
    + ln(2 + (select count(*) from saves s where s.video_id = v.id)) * 7
    + ln(2 + v.shares_count) * 4
    + case when ${vid}::uuid is not null and exists (select 1 from follows f where f.follower_id = ${vid}::uuid and f.followee_id = v.user_id) then 22 else 0 end
    + case when ${vid}::uuid is not null and v.sound_id is not null and v.sound_id in (
        select distinct v2.sound_id from videos v2
        where v2.sound_id is not null and v2.id in (
          select video_id from likes where user_id = ${vid}::uuid
          union select video_id from saves where user_id = ${vid}::uuid
          union select video_id from watch_events where user_id = ${vid}::uuid
        )
      ) then 10 else 0 end
    + case when ${vid}::uuid is not null then 5 * coalesce((
        select count(*)::int from unnest(v.hashtags) t
        where t in (
          select distinct unnest(v3.hashtags) from videos v3
          where v3.id in (
            select video_id from likes where user_id = ${vid}::uuid
            union select video_id from saves where user_id = ${vid}::uuid
            union select video_id from watch_events where user_id = ${vid}::uuid
          )
        )
      ), 0) else 0 end
    + coalesce((select (count(*) filter (where completed))::float / nullif(count(*), 0) * 8 from watch_events we where we.video_id = v.id), 0)
  )`;

  const seen = (viewer && excludeSeen)
    ? `id not in (select we.video_id from watch_events we where we.user_id = ${vid}::uuid)`
    : 'true';
  let curWhere = '';
  if (cursor?.id) {
    const cid = add(cursor.id);
    curWhere = ` and (f.score, f.id) < (select s.score, s.id from scored s where s.id = ${cid}::uuid)`;
  }

  const sql = `
    with scored as (
      select ${VIDEO_COLS}, ${scoreSql} as score
      from videos v
      where ${vis}
    ),
    filtered as (
      select * from scored where ${seen}
    )
    select f.* from filtered f
    where true ${curWhere}
    order by f.score desc, f.id desc
    limit ${n + 1}`;
  const rows = (await q(sql, params)).rows;
  const hasMore = rows.length > n;
  const page = hasMore ? rows.slice(0, n) : rows;
  const last = page[page.length - 1];
  return { videos: await enrichRemix(page.map((r) => mapVideo(r)), viewer), cursor: last ? makeCursor(last.id) : null, hasMore };
}
