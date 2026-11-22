// إشعارات الهاتف (Web Push / VAPID) — تصل حتى لو كان الموقع مغلقاً — © 2026 وطن النهار
// الأنواع: messages (رسائل)، videos (فيديوهات المتابَعين)، live (بث مباشر)، calls (مكالمات)
// - الاشتراكات في push_subscriptions (حتى 10 أجهزة لكل مستخدم). 404/410 من خدمة الدفع = حذف الاشتراك.
// - لا نسجّل عناوين الاشتراك (endpoint) في السجلات لأنها تعمل كرمز وصول.
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import webpush from 'web-push';
import { config } from './config.js';
import { q } from './db.js';
import { requireUser } from './auth.js';
import { HttpError, bad } from './util.js';
import { notBlockedSql } from './privacy.js';

export const PUSH_TYPES = ['messages', 'videos', 'live', 'calls'];
export const pushEnabled = () => !!(config.vapidPublic && config.vapidPrivate) || !!testSender;
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const rl = (windowMs, max) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) });

let inited = false, testSender = null;
export function _setTestSender(fn) { testSender = fn || null; }     // للاختبارات فقط
// اختبارات التكامل فقط (NODE_ENV=test + PUSH_TEST_SINK): نشفّر الرسالة فعلياً ثم نكتبها لملف بدل إرسالها للشبكة
if (process.env.NODE_ENV === 'test' && process.env.PUSH_TEST_SINK) {
  const sink = process.env.PUSH_TEST_SINK;
  testSender = async (sub, body, opts) => {
    const det = webpush.generateRequestDetails(sub, body, { ...opts, vapidDetails: { subject: config.vapidSubject, publicKey: config.vapidPublic, privateKey: config.vapidPrivate } });
    fs.appendFileSync(sink, JSON.stringify({ endpoint: sub.endpoint, body: JSON.parse(body), ttl: det.headers.TTL, urgency: det.headers.Urgency || null, topic: det.headers.Topic || null, encrypted: det.body.length > 0, vapid: /^vapid t=/.test(det.headers.Authorization || '') }) + '\n');
    if (/\/gone\b/.test(sub.endpoint)) { const e = new Error('gone'); e.statusCode = 410; throw e; }
  };
}
function send(sub, body, opts) {
  if (testSender) return testSender(sub, body, opts);
  if (!inited) { webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate); inited = true; }
  return webpush.sendNotification(sub, body, opts);
}
const prefOn = (prefs, type) => !prefs || prefs[type] !== false;
const isApple = (endpoint) => /(^|\.)push\.apple\.com$/i.test(hostOf(endpoint));
function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }
// خدمات الدفع المعروفة فقط (حتى لا يُستخدم الخادم لإرسال طلبات لعناوين عشوائية)
const PUSH_HOSTS = /(^|\.)(googleapis\.com|push\.apple\.com|mozilla\.com|mozaws\.net|notify\.windows\.com|push\.hicloud\.com|hicloud\.com|push\.dbankcloud\.com|dbankcloud\.com)$/i;
export function validEndpoint(u) {
  if (typeof u !== 'string' || u.length > 1000) return false;
  let x; try { x = new URL(u); } catch { return false; }
  return x.protocol === 'https:' && !x.port && !/^[\d.:[\]]+$/.test(x.hostname) && PUSH_HOSTS.test(x.hostname);
}
const b64ok = (s, max) => typeof s === 'string' && s.length >= 8 && s.length <= max && /^[A-Za-z0-9_-]+=*$/.test(s);
const topicOf = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined;

// يرسل إشعاراً لكل أجهزة المستخدم (إن كان النوع مفعّلاً لديه). يعيد عدد الأجهزة التي استلمت.
export async function pushToUser(userId, type, payload, { ttl = 3600, urgency = 'normal', topic, skipApple = false, force = false } = {}) {
  if (!pushEnabled() || !userId) return 0;
  const u = (await q('select push_prefs, is_banned from profiles where id = $1', [userId])).rows[0];
  if (!u || u.is_banned || (!force && !prefOn(u.push_prefs, type))) return 0;
  const subs = (await q('select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1 order by created_at desc limit 10', [userId])).rows;
  if (!subs.length) return 0;
  const body = JSON.stringify({ ...payload, ts: Date.now() });
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    if (skipApple && isApple(s.endpoint)) return;
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: ttl, urgency, topic: topicOf(topic), timeout: 8000 });
      ok++; q('update push_subscriptions set last_ok_at = now(), fail_count = 0 where id = $1', [s.id]).catch(() => {});
    } catch (e) {
      const sc = e?.statusCode;
      if (sc === 404 || sc === 410) await q('delete from push_subscriptions where id = $1', [s.id]).catch(() => {});
      else {
        await q('update push_subscriptions set fail_count = fail_count + 1 where id = $1', [s.id]).catch(() => {});
        await q('delete from push_subscriptions where id = $1 and fail_count >= 20', [s.id]).catch(() => {});
        console.warn('[push] send failed:', sc || e?.code || String(e?.message || e).slice(0, 80));
      }
    }
  }));
  return ok;
}
const later = (p) => { Promise.resolve().then(p).catch((e) => console.warn('[push]', e.message)); };

