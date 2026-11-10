// © 2026 وطن النهار — نشر المقاطع المجدولة عند استحقاقها (يعمل أيضاً بعد إعادة التشغيل)
import { q } from './db.js';
import { notifyRemix } from './remix.js';

export async function publishDue() {
  const r = await q("update videos set status = 'published' where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now() returning id, user_id, source_clip_id, remix_type");
  for (const v of r.rows) {
    try { await notifyRemix(v); } catch (e) { console.error('[publisher] remix notify', e); }
  }
  return r.rowCount;
}

export function startPublisher(ms = 20000) {
  const tick = () => publishDue().then((n) => { if (n) console.log('[ClipKat] published scheduled videos:', n); }).catch((e) => console.error('[publisher]', e));
  tick();
  const t = setInterval(tick, ms);
  t.unref?.();
  return () => clearInterval(t);
}
