// © 2026 وطن النهار — «روّج فيديوك»: حملات ترويج المقاطع داخل فيد «لك» مدفوعة بعملات كليب كات.
//
// القواعد:
// - تُخصم العملات كاملة عند الإرسال (kind='promo') وتبقى الحملة «قيد المراجعة» حتى يعتمدها المشرف.
// - الرفض أو الإلغاء قبل الاعتماد = إعادة كامل المبلغ (kind='promo_refund').
// - الإنفاق = ceil(مرات الظهور ÷ PROMO_IMPRESSIONS_PER_COIN)، وعند انتهاء المدة أو الإيقاف النهائي يُعاد المتبقي تلقائياً.
// - الإعلان يظهر مرة كل PROMO_EVERY مقاطع في «لك»، بحد أقصى PROMO_FREQ_CAP ظهوراً لنفس المشاهد خلال 24 ساعة.
// - الاستهداف: الاهتمامات تُطابَق مع وسوم ما تفاعل معه المشاهد. المحافظة والعمر والجنس تُحفظ ولا تُطبَّق
//   لأن كليب كات لا يجمع هذه البيانات عن المشاهدين (لا نُخمّنها).
// - لا عمولة على مبيعات المتاجر؛ الترويج خدمة منفصلة بالعملات.
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, tx, pool } from './db.js';
import { requireUser, requireAdmin } from './auth.js';
import { HttpError, bad, isUuid, str, ms } from './util.js';
import { debit, credit, walletOf } from './gifts.js';
import { notify } from './rentals.js';
import { visibleSql } from './privacy.js';
import { VIDEO_COLS, mapVideo } from './mappers.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uid = (s) => { if (!isUuid(s)) throw bad('bad'); return s; };
const N = (v) => Number(v || 0);
const DAY = 86400000;
export const OBJECTIVES = ['views', 'profile', 'follows', 'messages'];
export const GOVERNORATES = ['capital', 'hawalli', 'farwaniya', 'ahmadi', 'jahra', 'mubarak'];
const GENDERS = ['all', 'male', 'female'];
const KINDS = ['impression', 'view', 'click', 'follow'];
function rl(windowMs, max) { return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) }); }
const intIn = (v, min, max, code = 'bad') => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw bad(code); return n; };

// تقدير شفاف: كل عملة = PROMO_IMPRESSIONS_PER_COIN ظهوراً؛ المدى ±20٪ لأن الوصول الفعلي يعتمد على عدد المشاهدين النشطين
export function estimate(totalCoins) {
  const imp = Math.max(0, Math.floor(totalCoins * config.promoImpressionsPerCoin));
  return { impressions: imp, low: Math.floor(imp * 0.8), high: Math.ceil(imp * 1.2), perCoin: config.promoImpressionsPerCoin };
}
export const spentFor = (impressions, total) => Math.min(total, Math.ceil(impressions / config.promoImpressionsPerCoin));
export const ctaFor = (objective) => ({ views: 'watchMore', profile: 'visitProfile', follows: 'follow', messages: 'message' }[objective] || 'visitProfile');
export const viewerKey = (req) => req.user?.id || ('a:' + crypto.createHmac('sha256', config.jwtSecret || 'ck').update(`${req.ip}|${String(req.headers['user-agent'] || '').slice(0, 200)}`).digest('hex').slice(0, 32));

export function mapPromotion(p, extra = {}) {
  const total = N(p.total_coins), spent = N(p.spent_coins), refunded = N(p.refunded_coins);
  return {
    id: p.id, userId: p.user_id, videoId: p.video_id, objective: p.objective, cta: ctaFor(p.objective),
    audience: p.audience, governorates: p.governorates || [], ageMin: p.age_min, ageMax: p.age_max, gender: p.gender, interests: p.interests || [],
    budgetType: p.budget_type, dailyCoins: p.daily_coins, totalCoins: total, days: p.days, maxImpressions: N(p.max_impressions),
    impressions: N(p.impressions), views: N(p.views), clicks: N(p.clicks), follows: N(p.follows),
    spentCoins: spent, refundedCoins: refunded, remainingCoins: Math.max(0, total - spent - refunded),
    status: p.status, rejectReason: p.reject_reason || '', endReason: p.end_reason || '',
    startAt: ms(p.start_at), endAt: ms(p.end_at), decidedAt: ms(p.decided_at), endedAt: ms(p.ended_at), createdAt: ms(p.created_at),
    estimate: estimate(total), ...extra
  };
}