// يعيد true إذا مضى secs ثانية منذ آخر مرة لنفس المفتاح (ويسجّل الآن)
async function throttle(userId, k, secs) {
  return (await q(`insert into push_throttle (user_id, k, last_at) values ($1,$2,now())
    on conflict (user_id, k) do update set last_at = now(), n = push_throttle.n + 1 where push_throttle.last_at < now() - make_interval(secs => $3)
    returning 1`, [userId, k, secs])).rowCount > 0;
}
const who = async (id) => (await q('select id, username, name, avatar_url from profiles where id = $1', [id])).rows[0];
const nameOf = (p) => p?.name || p?.username || 'كليب كات';

// ---------- رسالة خاصة جديدة: نفس المرسل = إشعار واحد يتحدّث (tag/topic)، والرنين مرة كل 20 ثانية فقط ----------
export function pushMessage(toId, fromId, preview) {
  later(async () => {
    const from = await who(fromId); if (!from) return;
    const loud = await throttle(toId, 'dm:' + fromId, 20);
    await pushToUser(toId, 'messages', { t: 'dm', title: nameOf(from), body: preview, tag: 'dm-' + fromId, url: `/#/chat/${fromId}`, icon: from.avatar_url || null, silent: !loud }, { ttl: 86400, urgency: 'high', topic: 'd' + fromId.replace(/-/g, '').slice(0, 31) });
  });
}
// ---------- بدأ بثاً مباشراً (القائمة تأتي جاهزة: متابِعون غير محظورين، ومرة كل 30 دقيقة لكل مضيف) ----------
export function pushLive(hostId, liveId, title, followerIds) {
  if (!followerIds.length) return;
  later(async () => {
    const host = await who(hostId); if (!host) return;
    for (const f of followerIds) await pushToUser(f, 'live', { t: 'live', title: `🔴 ${nameOf(host)} بدأ بثاً مباشراً`, body: title || 'ادخل وشاهد الآن', tag: 'live-' + hostId, url: `/#/live/${liveId}`, icon: host.avatar_url || null }, { ttl: 3600, urgency: 'high', topic: 'l' + hostId.replace(/-/g, '').slice(0, 31) });
  });
}
// ---------- مكالمة واردة: أولوية عالية، أزرار رد/رفض، تنتهي صلاحيتها مع انتهاء الرنين ----------
export function pushCallRing(c, from) {
  later(() => pushToUser(c.callee_id, 'calls', {
    t: 'call', callId: c.id, kind: c.kind, title: c.kind === 'video' ? `📹 مكالمة فيديو من ${from.name}` : `📞 مكالمة صوتية من ${from.name}`,
    body: 'اضغط للرد', tag: 'call-' + c.id, url: `/#/feed?call=${c.id}`, icon: from.avatar || null
  }, { ttl: Math.max(15, config.callRingSec || 45), urgency: 'high', topic: c.id }));
}
// انتهاء الرنين: «فائتة» تستبدل إشعار الرنين، والرد/الرفض من جهاز آخر يغلقه (إلا على iPhone: لا نرسل دفعاً صامتاً لأن Safari يعاقب عليه)
export function pushCallEnd(c, status) {
  later(async () => {
    const missed = status === 'missed' || status === 'cancelled';
    if (missed) {
      const from = await who(c.caller_id);
      await pushToUser(c.callee_id, 'calls', { t: 'call-end', callId: c.id, missed: true, title: c.kind === 'video' ? 'مكالمة فيديو فائتة' : 'مكالمة فائتة', body: `من ${nameOf(from)}`, tag: 'call-' + c.id, url: `/#/chat/${c.caller_id}`, icon: from?.avatar_url || null }, { ttl: 3600, urgency: 'high', topic: c.id });
    } else await pushToUser(c.callee_id, 'calls', { t: 'call-end', callId: c.id, tag: 'call-' + c.id }, { ttl: 60, urgency: 'high', topic: c.id, skipApple: true });
  });
}

