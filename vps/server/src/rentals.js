import { q, tx } from './db.js';
import { HttpError } from './util.js';

export async function notify(db, { userId, type, fromId = null, videoId = null, text = null }) {
  if (fromId && fromId === userId) return;
  await db.query('insert into notifications (user_id, type, from_id, video_id, text) values ($1,$2,$3,$4,$5)', [userId, type, fromId, videoId, text]);
}

export async function slots(db) {
  const s = (await db.query('select store_slots, featured_slots from app_settings where id = 1')).rows[0];
  const used = (await db.query('select count(*) filter (where expires_at > now())::int as stores, count(*) filter (where expires_at > now() and featured)::int as featured from stores')).rows[0];
  return { storesUsed: used.stores, storesTotal: s.store_slots, featuredUsed: used.featured, featuredTotal: s.featured_slots };
}

// الدالة الوحيدة التي تفعّل إيجاراً — لا يصل إليها المتصفح مباشرة (فقط مشرف أو Webhook موثَّق). idempotent.
export async function activateRental(rentalId, { ref, gateway, by }) {
  return tx(async (c) => {
    const r = (await c.query('select * from rentals where id = $1 for update', [rentalId])).rows[0];
    if (!r) throw new HttpError(404, 'notfound');
    if (r.status === 'active') return r;
    if (r.status !== 'pending') throw new HttpError(409, 'state');
    const plan = (await c.query('select * from plans where id = $1', [r.plan_id])).rows[0];
    const st = (await c.query('select * from stores where id = $1 for update', [r.store_id])).rows[0];
    const wasActive = st.expires_at && new Date(st.expires_at) > new Date();
    const sl = await slots(c);
    if (!wasActive && sl.storesUsed >= sl.storesTotal) throw new HttpError(409, 'noSlots');
    const featured = plan.featured && (st.featured || sl.featuredUsed < sl.featuredTotal);
    const start = wasActive ? new Date(st.expires_at) : new Date();
    const end = new Date(start.getTime() + plan.days * 86400000);
    const row = (await c.query("update rentals set status = 'active', start_at = $2, end_at = $3, activated_at = now(), activated_by = $4, gateway = coalesce($5, gateway), gateway_ref = coalesce($6, gateway_ref) where id = $1 returning *", [rentalId, start, end, by, gateway, ref])).rows[0];
    await c.query('update stores set plan_id = $2, expires_at = $3, featured = $4, verified = $5 where id = $1', [st.id, plan.id, end, featured, plan.verified]);
    await notify(c, { userId: st.owner_id, type: 'system', text: 'تم تفعيل متجرك ✅' });
    return row;
  });
}
export async function cancelRental(rentalId) {
  const d = await q("update rentals set status = 'cancelled' where id = $1 and status = 'pending' returning 1", [rentalId]);
  if (!d.rowCount) throw new HttpError(409, 'state');
}
