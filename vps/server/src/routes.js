import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import { q, tx, pool } from './db.js';
import { loadUser, requireUser, requireAdmin, setSession, clearSession } from './auth.js';
import { HttpError, bad, isUuid, str, hashPassword, verifyPassword, safeEqual, normTags, localUrl, norm, ms } from './util.js';
import { PROFILE_COLS, VIDEO_COLS, mapProfile, mapVideo, mapStore, mapProduct, mapRental, mapNotif, mapComment } from './mappers.js';
import { STORE_POLICY_VERSION } from './policy.js';
import { visibleSql, notBlockedSql, isBlockedBetween, canSeeUserContent, COMMENT_POLICIES, REPORT_REASONS } from './privacy.js';
import { imageUpload, videoUpload, sniffImage, sniffVideo, place, rm, rid, makePoster, dirs } from './uploads.js';
import { activateRental, cancelRental, slots, notify } from './rentals.js';

export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (v) => { if (!v) throw new HttpError(404, 'notfound'); return v; };
const uid = (s) => { if (!isUuid(s)) throw bad('bad'); return s; };
const limitMsg = 'محاولات كثيرة — انتظر قليلاً ثم حاول مرة أخرى';
const mkLimit = (windowMs, max, extra = {}) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => res.status(429).json({ error: limitMsg }), ...extra });