// إنهاء حملة وإعادة المتبقي (داخل معاملة c، والحملة مقفلة for update)
async function finish(c, p, status, reason, actorId = null) {
  const total = N(p.total_coins), spent = status === 'ended' ? spentFor(N(p.impressions), total) : 0;
  const refund = Math.max(0, total - spent - N(p.refunded_coins));
  const row = (await c.query(`update promotions set status = $2, end_reason = $3, spent_coins = $4, refunded_coins = refunded_coins + $5, ended_at = now(), updated_at = now(),
      reject_reason = case when $2 = 'rejected' then $6 else reject_reason end, decided_by = coalesce($7, decided_by), decided_at = case when $2 = 'rejected' then now() else decided_at end
    where id = $1 returning *`, [p.id, status, reason, spent, refund, status === 'rejected' ? reason : null, actorId])).rows[0];
  if (refund > 0) await credit(c, p.user_id, 'coins', refund, 'promo_refund', { refId: p.id, actorId, note: `${status}:${reason}`.slice(0, 60) });
  return { row, refund };
}

// تنهي الحملات التي انتهت مدتها أو نفدت ميزانيتها أو حُذف مقطعها — تُستدعى دورياً وقبل القراءة
export async function sweepPromotions() {
  const due = (await q(`select id from promotions where
      (status in ('active','paused') and (end_at <= now() or impressions >= max_impressions or video_id is null))
      or (status = 'pending' and video_id is null) limit 200`)).rows;
  let n = 0;
  for (const { id } of due) {
    const r = await tx(async (c) => {
      const p = (await c.query('select * from promotions where id = $1 for update', [id])).rows[0];
      if (!p) return null;
      if (p.status === 'pending' && !p.video_id) return finish(c, p, 'cancelled', 'videoDeleted');
      if (!['active', 'paused'].includes(p.status)) return null;
      const reason = !p.video_id ? 'videoDeleted' : N(p.impressions) >= N(p.max_impressions) ? 'budget' : 'endDate';
      return finish(c, p, 'ended', reason);
    });
    if (r) {
      n++;
      const msg = r.row.end_reason === 'budget' ? 'انتهت حملة الترويج: وصلت للميزانية كاملة 🎯' : `انتهت حملة الترويج${r.refund ? ` وأُعيد ${r.refund} عملة غير مستخدمة لمحفظتك` : ''}`;
      await notify(pool, { userId: r.row.user_id, type: 'system', text: msg }).catch(() => {});
    }
  }
  return n;
}
let sweepTimer = null;
export function startPromoSweeper(everyMs = 60000) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweepPromotions().catch((e) => console.warn('[promote] sweep failed:', e.message)), everyMs);
  sweepTimer.unref?.();
}

// اهتمامات المشاهد: وسوم المقاطع التي أعجبته أو حفظها أو شاهدها مؤخراً
async function viewerTags(viewerId) {
  if (!viewerId) return [];
  return (await q(`select distinct unnest(v.hashtags) as t from videos v where v.id in (
      select video_id from likes where user_id = $1 union select video_id from saves where user_id = $1
      union (select video_id from watch_events where user_id = $1 order by created_at desc limit 200)) limit 300`, [viewerId])).rows.map((r) => r.t);
}

// اختيار حملة ممولة واحدة لهذا المشاهد (أو null) — يحترم الحالة والمدة والميزانية اليومية والكلية وسقف التكرار والحظر والخصوصية
export async function pickSponsored({ viewer, viewerKeyStr, excludeVideoIds = [] }) {
  const vid = viewer?.id || null;
  const tags = await viewerTags(vid);
  const params = [vid, viewerKeyStr, config.promoFreqCap, excludeVideoIds.filter(isUuid), tags, config.promoImpressionsPerCoin];
  const sql = `select p.id as promo_id, p.user_id as promo_user_id, p.objective as promo_objective, ${VIDEO_COLS} from promotions p join videos v on v.id = p.video_id
    where p.status = 'active' and p.start_at <= now() and p.end_at > now() and p.impressions < p.max_impressions
      and ($1::uuid is null or p.user_id <> $1::uuid)
      and not v.is_hidden and v.status = 'published' and v.media_status <> 'processing'
      and ${visibleSql('v.user_id', '$1::uuid')}
      and not (v.id = any($4::uuid[]))
      and (cardinality(p.interests) = 0 or cardinality($5::text[]) = 0 or p.interests && $5::text[])
      and (p.budget_type <> 'daily' or (select count(*) from promotion_events e where e.promotion_id = p.id and e.kind = 'impression' and e.created_at > date_trunc('day', now())) < p.daily_coins * $6)
      and (select count(*) from promotion_events e where e.promotion_id = p.id and e.viewer_key = $2 and e.kind = 'impression' and e.created_at > now() - interval '24 hours') < $3
    order by (p.impressions::float / p.max_impressions) asc, random() limit 1`;
  const row = (await q(sql, params)).rows[0];
  if (!row) return null;
  const store = row.promo_objective === 'profile' ? (await q('select id, name from stores where owner_id = $1 and expires_at > now()', [row.promo_user_id])).rows[0] : null;
  return { video: mapVideo(row), promo: { campaignId: row.promo_id, objective: row.promo_objective, cta: store ? 'visitStore' : ctaFor(row.promo_objective), storeId: store?.id || null } };
}

