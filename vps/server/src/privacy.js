// © 2026 وطن النهار — قواعد الخصوصية والحظر (تُطبَّق في الخادم، لا في المتصفح)
import { q } from './db.js';

// شرط SQL: محتوى صاحبه في العمود col مرئي للمشاهد vp (معامل uuid قد يكون null للزائر)
//  - صاحب المحتوى يرى محتواه دائماً
//  - الحساب المحظور (banned) مخفي
//  - الحساب الخاص: فقط المتابِعون المقبولون
//  - أي حظر بين الطرفين (بأي اتجاه) يخفي المحتوى
export const visibleSql = (col, vp) => `(${col} = ${vp} or (exists (select 1 from profiles ap where ap.id = ${col} and not ap.is_banned and (not ap.is_private or exists (select 1 from follows vf where vf.follower_id = ${vp} and vf.followee_id = ${col}))) and not exists (select 1 from blocks vb where (vb.blocker_id = ${col} and vb.blocked_id = ${vp}) or (vb.blocker_id = ${vp} and vb.blocked_id = ${col}))))`;
// شرط SQL: لا يوجد حظر بين المستخدم col والمشاهد vp
export const notBlockedSql = (col, vp) => `not exists (select 1 from blocks nb where (nb.blocker_id = ${col} and nb.blocked_id = ${vp}) or (nb.blocker_id = ${vp} and nb.blocked_id = ${col}))`;

export async function isBlockedBetween(a, b) {
  if (!a || !b) return false;
  return (await q('select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1', [a, b])).rowCount > 0;
}
export async function canSeeUserContent(viewer, authorId) {
  if (viewer?.is_admin) return true;
  return (await q(`select ${visibleSql('$1::uuid', '$2::uuid')} as ok`, [authorId, viewer?.id || null])).rows[0].ok === true;
}
export const COMMENT_POLICIES = ['everyone', 'followers', 'nobody'];
export const MESSAGE_POLICIES = ['everyone', 'followers', 'mutual', 'nobody'];
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'violence', 'nudity', 'scam', 'ip', 'other'];