export function buildRouter() {
  const r = express.Router();
  r.use(mkLimit(60000, config.rateApiMax));
  r.use(loadUser);

  r.get('/health', h(async (_q, res) => { await q('select 1'); res.json({ ok: true }); }));
  r.get('/config', (_req, res) => res.json({ maxVideoMb: config.maxVideoMb, maxImageMb: config.maxImageMb, storePolicyVersion: STORE_POLICY_VERSION }));
  r.get('/policy/store-rental', (_req, res) => res.json({ policy: 'store-rental', version: STORE_POLICY_VERSION }));
  // لا إيجار بدون قبول صريح لإصدار السياسة الحالي — يُسجَّل في نفس المعاملة
  const requirePolicy = (b) => { if (b?.acceptPolicy !== STORE_POLICY_VERSION) throw bad('policyRequired'); };
  const recordAcceptance = (c, userId, storeId, rentalId) => c.query("insert into policy_acceptances (user_id, policy, version, store_id, rental_id) values ($1,'store-rental',$2,$3,$4)", [userId, STORE_POLICY_VERSION, storeId, rentalId]);

  // ---------------- Auth ----------------
  const authLimit = mkLimit(15 * 60000, config.rateAuthMax);
  r.post('/auth/signup', authLimit, h(async (req, res) => {
    const b = req.body || {};
    const email = str(b.email, 120, { min: 5 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('bad');
    const username = str(b.username, 24).toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(username)) throw bad('username');
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 8 || password.length > 128) throw bad('password');
    const name = str(b.name, 40) || username;
    if ((await q('select 1 from profiles where username = $1', [username])).rowCount) throw new HttpError(409, 'taken');
    if ((await q('select 1 from profiles where lower(email) = $1', [email])).rowCount) throw new HttpError(409, 'emailTaken');
    const hash = await hashPassword(password);
    let row;
    try { row = (await q('insert into profiles (email, password_hash, username, name) values ($1,$2,$3,$4) returning *', [email, hash, username, name])).rows[0]; }
    catch (e) { if (e.code === '23505') throw new HttpError(409, /email/.test(e.constraint || '') ? 'emailTaken' : 'taken'); throw e; }
    await notify(pool, { userId: row.id, type: 'system', text: 'أهلاً بك في كليب كات 🎉' });
    setSession(res, row);
    res.status(201).json({ user: await profileById(row.id) });
  }));
  r.post('/auth/login', authLimit, h(async (req, res) => {
    const email = str(req.body?.email, 120).toLowerCase(); const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 128) : '';
    const row = (await q('select * from profiles where lower(email) = $1', [email])).rows[0];
    // نُجري عملية التجزئة حتى لو المستخدم غير موجود (لتقليل تسريب الوقت)
    const ok = row ? await verifyPassword(password, row.password_hash) : (await verifyPassword(password, 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false);
    if (!ok || row.is_banned) throw new HttpError(401, 'bad');
    setSession(res, row);
    res.json({ user: await profileById(row.id) });
  }));
  r.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
  r.get('/auth/me', h(async (req, res) => res.json({ user: req.user ? await profileById(req.user.id) : null })));
  r.post('/auth/password', requireUser, authLimit, h(async (req, res) => {
    const cur = typeof req.body?.current === 'string' ? req.body.current.slice(0, 128) : '';
    const next = typeof req.body?.next === 'string' ? req.body.next : '';
    if (next.length < 8 || next.length > 128) throw bad('password');
    const row = (await q('select * from profiles where id = $1', [req.user.id])).rows[0];
    if (!(await verifyPassword(cur, row.password_hash))) throw new HttpError(401, 'badPassword');
    // تغيير كلمة المرور يُبطل كل الجلسات الأخرى، ثم نجدد جلسة هذا الجهاز
    const upd = (await q('update profiles set password_hash = $1, token_version = token_version + 1 where id = $2 returning *', [await hashPassword(next), req.user.id])).rows[0];
    setSession(res, upd); res.json({ ok: true });
  }));
  r.post('/auth/logout-all', requireUser, h(async (req, res) => { await q('update profiles set token_version = token_version + 1 where id = $1', [req.user.id]); clearSession(res); res.json({ ok: true }); }));

  async function profileById(id) { return mapProfile((await q(`select ${PROFILE_COLS} from profiles p where p.id = $1`, [id])).rows[0]); }
  // ملف شخصي كما يراه المشاهد: null إن كان صاحبه قد حظر المشاهد
  async function profileFor(id, viewer) {
    const p = await profileById(id); if (!p) return null;
    if (!viewer || viewer.id === id) return p;
    const rel = (await q(`select
        exists (select 1 from blocks where blocker_id = $2 and blocked_id = $1) as blocked_me,
        exists (select 1 from blocks where blocker_id = $1 and blocked_id = $2) as blocked_by_me,
        exists (select 1 from follows where follower_id = $1 and followee_id = $2) as following,
        exists (select 1 from follow_requests where requester_id = $1 and target_id = $2) as requested`, [viewer.id, id])).rows[0];
    if (rel.blocked_me && !viewer.is_admin) return null;
    p.relation = { following: rel.following, requested: rel.requested, blockedByMe: rel.blocked_by_me, canView: viewer.is_admin || ((!p.isPrivate || rel.following) && !rel.blocked_by_me) };
    return p;
  }
  const viewerId = (req) => req.user?.id || null;

  // ---------------- Users ----------------
  r.get('/users', h(async (req, res) => res.json((await q(`select ${PROFILE_COLS} from profiles p where not p.is_banned and ${notBlockedSql('p.id', '$1::uuid')} order by p.created_at desc limit 200`, [viewerId(req)])).rows.map(mapProfile))));
  r.get('/users/by-ids', h(async (req, res) => {
    const ids = String(req.query.ids || '').split(',').filter(isUuid).slice(0, 100);
    res.json(ids.length ? (await q(`select ${PROFILE_COLS} from profiles p where p.id = any($1::uuid[]) and not exists (select 1 from blocks b where b.blocker_id = p.id and b.blocked_id = $2::uuid)`, [ids, viewerId(req)])).rows.map(mapProfile) : []);
  }));
  r.get('/users/:id', h(async (req, res) => res.json(isUuid(req.params.id) ? await profileFor(req.params.id, req.user) : null)));
  r.patch('/users/me', requireUser, h(async (req, res) => {
    const b = req.body || {}; const sets = []; const vals = [];
    if (b.name !== undefined) { vals.push(str(b.name, 40)); sets.push(`name = $${vals.length}`); }
    if (b.bio !== undefined) { vals.push(str(b.bio, 160)); sets.push(`bio = $${vals.length}`); }
    if (b.avatar !== undefined) { vals.push(localUrl(b.avatar)); sets.push(`avatar_url = $${vals.length}`); }
    if (sets.length) { vals.push(req.user.id); await q(`update profiles set ${sets.join(', ')} where id = $${vals.length}`, vals); }
    res.json(await profileById(req.user.id));
  }));
  r.get('/follows/check', h(async (req, res) => res.json({ following: isUuid(req.query.a) && isUuid(req.query.b) && (await q('select 1 from follows where follower_id = $1 and followee_id = $2', [req.query.a, req.query.b])).rowCount > 0 })));
  r.post('/users/:id/follow', requireUser, h(async (req, res) => {
    const target = uid(req.params.id); if (target === req.user.id) return res.json({ following: false, requested: false });
    const t = need((await q('select id, is_private from profiles where id = $1 and not is_banned', [target])).rows[0]);
    const del = await q('delete from follows where follower_id = $1 and followee_id = $2', [req.user.id, target]);
    if (del.rowCount) return res.json({ following: false, requested: false });
    const delReq = await q('delete from follow_requests where requester_id = $1 and target_id = $2', [req.user.id, target]);
    if (delReq.rowCount) return res.json({ following: false, requested: false });
    if (await isBlockedBetween(req.user.id, target)) throw new HttpError(403, 'blocked');
    if (t.is_private) {
      await q('insert into follow_requests (requester_id, target_id) values ($1,$2) on conflict do nothing', [req.user.id, target]);
      await notify(pool, { userId: target, type: 'follow_request', fromId: req.user.id });
      return res.json({ following: false, requested: true });
    }
    await q('insert into follows (follower_id, followee_id) values ($1,$2) on conflict do nothing', [req.user.id, target]);
    await notify(pool, { userId: target, type: 'follow', fromId: req.user.id });
    res.json({ following: true, requested: false });
  }));
  // ---------------- Follow requests (الحساب الخاص) ----------------
  r.get('/me/follow-requests', requireUser, h(async (req, res) => {
    res.json((await q(`select ${PROFILE_COLS} from follow_requests fr join profiles p on p.id = fr.requester_id where fr.target_id = $1 and not p.is_banned order by fr.created_at desc limit 200`, [req.user.id])).rows.map(mapProfile));
  }));
  r.post('/me/follow-requests/:id/accept', requireUser, h(async (req, res) => {
    const from = uid(req.params.id);
    const ok = await tx(async (c) => {
      const d = await c.query('delete from follow_requests where requester_id = $1 and target_id = $2 returning 1', [from, req.user.id]);
      if (!d.rowCount) return false;
      await c.query('insert into follows (follower_id, followee_id) values ($1,$2) on conflict do nothing', [from, req.user.id]);
      await notify(c, { userId: from, type: 'follow_accept', fromId: req.user.id });
      return true;
    });
    if (!ok) throw new HttpError(404, 'notfound'); res.json({ ok: true });
  }));
  r.post('/me/follow-requests/:id/decline', requireUser, h(async (req, res) => {
    const d = await q('delete from follow_requests where requester_id = $1 and target_id = $2', [uid(req.params.id), req.user.id]);
    if (!d.rowCount) throw new HttpError(404, 'notfound'); res.json({ ok: true });
  }));
  // إزالة متابِع (مفيدة للحساب الخاص)
  r.delete('/me/followers/:id', requireUser, h(async (req, res) => { await q('delete from follows where follower_id = $1 and followee_id = $2', [uid(req.params.id), req.user.id]); res.json({ ok: true }); }));

  // ---------------- Settings ----------------
  const settingsOf = async (id) => { const r0 = (await q('select is_private, comment_policy from profiles where id = $1', [id])).rows[0]; return { isPrivate: r0.is_private, commentPolicy: r0.comment_policy }; };
  r.get('/me/settings', requireUser, h(async (req, res) => res.json(await settingsOf(req.user.id))));
  r.patch('/me/settings', requireUser, h(async (req, res) => {
    const b = req.body || {};
    if (b.isPrivate !== undefined && typeof b.isPrivate !== 'boolean') throw bad('bad');
    if (b.commentPolicy !== undefined && !COMMENT_POLICIES.includes(b.commentPolicy)) throw bad('bad');
    await tx(async (c) => {
      if (b.isPrivate !== undefined) {
        await c.query('update profiles set is_private = $1 where id = $2', [b.isPrivate, req.user.id]);
        if (b.isPrivate === false) {   // التحويل لعام = قبول كل الطلبات المعلّقة
          await c.query('insert into follows (follower_id, followee_id) select requester_id, target_id from follow_requests where target_id = $1 on conflict do nothing', [req.user.id]);
          await c.query('delete from follow_requests where target_id = $1', [req.user.id]);
        }
      }
      if (b.commentPolicy !== undefined) await c.query('update profiles set comment_policy = $1 where id = $2', [b.commentPolicy, req.user.id]);
    });
    res.json(await settingsOf(req.user.id));
  }));

  // ---------------- Blocks ----------------
  r.get('/me/blocks', requireUser, h(async (req, res) => res.json((await q(`select ${PROFILE_COLS} from blocks b join profiles p on p.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`, [req.user.id])).rows.map(mapProfile))));
  r.post('/users/:id/block', requireUser, h(async (req, res) => {
    const target = uid(req.params.id); if (target === req.user.id) throw bad('self');
    need((await q('select 1 from profiles where id = $1', [target])).rowCount);
    await tx(async (c) => {
      await c.query('insert into blocks (blocker_id, blocked_id) values ($1,$2) on conflict do nothing', [req.user.id, target]);
      await c.query('delete from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)', [req.user.id, target]);
      await c.query('delete from follow_requests where (requester_id = $1 and target_id = $2) or (requester_id = $2 and target_id = $1)', [req.user.id, target]);
    });
    res.json({ blocked: true });
  }));
  r.delete('/users/:id/block', requireUser, h(async (req, res) => { await q('delete from blocks where blocker_id = $1 and blocked_id = $2', [req.user.id, uid(req.params.id)]); res.json({ blocked: false }); }));

  r.get('/users/:id/stats', h(async (req, res) => {
    const id = uid(req.params.id);
    const p = need(await profileFor(id, req.user));
    const v = (await q(`select count(*)::int as videos, coalesce(sum((select count(*) from likes l where l.video_id = v.id)),0)::int as likes from videos v where v.user_id = $1 and not v.is_hidden`, [id])).rows[0];
    res.json({ followers: p.followersCount, following: p.followingCount, likes: v.likes, videos: v.videos });
  }));
  r.get('/creators/top', h(async (req, res) => {
    const n = Math.min(Number(req.query.n) || 8, 30);
    const rows = (await q(`select ${PROFILE_COLS} from profiles p where not p.is_admin and not p.is_banned and ${notBlockedSql('p.id', '$2::uuid')} order by followers_count desc, p.created_at limit $1`, [n, viewerId(req)])).rows;
    res.json(rows.map((x) => ({ ...mapProfile(x), stats: { followers: x.followers_count, following: x.following_count } })));
  }));

  // ---------------- Videos ----------------
  // viewer: المستخدم الحالي (أو null). الخصوصية والحظر يُفرضان هنا لكل استعلامات المقاطع
  async function queryVideos(viewer, where = [], params = [], limit = 100) {
    where = [...where]; params = [...params];
    if (!viewer?.is_admin) { params.push(viewer?.id || null); where.push(visibleSql('v.user_id', `$${params.length}::uuid`)); }
    const sql = `select ${VIDEO_COLS} from videos v where not v.is_hidden ${where.length ? 'and ' + where.join(' and ') : ''} order by v.created_at desc limit ${limit}`;
    return (await q(sql, params)).rows.map(mapVideo);
  }
  r.get('/videos', h(async (req, res) => {
    const { tab, userId, tag, savedBy, likedBy, productStoreId } = req.query; const w = []; const p = [];
    const add = (cond, v) => { p.push(v); w.push(cond.replace('?', '$' + p.length)); };
    if (tab === 'following') { if (!req.user) return res.json([]); add('v.user_id in (select followee_id from follows where follower_id = ?)', req.user.id); }
    if (userId) add('v.user_id = ?', uid(userId));
    if (tag) add('? = any(v.hashtags)', String(tag).slice(0, 40));
    // المحفوظات والإعجابات خاصة بصاحبها فقط
    if (savedBy) { if (uid(savedBy) !== req.user?.id) throw new HttpError(403, 'forbidden'); add('v.id in (select video_id from saves where user_id = ?)', savedBy); }
    if (likedBy) { if (uid(likedBy) !== req.user?.id) throw new HttpError(403, 'forbidden'); add('v.id in (select video_id from likes where user_id = ?)', likedBy); }
    if (productStoreId) add('v.id in (select vp.video_id from video_products vp join products pr on pr.id = vp.product_id where pr.store_id = ?)', uid(productStoreId));
    res.json(await queryVideos(req.user, w, p));
  }));
  r.get('/videos/:id', h(async (req, res) => res.json(isUuid(req.params.id) ? (await queryVideos(req.user, ['v.id = $1'], [req.params.id], 1))[0] || null : null)));
  r.get('/me/interactions', requireUser, h(async (req, res) => {
    const [l, s] = await Promise.all([q('select video_id from likes where user_id = $1', [req.user.id]), q('select video_id from saves where user_id = $1', [req.user.id])]);
    res.json({ likes: l.rows.map((x) => x.video_id), saves: s.rows.map((x) => x.video_id) });
  }));

  r.post('/upload/image', requireUser, mkLimit(3600000, 300), imageUpload, h(async (req, res) => {
    const f = req.file; if (!f) throw bad('bad');
    const ext = sniffImage(f.path); if (!ext) { rm(f.path); throw bad('badFile'); }
    res.status(201).json({ url: place(f.path, 'images', req.user.id, `${Date.now()}-${rid()}.${ext}`) });
  }));

  r.post('/videos', requireUser, mkLimit(3600000, 60), videoUpload, h(async (req, res) => {
    const vf = req.files?.file?.[0], pf = req.files?.poster?.[0]; const tmp = [vf?.path, pf?.path].filter(Boolean);
    try {
      if (!vf) throw bad('bad');
      const ext = sniffVideo(vf.path); if (!ext) throw bad('badFile');
      const b = req.body || {}; const caption = str(b.caption, 300); const sound = b.sound ? str(b.sound, 80) : null;
      let hashtags = []; try { hashtags = JSON.parse(b.hashtags || '[]'); } catch { /* ignore */ }
      let productIds = []; try { productIds = JSON.parse(b.productIds || '[]'); } catch { /* ignore */ }
      if (!Array.isArray(productIds)) productIds = [];
      const id = crypto.randomUUID(); const me = req.user.id;
      // الصورة المصغّرة: من المتصفح إن وُجدت وإلا ffmpeg
      let posterUrl = null;
      if (pf && sniffImage(pf.path)) posterUrl = place(pf.path, 'images', me, `poster-${id}.${sniffImage(pf.path)}`);
      else {
        const out = path.join(dirs.tmp, `${rid()}.jpg`);
        if (await makePoster(vf.path, out)) posterUrl = place(out, 'images', me, `poster-${id}.jpg`); else rm(out);
      }
      const videoUrl = place(vf.path, 'videos', me, `${id}.${ext}`);
      const row = await tx(async (c) => {
        const v = (await c.query('insert into videos (id, user_id, video_path, video_url, poster_url, caption, hashtags, sound) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [id, me, videoUrl, videoUrl, posterUrl, caption, normTags(hashtags, caption), sound])).rows[0];
        const mine = productIds.filter(isUuid).length ? (await c.query('select pr.id from products pr join stores s on s.id = pr.store_id where s.owner_id = $1 and pr.id = any($2::uuid[])', [me, productIds.filter(isUuid)])).rows : [];
        for (const m of mine) await c.query('insert into video_products (video_id, product_id) values ($1,$2) on conflict do nothing', [id, m.id]);
        return v;
      });
      res.status(201).json((await queryVideos(req.user, ['v.id = $1'], [row.id], 1))[0]);
    } finally { tmp.forEach(rm); }
  }));

  r.delete('/videos/:id', requireUser, h(async (req, res) => {
    const id = uid(req.params.id);
    const d = await q('delete from videos where id = $1 and (user_id = $2 or $3) returning 1', [id, req.user.id, !!req.user.is_admin]);
    if (!d.rowCount) throw new HttpError(403, 'forbidden'); res.json({ ok: true });
  }));

  // يرجع المقطع إن كان مرئياً للمستخدم، وإلا 404 (لا نكشف وجود محتوى خاص)
  async function visibleVideo(req, id) {
    const v = need((await q('select id, user_id from videos where id = $1 and not is_hidden', [id])).rows[0]);
    if (!(await canSeeUserContent(req.user, v.user_id))) throw new HttpError(404, 'notfound');
    return v;
  }
  const toggle = (table) => h(async (req, res) => {
    const id = uid(req.params.id); const v = await visibleVideo(req, id);
    const del = await q(`delete from ${table} where user_id = $1 and video_id = $2`, [req.user.id, id]);
    let on = false;
    if (!del.rowCount) { await q(`insert into ${table} (user_id, video_id) values ($1,$2) on conflict do nothing`, [req.user.id, id]); on = true; if (table === 'likes') await notify(pool, { userId: v.user_id, type: 'like', fromId: req.user.id, videoId: id }); }
    res.json({ on, video: (await queryVideos(req.user, ['v.id = $1'], [id], 1))[0] });
  });
  r.post('/videos/:id/like', requireUser, toggle('likes'));
  r.post('/videos/:id/save', requireUser, toggle('saves'));
  r.post('/videos/:id/share', h(async (req, res) => { await visibleVideo(req, uid(req.params.id)); await q('update videos set shares_count = shares_count + 1 where id = $1', [uid(req.params.id)]); res.json({ ok: true }); }));

  r.get('/videos/:id/comments', h(async (req, res) => {
    const id = uid(req.params.id); const v = await visibleVideo(req, id);
    const rows = (await q(`select c.* from comments c join profiles cp on cp.id = c.user_id where c.video_id = $1 and not cp.is_banned and ${notBlockedSql('c.user_id', '$2::uuid')} order by c.created_at desc limit 300`, [id, viewerId(req)])).rows;
    const ids = [...new Set(rows.map((c) => c.user_id))];
    const users = ids.length ? (await q(`select ${PROFILE_COLS} from profiles p where p.id = any($1::uuid[])`, [ids])).rows.map(mapProfile) : [];
    const policy = (await q('select comment_policy from profiles where id = $1', [v.user_id])).rows[0].comment_policy;
    res.json({ comments: rows.map(mapComment), users, canComment: !!req.user && (await commentAllowed(req.user, v)) === true, policy });
  }));
  // هل يحق للمستخدم التعليق على المقطع؟ يرجع true أو رمز الخطأ
  async function commentAllowed(user, v) {
    if (user.id === v.user_id || user.is_admin) return true;
    const pol = (await q('select comment_policy from profiles where id = $1', [v.user_id])).rows[0]?.comment_policy;
    if (pol === 'nobody') return 'commentsOff';
    if (pol === 'followers' && !(await q('select 1 from follows where follower_id = $1 and followee_id = $2', [user.id, v.user_id])).rowCount) return 'followersOnly';
    return true;
  }
  r.delete('/comments/:id', requireUser, h(async (req, res) => {
    // يحذف التعليق: كاتبه، أو صاحب المقطع، أو المشرف
    const d = await q('delete from comments c using videos v where c.id = $1 and v.id = c.video_id and (c.user_id = $2 or v.user_id = $2 or $3) returning 1', [uid(req.params.id), req.user.id, !!req.user.is_admin]);
    if (!d.rowCount) throw new HttpError(403, 'forbidden'); res.json({ ok: true });
  }));
  r.post('/videos/:id/comments', requireUser, mkLimit(60000, 30), h(async (req, res) => {
    const id = uid(req.params.id); const text = str(req.body?.text, 300); if (!text) throw bad('empty');
    const v = await visibleVideo(req, id);
    const allowed = await commentAllowed(req.user, v); if (allowed !== true) throw new HttpError(403, allowed);
    let parentId = null, parentAuthor = null;
    if (req.body?.parentId != null) {
      const par = (await q('select id, parent_id, user_id, video_id from comments where id = $1', [uid(req.body.parentId)])).rows[0];
      if (!par || par.video_id !== id) throw bad('badParent');                       // الرد يجب أن يكون على نفس المقطع
      if (await isBlockedBetween(req.user.id, par.user_id)) throw new HttpError(403, 'blocked');
      parentId = par.parent_id || par.id; parentAuthor = par.user_id;                 // مستوى واحد من الردود
    }
    const c = (await q('insert into comments (video_id, user_id, text, parent_id) values ($1,$2,$3,$4) returning *', [id, req.user.id, text, parentId])).rows[0];
    await notify(pool, { userId: v.user_id, type: 'comment', fromId: req.user.id, videoId: id, text });
    if (parentAuthor && parentAuthor !== v.user_id) await notify(pool, { userId: parentAuthor, type: 'reply', fromId: req.user.id, videoId: id, text });
    res.status(201).json(mapComment(c));
  }));

  // ---------------- Discover ----------------
  r.get('/tags/trending', h(async (req, res) => res.json((await q('select tag, count from trending_tags limit $1', [Math.min(Number(req.query.n) || 10, 50)])).rows)));
  r.get('/search', h(async (req, res) => {
    const s = String(req.query.q || '').replace(/[%_\\]/g, ' ').replace(/^#/, '').trim().slice(0, 60);
    if (!s) return res.json({ users: [], tags: [], videos: [], stores: [] });
    const like = `%${s}%`;
    const [users, tags, vids] = await Promise.all([
      q(`select ${PROFILE_COLS} from profiles p where not p.is_admin and not p.is_banned and (p.username ilike $1 or p.name ilike $1) and ${notBlockedSql('p.id', '$2::uuid')} limit 20`, [like, viewerId(req)]),
      q('select tag from trending_tags where tag ilike $1 limit 20', [like]),
      queryVideos(req.user, ['(v.caption ilike $1 or $2 = any(v.hashtags))'], [like, s], 30)
    ]);
    res.json({ users: users.rows.map(mapProfile), tags: tags.rows.map((x) => x.tag), videos: vids, stores: await listStores({ q: s }) });
  }));

  // ---------------- Stores ----------------
  async function listStores({ q: term = '', category = '', includeInactive = false } = {}) {
    const w = []; const p = [];
    if (!includeInactive) w.push('s.expires_at > now()');
    if (category) { p.push(String(category).slice(0, 20)); w.push(`s.category = $${p.length}`); }
    const rows = (await q(`select s.*, (select count(*)::int from products pr where pr.store_id = s.id) as product_count from stores s ${w.length ? 'where ' + w.join(' and ') : ''} order by s.featured desc, s.created_at desc limit 200`, p)).rows;
    const names = rows.length ? (await q('select store_id, name from products where store_id = any($1::uuid[])', [rows.map((s) => s.id)])).rows : [];
    const t = norm(term);
    return rows.map((s) => ({ ...mapStore(s), productCount: s.product_count }))
      .filter((s) => !t || norm(s.name).includes(t) || norm(s.description).includes(t) || names.some((n) => n.store_id === s.id && norm(n.name).includes(t)));
  }
  async function withPending(st, user) {
    if (!st) return null;
    if (user && (user.id === st.ownerId || user.is_admin)) st.pending = (await q("select 1 from rentals where store_id = $1 and status = 'pending' limit 1", [st.id])).rowCount > 0;
    return st;
  }
  r.get('/slots', h(async (_req, res) => res.json(await slots(pool))));
  r.get('/stores', h(async (req, res) => res.json(await listStores({ q: String(req.query.q || ''), category: String(req.query.category || ''), includeInactive: req.query.includeInactive === '1' && !!req.user?.is_admin }))));
  r.get('/stores/by-owner/:uid', h(async (req, res) => res.json(isUuid(req.params.uid) ? await withPending(mapStore((await q('select * from stores where owner_id = $1', [req.params.uid])).rows[0]), req.user) : null)));
  r.get('/stores/:id', h(async (req, res) => res.json(isUuid(req.params.id) ? await withPending(mapStore((await q('select * from stores where id = $1', [req.params.id])).rows[0]), req.user) : null)));

  const storeFields = (b, plan) => ({
    name: str(b.name, 40, { min: 1 }),
    category: ['perfume', 'coffee', 'fashion', 'art', 'digital', 'food', 'beauty', 'other'].includes(b.category) ? b.category : 'other',
    description: str(b.description, 200),
    contact: b.contact ? (/^https?:\/\/\S{1,300}$/i.test(String(b.contact).trim()) ? String(b.contact).trim() : (() => { throw bad('bad'); })()) : null,
    logo: localUrl(b.logo), banner: plan && !plan.custom_banner ? null : localUrl(b.banner)
  });
  r.post('/stores', requireUser, h(async (req, res) => {
    const { store = {}, planId, payment = {} } = req.body || {}; requirePolicy(req.body);
    const plan = need((await q('select * from plans where id = $1', [String(planId)])).rows[0]);
    const f = storeFields(store, plan);
    if ((await q('select 1 from stores where owner_id = $1', [req.user.id])).rowCount) throw new HttpError(409, 'exists');
    const out = await tx(async (c) => {
      const s = (await c.query('insert into stores (owner_id, name, category, description, contact_url, logo_url, banner_url, plan_id) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *', [req.user.id, f.name, f.category, f.description, f.contact, f.logo, f.banner, plan.id])).rows[0];
      // الإيجار يبقى pending — السعر يُحسب من الخادم، والتفعيل فقط من المشرف أو Webhook الدفع
      const rt = (await c.query('insert into rentals (store_id, owner_id, plan_id, amount, method, gateway, gateway_ref, policy_version) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [s.id, req.user.id, plan.id, plan.price, ['knet', 'card', 'applepay'].includes(payment.method) ? payment.method : null, 'mock', String(payment.ref || '').slice(0, 60) || null, STORE_POLICY_VERSION])).rows[0];
      await recordAcceptance(c, req.user.id, s.id, rt.id);
      return s;
    });
    res.status(201).json({ ...mapStore(out), pending: true });
  }));
  r.post('/stores/:id/rentals', requireUser, h(async (req, res) => {
    const id = uid(req.params.id); const { planId, payment = {} } = req.body || {}; requirePolicy(req.body);
    const st = need((await q('select * from stores where id = $1 and owner_id = $2', [id, req.user.id])).rows[0]);
    const plan = need((await q('select * from plans where id = $1', [String(planId)])).rows[0]);
    await tx(async (c) => {
      const rt = (await c.query('insert into rentals (store_id, owner_id, plan_id, amount, method, gateway, gateway_ref, policy_version) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [st.id, req.user.id, plan.id, plan.price, ['knet', 'card', 'applepay'].includes(payment.method) ? payment.method : null, 'mock', String(payment.ref || '').slice(0, 60) || null, STORE_POLICY_VERSION])).rows[0];
      await recordAcceptance(c, req.user.id, st.id, rt.id);
    });
    res.status(201).json(await withPending(mapStore(st), req.user));
  }));
  r.patch('/stores/:id', requireUser, h(async (req, res) => {
    const id = uid(req.params.id); const b = req.body || {};
    const st = need((await q('select s.*, p.custom_banner from stores s join plans p on p.id = s.plan_id where s.id = $1', [id])).rows[0]);
    if (st.owner_id !== req.user.id && !req.user.is_admin) throw new HttpError(403, 'forbidden');
    const sets = []; const vals = []; const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.name !== undefined) set('name', str(b.name, 40, { min: 1 }));
    if (b.category !== undefined) set('category', ['perfume', 'coffee', 'fashion', 'art', 'digital', 'food', 'beauty', 'other'].includes(b.category) ? b.category : 'other');
    if (b.description !== undefined) set('description', str(b.description, 200));
    if (b.contact !== undefined) set('contact_url', b.contact ? (/^https?:\/\/\S{1,300}$/i.test(String(b.contact).trim()) ? String(b.contact).trim() : (() => { throw bad('bad'); })()) : null);
    if (b.logo) set('logo_url', localUrl(b.logo));
    if (b.banner && st.custom_banner) set('banner_url', localUrl(b.banner));
    if (sets.length) { vals.push(id); await q(`update stores set ${sets.join(', ')} where id = $${vals.length}`, vals); }
    res.json(mapStore((await q('select * from stores where id = $1', [id])).rows[0]));
  }));
  r.get('/rentals', requireUser, h(async (req, res) => {
    const p = []; const w = [];
    if (!req.user.is_admin) { p.push(req.user.id); w.push(`owner_id = $${p.length}`); }
    if (req.query.storeId) { p.push(uid(req.query.storeId)); w.push(`store_id = $${p.length}`); }
    res.json((await q(`select * from rentals ${w.length ? 'where ' + w.join(' and ') : ''} order by created_at desc limit 500`, p)).rows.map(mapRental));
  }));

  // ---------------- Products ----------------
  r.get('/stores/:id/products', h(async (req, res) => res.json((await q('select * from products where store_id = $1 order by created_at desc', [uid(req.params.id)])).rows.map(mapProduct))));
  r.get('/products', h(async (req, res) => {
    const ids = String(req.query.ids || '').split(',').filter(isUuid).slice(0, 50);
    const rows = ids.length ? (await q('select * from products where id = any($1::uuid[])', [ids])).rows.map(mapProduct) : [];
    res.json(ids.map((i) => rows.find((x) => x.id === i)).filter(Boolean));
  }));
  r.get('/products/:id', h(async (req, res) => res.json(isUuid(req.params.id) ? mapProduct((await q('select * from products where id = $1', [req.params.id])).rows[0]) || null : null)));
  r.post('/products', requireUser, h(async (req, res) => {
    const p = req.body || {};
    const st = (await q('select s.id, pl.max_products from stores s join plans pl on pl.id = s.plan_id where s.owner_id = $1', [req.user.id])).rows[0];
    if (!st) throw bad('nostore');
    const rec = { name: str(p.name, 60, { min: 1 }), price: Math.max(0, Math.min(Number(p.price) || 0, 1e6)), stock: Math.max(0, Math.min(Math.floor(Number(p.stock) || 0), 1e6)), description: str(p.description, 200), image: localUrl(p.image) };
    if (p.id) {
      const row = (await q('update products set name=$1, price=$2, stock=$3, description=$4, image_url=coalesce($5, image_url) where id=$6 and store_id=$7 returning *', [rec.name, rec.price, rec.stock, rec.description, rec.image, uid(p.id), st.id])).rows[0];
      return res.json(mapProduct(need(row)));
    }
    if (st.max_products != null && (await q('select count(*)::int n from products where store_id = $1', [st.id])).rows[0].n >= st.max_products) throw bad('limit', { limit: st.max_products });
    res.status(201).json(mapProduct((await q('insert into products (store_id, name, price, stock, description, image_url) values ($1,$2,$3,$4,$5,$6) returning *', [st.id, rec.name, rec.price, rec.stock, rec.description, rec.image])).rows[0]));
  }));
  r.delete('/products/:id', requireUser, h(async (req, res) => {
    const d = await q('delete from products where id = $1 and store_id in (select id from stores where owner_id = $2)', [uid(req.params.id), req.user.id]);
    if (!d.rowCount) throw new HttpError(403, 'forbidden'); res.json({ ok: true });
  }));

  // ---------------- Notifications ----------------
  r.get('/notifications', requireUser, h(async (req, res) => {
    const rows = (await q(`select * from notifications n where n.user_id = $1 and (n.from_id is null or ${notBlockedSql('n.from_id', '$1::uuid')}) order by n.created_at desc limit 100`, [req.user.id])).rows;
    const ids = [...new Set(rows.map((n) => n.from_id).filter(Boolean))];
    const users = ids.length ? (await q(`select ${PROFILE_COLS} from profiles p where p.id = any($1::uuid[])`, [ids])).rows.map(mapProfile) : [];
    res.json({ notifications: rows.map(mapNotif), users });
  }));
  r.get('/notifications/unread-count', h(async (req, res) => res.json({ count: req.user ? (await q('select count(*)::int n from notifications where user_id = $1 and not read', [req.user.id])).rows[0].n : 0 })));
  r.post('/notifications/read-all', requireUser, h(async (req, res) => { await q('update notifications set read = true where user_id = $1 and not read', [req.user.id]); res.json({ ok: true }); }));

  // ---------------- Reports (التبليغ) ----------------
  r.post('/reports', requireUser, mkLimit(3600000, 30), h(async (req, res) => {
    const b = req.body || {};
    const type = ['video', 'user', 'comment'].includes(b.type) ? b.type : (() => { throw bad('bad'); })();
    const reason = REPORT_REASONS.includes(b.reason) ? b.reason : (() => { throw bad('reason'); })();
    const details = str(b.details, 500); const tid = uid(b.id);
    let videoId = null, commentId = null, targetUser;
    if (type === 'video') { const v = await visibleVideo(req, tid); videoId = v.id; targetUser = v.user_id; }
    else if (type === 'comment') {
      const c = need((await q('select id, video_id, user_id from comments where id = $1', [tid])).rows[0]);
      await visibleVideo(req, c.video_id); commentId = c.id; videoId = c.video_id; targetUser = c.user_id;
    } else { need((await q('select 1 from profiles where id = $1', [tid])).rowCount); targetUser = tid; }
    if (targetUser === req.user.id) throw bad('self');
    const dup = await q(`select 1 from reports where reporter_id = $1 and status = 'open' and target_type = $2 and target_user_id = $3 and video_id is not distinct from $4 and comment_id is not distinct from $5`, [req.user.id, type, targetUser, videoId, commentId]);
    if (dup.rowCount) throw new HttpError(409, 'alreadyReported');
    await q('insert into reports (reporter_id, target_type, target_user_id, video_id, comment_id, reason, details) values ($1,$2,$3,$4,$5,$6,$7)', [req.user.id, type, targetUser, videoId, commentId, reason, details]);
    res.status(201).json({ ok: true });
  }));
  r.get('/admin/reports', requireAdmin, h(async (req, res) => {
    const status = ['open', 'dismissed', 'actioned'].includes(req.query.status) ? req.query.status : 'open';
    const rows = (await q(`select r.*, c.text as comment_text, v.caption as video_caption, v.poster_url, v.is_hidden as video_hidden
      from reports r left join comments c on c.id = r.comment_id left join videos v on v.id = r.video_id
      where r.status = $1 order by r.created_at desc limit 200`, [status])).rows;
    const ids = [...new Set(rows.flatMap((x) => [x.reporter_id, x.target_user_id]).filter(Boolean))];
    const users = ids.length ? (await q(`select ${PROFILE_COLS}, p.is_banned from profiles p where p.id = any($1::uuid[])`, [ids])).rows.map((u) => ({ ...mapProfile(u), banned: u.is_banned })) : [];
    res.json({ reports: rows.map((x) => ({ id: x.id, type: x.target_type, reason: x.reason, details: x.details, status: x.status, action: x.action, reporterId: x.reporter_id, targetUserId: x.target_user_id, videoId: x.video_id, commentId: x.comment_id, commentText: x.comment_text, videoCaption: x.video_caption, poster: x.poster_url, videoHidden: x.video_hidden, createdAt: ms(x.created_at), reviewedAt: ms(x.reviewed_at) })), users });
  }));
  r.post('/admin/reports/:id/resolve', requireAdmin, h(async (req, res) => {
    const id = uid(req.params.id); const action = String(req.body?.action || '');
    if (!['dismiss', 'hide_video', 'delete_comment', 'ban_user'].includes(action)) throw bad('bad');
    const out = await tx(async (c) => {
      const rep = (await c.query("select * from reports where id = $1 and status = 'open' for update", [id])).rows[0];
      if (!rep) throw new HttpError(409, 'state');
      if (action === 'hide_video') { if (!rep.video_id) throw bad('bad'); await c.query('update videos set is_hidden = true where id = $1', [rep.video_id]); }
      if (action === 'delete_comment') { if (!rep.comment_id) throw bad('bad'); await c.query('delete from comments where id = $1', [rep.comment_id]); }
      if (action === 'ban_user') {
        const u = (await c.query('select is_admin from profiles where id = $1', [rep.target_user_id])).rows[0];
        if (!u || u.is_admin) throw bad('bad');
        await c.query('update profiles set is_banned = true, token_version = token_version + 1 where id = $1', [rep.target_user_id]);
      }
      const st = action === 'dismiss' ? 'dismissed' : 'actioned';
      await c.query('update reports set status = $1, action = $2, reviewed_by = $3, reviewed_at = now() where id = $4', [st, action, req.user.id, id]);
      return st;
    });
    res.json({ ok: true, status: out });
  }));

  // ---------------- Admin ----------------
  r.get('/admin/summary', requireAdmin, h(async (_req, res) => {
    const rentals = (await q('select * from rentals order by created_at desc limit 500')).rows;
    const sids = [...new Set(rentals.map((x) => x.store_id))]; const oids = [...new Set(rentals.map((x) => x.owner_id))];
    const stores = sids.length ? (await q('select * from stores where id = any($1::uuid[])', [sids])).rows : [];
    const owners = oids.length ? (await q(`select ${PROFILE_COLS} from profiles p where p.id = any($1::uuid[])`, [oids])).rows.map(mapProfile) : [];
    const [u, v] = await Promise.all([q('select count(*)::int n from profiles'), q('select count(*)::int n from videos')]);
    const sl = await slots(pool);
    res.json({
      rentals: rentals.map((x) => ({ ...mapRental(x), store: mapStore(stores.find((s) => s.id === x.store_id)), owner: owners.find((o) => o.id === x.owner_id) })),
      slots: sl, users: u.rows[0].n, videos: v.rows[0].n
    });
  }));
  r.post('/admin/rentals/:id/activate', requireAdmin, h(async (req, res) => res.json(mapRental(await activateRental(uid(req.params.id), { ref: 'MANUAL-ADMIN', gateway: 'manual', by: req.user.id })))));
  r.post('/admin/rentals/:id/cancel', requireAdmin, h(async (req, res) => { await cancelRental(uid(req.params.id)); res.json({ ok: true }); }));

  // ---------------- Payment webhook (هيكل أولي — أكمله لاحقاً) ----------------
  // خاص برسوم إيجار المتاجر فقط. كليب كات لا تستلم أموال مشتريات المنتجات (تُدفع مباشرة للتاجر)
  // ⚠️ TODO قبل الإنتاج: استبدل التحقق البسيط أدناه بتحقق Tap (hashstring HMAC + إعادة جلب الشحنة GET /v2/charges/:id)
  // أو MyFatoorah (توقيع Webhook + GetPaymentStatus)، وطابق المبلغ مع الإيجار. راجع server/README.md
  r.post('/payment-webhook/:gateway', h(async (req, res) => {
    if (!config.webhookSecret) throw new HttpError(501, 'webhookDisabled');
    if (!['tap', 'myfatoorah'].includes(req.params.gateway)) throw new HttpError(404, 'notfound');
    if (!safeEqual(req.get('x-webhook-secret') || '', config.webhookSecret)) throw new HttpError(401, 'bad');
    const { rentalId, paid, ref } = req.body || {};
    if (paid !== true) return res.json({ ok: true, ignored: true });
    const out = await activateRental(uid(rentalId), { ref: String(ref || '').slice(0, 60) || 'WEBHOOK', gateway: req.params.gateway, by: null });
    res.json({ ok: true, status: out.status });
  }));

  return r;
}