export function buildPromoteRouter() {
  const r = express.Router();
  const evLimit = rl(60000, 240);

  r.get('/promote/config', (_req, res) => res.json({
    objectives: OBJECTIVES, governorates: GOVERNORATES, perCoin: config.promoImpressionsPerCoin, minCoins: config.promoMinCoins, maxCoins: config.promoMaxCoins,
    maxDays: 30, every: config.promoEvery, freqCap: config.promoFreqCap, demographicsApplied: false
  }));
  // اهتمامات مقترحة: أكثر الوسوم استخداماً في المقاطع المنشورة
  r.get('/promote/interests', h(async (_req, res) => {
    const rows = (await q(`select t, count(*)::int as n from (select unnest(hashtags) as t from videos where status = 'published' and not is_hidden) x group by t order by n desc, t limit 24`)).rows;
    res.json({ interests: rows.map((x) => x.t) });
  }));

  // إنشاء حملة: تُخصم العملات فوراً في نفس المعاملة
  r.post('/promotions', requireUser, rl(3600000, 20), h(async (req, res) => {
    const b = req.body || {};
    const videoId = uid(b.videoId);
    const objective = OBJECTIVES.includes(b.objective) ? b.objective : null; if (!objective) throw bad('objective');
    const audience = b.audience === 'manual' ? 'manual' : 'smart';
    let governorates = [], ageMin = null, ageMax = null, gender = 'all', interests = [];
    if (audience === 'manual') {
      governorates = [...new Set((Array.isArray(b.governorates) ? b.governorates : []).filter((g) => GOVERNORATES.includes(g)))];
      if (b.ageMin != null && b.ageMin !== '') ageMin = intIn(b.ageMin, 13, 65, 'age');
      if (b.ageMax != null && b.ageMax !== '') ageMax = intIn(b.ageMax, 13, 65, 'age');
      if (ageMin && ageMax && ageMin > ageMax) throw bad('age');
      gender = GENDERS.includes(b.gender) ? b.gender : 'all';
      interests = [...new Set((Array.isArray(b.interests) ? b.interests : []).map((x) => str(x, 40).replace(/^#/, '').trim()).filter(Boolean))].slice(0, 10);
    }
    const days = intIn(b.days, 1, 30, 'days');
    const budgetType = b.budgetType === 'daily' ? 'daily' : 'total';
    let daily = null, total;
    if (budgetType === 'daily') { daily = intIn(b.dailyCoins, 1, config.promoMaxCoins, 'budget'); total = daily * days; }
    else total = intIn(b.totalCoins, 1, config.promoMaxCoins, 'budget');
    if (total < config.promoMinCoins || total > config.promoMaxCoins) throw new HttpError(400, 'budget', { limit: config.promoMinCoins });
    const v = (await q(`select v.id, v.user_id, v.status, v.is_hidden, v.media_status, p.is_private from videos v join profiles p on p.id = v.user_id where v.id = $1`, [videoId])).rows[0];
    if (!v || v.user_id !== req.user.id) throw new HttpError(404, 'notfound');
    if (v.status !== 'published' || v.is_hidden) throw bad('notPublished');
    if (v.is_private) throw bad('privateAccount');
    const maxImp = Math.max(1, total * config.promoImpressionsPerCoin);
    const out = await tx(async (c) => {
      const open = (await c.query("select count(*)::int as n from promotions where user_id = $1 and status in ('pending','active','paused')", [req.user.id])).rows[0].n;
      if (open >= 5) throw bad('tooMany');
      const p = (await c.query(`insert into promotions (user_id, video_id, objective, audience, governorates, age_min, age_max, gender, interests, budget_type, daily_coins, total_coins, days, max_impressions)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`, [req.user.id, videoId, objective, audience, governorates, ageMin, ageMax, gender, interests, budgetType, daily, total, days, maxImp])).rows[0];
      const balance = await debit(c, req.user.id, 'coins', total, 'promo', { refId: p.id, note: objective });
      return { p, balance };
    });
    // إشعار داخل الموقع لكل مشرف (بدون بريد)
    const admins = (await q('select id from profiles where is_admin and not is_banned')).rows;
    for (const a of admins) await notify(pool, { userId: a.id, type: 'system', text: `حملة ترويج جديدة بانتظار المراجعة من @${req.user.username} (${total} عملة)` }).catch(() => {});
    res.status(201).json({ promotion: mapPromotion(out.p), wallet: await walletOf(req.user.id) });
  }));

  r.get('/promotions', requireUser, h(async (req, res) => {
    await sweepPromotions().catch(() => {});
    const rows = (await q(`select p.*, v.poster_url, v.caption from promotions p left join videos v on v.id = p.video_id where p.user_id = $1 order by p.created_at desc limit 50`, [req.user.id])).rows;
    res.json({ promotions: rows.map((p) => mapPromotion(p, { poster: p.poster_url || null, caption: p.caption || '' })), wallet: await walletOf(req.user.id) });
  }));

  // إلغاء حملة قبل اعتمادها = إعادة كامل المبلغ
  r.post('/promotions/:id/cancel', requireUser, h(async (req, res) => {
    const id = uid(req.params.id);
    const out = await tx(async (c) => {
      const p = (await c.query('select * from promotions where id = $1 and user_id = $2 for update', [id, req.user.id])).rows[0];
      if (!p) throw new HttpError(404, 'notfound');
      if (p.status !== 'pending') throw bad('notPending');
      return finish(c, p, 'cancelled', 'byOwner', req.user.id);
    });
    res.json({ promotion: mapPromotion(out.row), refunded: out.refund, wallet: await walletOf(req.user.id) });
  }));

  // أحداث الإعلان من المتصفح: ظهور / مشاهدة / نقرة على الزر / متابعة
  r.post('/promotions/:id/event', evLimit, h(async (req, res) => {
    const id = uid(req.params.id);
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : null; if (!kind) throw bad('bad');
    const key = viewerKey(req);
    const result = await tx(async (c) => {
      const p = (await c.query('select * from promotions where id = $1 for update', [id])).rows[0];
      if (!p) throw new HttpError(404, 'notfound');
      if (req.user && p.user_id === req.user.id) return { counted: false };   // صاحب الحملة لا يُحتسب
      const recent = async (k, sinceSql) => N((await c.query(`select count(*) as n from promotion_events where promotion_id = $1 and viewer_key = $2 and kind = $3 and created_at > ${sinceSql}`, [id, key, k])).rows[0].n);
      if (kind === 'impression') {
        if (p.status !== 'active' || !(p.end_at > new Date()) || N(p.impressions) >= N(p.max_impressions)) return { counted: false };
        if (await recent('impression', "now() - interval '24 hours'") >= config.promoFreqCap) return { counted: false };
        if (p.budget_type === 'daily') {
          const today = N((await c.query("select count(*) as n from promotion_events where promotion_id = $1 and kind = 'impression' and created_at > date_trunc('day', now())", [id])).rows[0].n);
          if (today >= N(p.daily_coins) * config.promoImpressionsPerCoin) return { counted: false };
        }
        await c.query('insert into promotion_events (promotion_id, viewer_key, kind) values ($1,$2,$3)', [id, key, kind]);
        const u = (await c.query('update promotions set impressions = impressions + 1, updated_at = now() where id = $1 returning *', [id])).rows[0];
        await c.query('update promotions set spent_coins = $2 where id = $1', [id, spentFor(N(u.impressions), N(u.total_coins))]);
        if (N(u.impressions) >= N(u.max_impressions)) { await finish(c, { ...u }, 'ended', 'budget'); return { counted: true, ended: true, owner: u.user_id }; }
        return { counted: true };
      }
      // بقية الأحداث تتطلب ظهوراً سابقاً لنفس المشاهد (لا نقرات بدون مشاهدة الإعلان)
      if (!(await recent('impression', "now() - interval '7 days'"))) return { counted: false };
      if (kind === 'follow') {
        if (!req.user) return { counted: false };
        const f = (await c.query('select 1 from follows where follower_id = $1 and followee_id = $2', [req.user.id, p.user_id])).rowCount;
        if (!f || await recent('follow', "'-infinity'::timestamptz")) return { counted: false };
      } else if (await recent(kind, "now() - interval '24 hours'")) return { counted: false };
      await c.query('insert into promotion_events (promotion_id, viewer_key, kind) values ($1,$2,$3)', [id, key, kind]);
      const col = { view: 'views', click: 'clicks', follow: 'follows' }[kind];
      await c.query(`update promotions set ${col} = ${col} + 1, updated_at = now() where id = $1`, [id]);
      return { counted: true };
    });
    if (result.ended) await notify(pool, { userId: result.owner, type: 'system', text: 'انتهت حملة الترويج: وصلت للميزانية كاملة 🎯' }).catch(() => {});
    res.json({ ok: true, counted: !!result.counted });
  }));

  // ---------------- المشرف ----------------
  r.get('/admin/promotions', requireAdmin, h(async (req, res) => {
    await sweepPromotions().catch(() => {});
    const st = String(req.query.status || 'pending');
    const where = st === 'active' ? "p.status in ('active','paused')" : st === 'ended' ? "p.status in ('ended','rejected','cancelled')" : "p.status = 'pending'";
    const rows = (await q(`select p.*, v.poster_url, v.caption, u.username, u.name from promotions p left join videos v on v.id = p.video_id join profiles u on u.id = p.user_id where ${where} order by p.created_at desc limit 100`)).rows;
    const counts = (await q("select status, count(*)::int as n from promotions group by status")).rows;
    res.json({ promotions: rows.map((p) => mapPromotion(p, { poster: p.poster_url || null, caption: p.caption || '', user: { id: p.user_id, username: p.username, name: p.name } })), counts: Object.fromEntries(counts.map((x) => [x.status, x.n])) });
  }));
  const adminAct = (fn) => h(async (req, res) => {
    const id = uid(req.params.id);
    const out = await tx(async (c) => {
      const p = (await c.query('select * from promotions where id = $1 for update', [id])).rows[0];
      if (!p) throw new HttpError(404, 'notfound');
      return fn(c, p, req);
    });
    if (out.notifyText) await notify(pool, { userId: out.row.user_id, type: 'system', text: out.notifyText }).catch(() => {});
    res.json({ promotion: mapPromotion(out.row), refunded: out.refund || 0 });
  });
  r.post('/admin/promotions/:id/approve', requireAdmin, adminAct(async (c, p, req) => {
    if (p.status !== 'pending') throw bad('notPending');
    if (!p.video_id) throw bad('notPublished');
    const row = (await c.query(`update promotions set status = 'active', start_at = now(), end_at = now() + make_interval(days => days), decided_by = $2, decided_at = now(), updated_at = now() where id = $1 returning *`, [p.id, req.user.id])).rows[0];
    return { row, notifyText: 'تم اعتماد حملة الترويج ✅ وبدأ عرض فيديوك في «لك»' };
  }));
  r.post('/admin/promotions/:id/reject', requireAdmin, adminAct(async (c, p, req) => {
    if (p.status !== 'pending') throw bad('notPending');
    const reason = str(req.body?.reason, 200) || 'لم تتم الموافقة';
    const { row, refund } = await finish(c, p, 'rejected', reason, req.user.id);
    return { row, refund, notifyText: `تم رفض حملة الترويج وأُعيد ${refund} عملة لمحفظتك. السبب: ${reason}` };
  }));
  r.post('/admin/promotions/:id/pause', requireAdmin, adminAct(async (c, p) => {
    if (p.status !== 'active') throw bad('notActive');
    return { row: (await c.query("update promotions set status = 'paused', updated_at = now() where id = $1 returning *", [p.id])).rows[0], notifyText: 'تم إيقاف حملة الترويج مؤقتاً من الإدارة' };
  }));
  r.post('/admin/promotions/:id/resume', requireAdmin, adminAct(async (c, p) => {
    if (p.status !== 'paused') throw bad('notPaused');
    return { row: (await c.query("update promotions set status = 'active', updated_at = now() where id = $1 returning *", [p.id])).rows[0], notifyText: 'تم استئناف حملة الترويج ▶️' };
  }));
  r.post('/admin/promotions/:id/stop', requireAdmin, adminAct(async (c, p, req) => {
    if (!['active', 'paused'].includes(p.status)) throw bad('notActive');
    const { row, refund } = await finish(c, p, 'ended', 'admin', req.user.id);
    return { row, refund, notifyText: `أنهت الإدارة حملة الترويج${refund ? ` وأُعيد ${refund} عملة غير مستخدمة لمحفظتك` : ''}` };
  }));
  return r;
}