// ---------- فيديو جديد من حساب تتابعه: مراقب دوري يغطي كل طرق النشر (فوري/مجدول/بعد التحويل) ----------
export async function sweepNewVideos() {
  if (!pushEnabled()) return 0;
  const vids = (await q(`update videos v set push_sent_at = now()
    where v.id in (select id from videos where push_sent_at is null and status = 'published' and media_status not in ('processing','failed') and not is_hidden
      and greatest(created_at, coalesce(scheduled_at, created_at)) > now() - interval '2 hours' order by created_at limit 20)
    returning v.id, v.user_id, v.caption, v.poster_url`)).rows;
  for (const v of vids) {
    const a = (await q('select id, username, name, avatar_url, is_banned from profiles where id = $1', [v.user_id])).rows[0];
    if (!a || a.is_banned) continue;
    const fol = (await q(`select f.follower_id from follows f join profiles p on p.id = f.follower_id
      where f.followee_id = $1 and not p.is_banned and ${notBlockedSql('f.follower_id', '$1::uuid')}`, [v.user_id])).rows;
    for (const { follower_id: f } of fol) {
      // حدّ: إشعار واحد لكل صانع كل 30 دقيقة، ولا أكثر من إشعار فيديو كل 5 دقائق لنفس الشخص
      if (!(await throttle(f, 'v:' + v.user_id, 1800))) continue;
      if (!(await throttle(f, 'v', 300))) continue;
      await pushToUser(f, 'videos', { t: 'video', title: `${nameOf(a)} نشر فيديو جديد 🎬`, body: String(v.caption || '').slice(0, 120) || 'شاهده الآن', tag: 'v-' + v.user_id, url: `/#/watch/${v.id}`, icon: a.avatar_url || null, image: v.poster_url || null }, { ttl: 6 * 3600 });
    }
  }
  return vids.length;
}
let sweeping = false;
export function startPushSweeper(everyMs = Number(process.env.PUSH_SWEEP_MS) || 30000) {
  const tick = async () => { if (sweeping) return; sweeping = true; try { await sweepNewVideos(); } catch (e) { console.warn('[push] sweep', e.message); } finally { sweeping = false; } };
  setInterval(tick, everyMs).unref?.(); setTimeout(tick, 5000).unref?.();
}

// ---------- المسارات ----------
export function buildPushRouter() {
  const r = express.Router();
  r.get('/push/config', (_req, res) => res.json({ enabled: pushEnabled() && !!config.vapidPublic, publicKey: config.vapidPublic || '' }));
  r.get('/push/prefs', requireUser, h(async (req, res) => {
    const p = (await q('select push_prefs from profiles where id = $1', [req.user.id])).rows[0]?.push_prefs || {};
    const n = (await q('select count(*)::int as n from push_subscriptions where user_id = $1', [req.user.id])).rows[0].n;
    res.json({ prefs: Object.fromEntries(PUSH_TYPES.map((k) => [k, prefOn(p, k)])), devices: n });
  }));
  r.patch('/push/prefs', requireUser, h(async (req, res) => {
    const b = req.body || {}; const patch = {};
    for (const k of PUSH_TYPES) if (k in b) { if (typeof b[k] !== 'boolean') throw bad('bad'); patch[k] = b[k]; }
    const p = (await q('update profiles set push_prefs = push_prefs || $2::jsonb where id = $1 returning push_prefs', [req.user.id, JSON.stringify(patch)])).rows[0].push_prefs;
    res.json({ prefs: Object.fromEntries(PUSH_TYPES.map((k) => [k, prefOn(p, k)])) });
  }));
  r.post('/push/subscribe', requireUser, rl(60000, 20), h(async (req, res) => {
    if (!pushEnabled()) throw new HttpError(503, 'pushOff');
    const { endpoint, keys } = req.body || {};
    if (!validEndpoint(endpoint) || !b64ok(keys?.p256dh, 200) || !b64ok(keys?.auth, 64)) throw bad('bad');
    const ua = String(req.headers['user-agent'] || '').slice(0, 200);
    await q(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, ua) values ($1,$2,$3,$4,$5)
      on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fail_count = 0`, [req.user.id, endpoint, keys.p256dh, keys.auth, ua]);
    await q(`delete from push_subscriptions where user_id = $1 and id not in (select id from push_subscriptions where user_id = $1 order by created_at desc limit 10)`, [req.user.id]);
    res.status(201).json({ ok: true });
  }));
  r.post('/push/unsubscribe', requireUser, h(async (req, res) => {
    const e = req.body?.endpoint; if (typeof e !== 'string') throw bad('bad');
    const d = await q('delete from push_subscriptions where user_id = $1 and endpoint = $2', [req.user.id, e]);
    res.json({ ok: true, removed: d.rowCount });
  }));
  r.post('/push/test', requireUser, rl(60000, 3), h(async (req, res) => {
    const n = await pushToUser(req.user.id, 'system', { t: 'test', title: 'كليب كات 🔔', body: 'الإشعارات شغّالة على هذا الجهاز ✅', tag: 'ck-test', url: '/#/settings' }, { ttl: 300, force: true });
    res.json({ sent: n });
  }));
  return r;
}
