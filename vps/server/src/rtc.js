// البث المباشر (lives) والمكالمات الصوتية/المرئية (calls) فوق خادم LiveKit ذاتي الاستضافة.
// - الخادم يصدر رموز الدخول (JWT) من جلسة المستخدم، ويتحقق من الحظر والخصوصية قبل أي اتصال.
// - التعليقات والقلوب وعدّاد المشاهدين تمر عبر الخادم ثم تُبث لغرفة البث عبر قناة بيانات LiveKit.
// - الرنين/القبول/الرفض للمكالمات عبر Server-Sent Events (/api/events) ما دام الموقع مفتوحاً.
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import multer from 'multer';
import { AccessToken, RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';
import { config } from './config.js';
import { q } from './db.js';
import { requireUser } from './auth.js';
import { HttpError, bad, isUuid, str, ms } from './util.js';
import { PROFILE_COLS, mapProfile } from './mappers.js';
import { isBlockedBetween, canSeeUserContent } from './privacy.js';
import { dirs, rm, makePoster, sniffVideo } from './uploads.js';
import { analyze, kick as kickTranscoder } from './transcode.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (v) => { if (!v) throw new HttpError(404, 'notfound'); return v; };
const uid = (s) => { if (!isUuid(s)) throw bad('bad'); return s; };
export const rtcEnabled = () => !!(config.livekitUrl && config.livekitKey && config.livekitSecret && config.livekitApiUrl);
const requireRtc = (_req, _res, next) => (rtcEnabled() ? next() : next(new HttpError(503, 'rtcOff')));
const liveRoom = (id) => `live-${id}`;
const callRoom = (id) => `call-${id}`;

let svcClient = null;
export const svc = () => (svcClient ||= new RoomServiceClient(config.livekitApiUrl, config.livekitKey, config.livekitSecret));

async function token(identity, room, grant, { name = '', ttl = '4h', metadata } = {}) {
  const at = new AccessToken(config.livekitKey, config.livekitSecret, { identity, name, ttl, metadata });
  at.addGrant({ room, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false, ...grant });
  return at.toJwt();
}
const enc = new TextEncoder();
export async function sendLive(liveId, msg) {
  try { await svc().sendData(liveRoom(liveId), enc.encode(JSON.stringify(msg)), DataPacket_Kind.RELIABLE, { topic: 'ck' }); }
  catch (e) { if (!/not found|404/i.test(e.message)) console.warn('[live] sendData failed:', e.message); }
}

// ---------------- أحداث فورية للمستخدم (SSE) ----------------
const subs = new Map();   // userId -> Set(res)
export function emit(userId, type, data) {
  const set = subs.get(userId); if (!set?.size) return 0;
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(line); } catch {} }
  return set.size;
}
export const online = (userId) => !!subs.get(userId)?.size;

// ---------------- خرائط ----------------
const mapLive = (l, host, viewers) => ({ id: l.id, userId: l.user_id, title: l.title || '', status: l.status, startedAt: ms(l.started_at), endedAt: ms(l.ended_at), endReason: l.end_reason || null,
  viewers: viewers ?? viewerCounts.get(l.id) ?? 0, peakViewers: l.peak_viewers || 0, hearts: l.hearts_count || 0, giftCoins: Number(l.gift_coins || 0), giftDiamonds: Number(l.gift_diamonds || 0), savedVideoId: l.saved_video_id || null, host: host || null });
const mapLiveComment = (c, u) => ({ id: c.id, liveId: c.live_id, userId: c.user_id, text: c.text, createdAt: ms(c.created_at), user: u ? { id: u.id, name: u.name, username: u.username, avatar: u.avatar } : null });
const mapCall = (c) => ({ id: c.id, callerId: c.caller_id, calleeId: c.callee_id, kind: c.kind, status: c.status, createdAt: ms(c.created_at), answeredAt: ms(c.answered_at), endedAt: ms(c.ended_at) });
const profileOf = async (id) => mapProfile((await q(`select ${PROFILE_COLS} from profiles p where p.id = $1`, [id])).rows[0]);

// ---------------- حالة البث في الذاكرة (يحدّثها المراقب) ----------------
const viewerCounts = new Map();   // liveId -> عدد المشاهدين الآن
const hostSeen = new Map();       // liveId -> آخر وقت كان فيه المضيف متصلاً
const callSeen = new Map();       // callId -> آخر وقت كان فيه الطرفان معاً
const saving = new Set();

async function endLive(id, byId, reason) {
  const r = (await q("update lives set status = 'ended', ended_at = now(), ended_by = $2, end_reason = $3 where id = $1 and status = 'live' returning *", [id, byId, reason])).rows[0];
  if (!r) return null;
  await sendLive(id, { t: 'ended', reason });
  viewerCounts.delete(id); hostSeen.delete(id);
  setTimeout(() => svc().deleteRoom(liveRoom(id)).catch(() => {}), 2500).unref?.();
  console.log(`[live] ${id} ended (${reason})`);
  return r;
}

async function callNotify(c, text) {
  await q("insert into notifications (user_id, type, from_id, text) values ($1,'call',$2,$3)", [c.callee_id, c.caller_id, `${text}:${c.kind}`]).catch((e) => console.warn('[calls] notify failed:', e.message));
}
async function finishCall(c, status, notify) {
  const r = (await q(`update calls set status = $2, ended_at = now() where id = $1 and status in ('ringing','active') returning *`, [c.id, status])).rows[0];
  if (!r) return null;
  if (notify) await callNotify(r, notify);
  const data = { id: r.id, status: r.status };
  emit(r.caller_id, 'call-end', data); emit(r.callee_id, 'call-end', data);
  callSeen.delete(r.id);
  setTimeout(() => svc().deleteRoom(callRoom(r.id)).catch(() => {}), 1500).unref?.();
  return r;
}

// ---------------- المراقب: رنين منتهٍ، مكالمات مهجورة، مضيف انقطع ----------------
let reaping = false, lkWarned = false;
export async function reap() {
  if (reaping || !rtcEnabled()) return; reaping = true;
  try {
    const stale = (await q(`select * from calls where status = 'ringing' and created_at < now() - make_interval(secs => $1)`, [config.callRingSec])).rows;
    for (const c of stale) await finishCall(c, 'missed', 'missed');
    const now = Date.now();
    for (const c of (await q("select * from calls where status = 'active'")).rows) {
      let n = 2;
      try { n = (await svc().listParticipants(callRoom(c.id))).length; lkWarned = false; } catch (e) { if (!/not found|404/i.test(e.message)) { if (!lkWarned) console.warn('[rtc] LiveKit unreachable:', e.message); lkWarned = true; continue; } n = 0; }
      if (n >= 2) { callSeen.set(c.id, now); continue; }
      const since = callSeen.get(c.id) || ms(c.answered_at) || now;
      if (now - since > (n === 0 ? 30000 : 45000)) await finishCall(c, 'ended');
    }
    for (const l of (await q("select * from lives where status = 'live'")).rows) {
      let parts;
      try { parts = await svc().listParticipants(liveRoom(l.id)); lkWarned = false; } catch (e) { if (!/not found|404/i.test(e.message)) { if (!lkWarned) console.warn('[rtc] LiveKit unreachable:', e.message); lkWarned = true; continue; } parts = []; }
      const hostOn = parts.some((p) => p.identity === l.user_id);
      const n = parts.filter((p) => p.identity !== l.user_id).length;
      if (hostOn) hostSeen.set(l.id, now);
      if (viewerCounts.get(l.id) !== n) { viewerCounts.set(l.id, n); await sendLive(l.id, { t: 'viewers', n }); }
      if (n > (l.peak_viewers || 0)) await q('update lives set peak_viewers = $2 where id = $1 and peak_viewers < $2', [l.id, n]);
      const last = hostSeen.get(l.id) || ms(l.started_at);
      if (now - last > config.liveHostGraceSec * 1000) await endLive(l.id, null, 'disconnect');
    }
  } catch (e) { console.warn('[rtc] reap failed:', e.message); }
  finally { reaping = false; }
}
let reapTimer = null;
export function startRtc() {
  if (!rtcEnabled()) { console.log('[rtc] LiveKit not configured — live & calls disabled'); return; }
  if (reapTimer) return;
  reapTimer = setInterval(reap, config.rtcReapMs); reapTimer.unref?.();
  console.log('[rtc] live & calls enabled via', config.livekitUrl);
}

// ---------------- حفظ البث كمقطع: دمج المقاطع الأخيرة (≤ 180 ث) ثم خط التحويل المعتاد ----------------
const segUpload = (req, res, next) => multer({ storage: multer.diskStorage({ destination: dirs.tmp, filename: (_r, _f, cb) => cb(null, crypto.randomBytes(16).toString('hex')) }), limits: { fileSize: 120 * 1048576, files: 6, fields: 4 } })
  .array('seg', 6)(req, res, (err) => next(err ? (err.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, 'tooLarge') : bad('bad')) : undefined));
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
function ffmpeg(args, timeout) {
  const cmd = config.transcodeNice ? 'nice' : 'ffmpeg'; const a = config.transcodeNice ? ['-n', '10', 'ffmpeg', ...args] : args;
  return new Promise((resolve, reject) => execFile(cmd, a, { timeout, maxBuffer: 4 << 20 }, (err, _o, se) => (err ? reject(Object.assign(err, { stderr: String(se || '').slice(-600) })) : resolve())));
}
export async function concatSegments(files, durs, out, maxSec = config.maxVideoSec) {
  const infos = await Promise.all(files.map(analyze));
  const first = infos.find((i) => i?.video)?.video; if (!first) throw new Error('no video');
  let w = first.width, hgt = first.height; if (Math.abs(first.rotation) % 180 === 90) [w, hgt] = [hgt, w];
  const f = Math.min(1, 720 / Math.min(w, hgt), 1280 / Math.max(w, hgt)); const W = even(w * f), H = even(hgt * f);
  const args = ['-y', '-v', 'error']; const chains = []; const labels = [];
  files.forEach((file) => args.push('-i', file));
  let extra = files.length;
  infos.forEach((info, i) => {
    if (!info?.video) return;
    chains.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:out_range=tv,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
    let a = `${i}:a`;
    if (!info.audio) { args.push('-f', 'lavfi', '-t', String(Math.max(0.5, durs[i] || 1)), '-i', 'anullsrc=r=48000:cl=stereo'); a = `${extra++}:a`; }
    chains.push(`[${a}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
  });
  const total = durs.reduce((s, d) => s + (d || 0), 0); const skip = Math.max(0, total - maxSec);
  args.push('-filter_complex', `${chains.join(';')};${labels.join('')}concat=n=${labels.length}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]');
  if (skip > 0.05) args.push('-ss', skip.toFixed(2));
  args.push('-t', String(maxSec + 0.5), '-c:v', 'libx264', '-preset', config.transcodePreset, '-crf', String(config.transcodeCrf), '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-threads', String(config.transcodeThreads), out);
  await ffmpeg(args, 15 * 60000);
  return { width: W, height: H, skip };
}
async function saveLiveClip(live, files, durs) {
  const id = crypto.randomUUID(); const owner = live.user_id;
  const vdir = path.join(dirs.videos, owner); fs.mkdirSync(vdir, { recursive: true });
  const part = path.join(vdir, `.${id}.live.part.mp4`), final = path.join(vdir, `${id}.mp4`);
  try {
    await concatSegments(files, durs, part);
    fs.renameSync(part, final);
    const pdir = path.join(dirs.images, owner); fs.mkdirSync(pdir, { recursive: true });
    const pname = `poster-${id}.jpg`; const hasPoster = await makePoster(final, path.join(pdir, pname));
    const url = `/uploads/videos/${owner}/${id}.mp4`;
    const caption = (live.title || '').trim() || 'من البث المباشر';
    await q(`insert into videos (id, user_id, video_path, video_url, poster_url, caption, hashtags, status, media_status, poster_auto) values ($1,$2,$3,$3,$4,$5,$6,'published','processing',true)`,
      [id, owner, url, hasPoster ? `/uploads/images/${owner}/${pname}` : null, caption, ['بث_مباشر']]);
    await q('update lives set saved_video_id = $2 where id = $1', [live.id, id]);
    kickTranscoder();     // يمر عبر خط التحويل المعتاد (فحص، تحويل عند الحاجة، ثم الإظهار)
    emit(owner, 'live-saved', { liveId: live.id, videoId: id });
    console.log(`[live] ${live.id} saved as clip ${id}`);
  } catch (e) {
    rm(part); rm(final);
    console.warn('[live] save failed:', e.message, e.stderr || '');
    emit(owner, 'live-saved', { liveId: live.id, error: 'failed' });
  } finally { files.forEach(rm); saving.delete(live.id); }
}

// ---------------- صلاحية الاتصال ----------------
export async function callPolicy(a, b) {
  if (a === b) return { ok: false, reason: 'self' };
  const r = (await q(`select (select is_banned from profiles where id = $2) as banned,
      exists (select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)) as blocked,
      exists (select 1 from follows where follower_id = $1 and followee_id = $2) and exists (select 1 from follows where follower_id = $2 and followee_id = $1) as mutual,
      exists (select 1 from conversations where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)) as conv`, [a, b])).rows[0];
  if (!r || r.banned === null) return { ok: false, reason: 'notfound' };
  if (r.banned || r.blocked) return { ok: false, reason: 'blocked' };
  if (!r.mutual && !r.conv) return { ok: false, reason: 'notAllowed' };
  return { ok: true };
}

// بث يحق للمستخدم رؤيته (خصوصية + حظر) — يُستخدم أيضاً في الهدايا
export async function visibleLive(req, id) {
  const l = need((await q('select * from lives where id = $1', [uid(id)])).rows[0]);
  const viewer = req.user?.id || null;
  if (viewer !== l.user_id && !req.user?.is_admin && (!(await canSeeUserContent(req.user, l.user_id)) || (viewer && await isBlockedBetween(viewer, l.user_id)))) throw new HttpError(404, 'notfound');
  return l;
}

export function buildRtcRouter() {
  const r = express.Router();
  r.get('/rtc/config', (_req, res) => res.json({ enabled: rtcEnabled(), url: rtcEnabled() ? config.livekitUrl : '', maxSec: config.maxVideoSec, ringSec: config.callRingSec, turnTlsPort: config.turnTlsPort }));

  // ---- SSE ----
  r.get('/events', requireUser, h(async (req, res) => {
    const me = req.user.id;
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.flushHeaders?.(); res.write('retry: 3000\n\n');
    if (!subs.has(me)) subs.set(me, new Set());
    subs.get(me).add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(ping); const s = subs.get(me); s?.delete(res); if (s && !s.size) subs.delete(me); });
    // مكالمة ترنّ الآن (فُتح الموقع أثناء الرنين)
    const ringing = (await q(`select * from calls where callee_id = $1 and status = 'ringing' and created_at > now() - make_interval(secs => $2) order by created_at desc limit 1`, [me, config.callRingSec])).rows[0];
    if (ringing) res.write(`event: call\ndata: ${JSON.stringify({ call: mapCall(ringing), from: await profileOf(ringing.caller_id) })}\n\n`);
  }));

  // ---------------- البث المباشر ----------------
  r.get('/live', h(async (req, res) => {
    const me = req.user?.id || null;
    const rows = (await q(`select l.* from lives l join profiles p on p.id = l.user_id
      where l.status = 'live' and not p.is_banned
        and (l.user_id = $1::uuid or ((not p.is_private or exists (select 1 from follows f where f.follower_id = $1::uuid and f.followee_id = l.user_id))
        and not exists (select 1 from blocks b where (b.blocker_id = l.user_id and b.blocked_id = $1::uuid) or (b.blocker_id = $1::uuid and b.blocked_id = l.user_id))))
      order by (exists (select 1 from follows f where f.follower_id = $1::uuid and f.followee_id = l.user_id)) desc, l.started_at desc limit 30`, [me])).rows;
    const hosts = rows.length ? new Map((await q(`select ${PROFILE_COLS} from profiles p where p.id = any($1::uuid[])`, [rows.map((l) => l.user_id)])).rows.map((p) => [p.id, mapProfile(p)])) : new Map();
    res.json({ enabled: rtcEnabled(), lives: rows.map((l) => mapLive(l, hosts.get(l.user_id))) });
  }));
  r.get('/live/mine', requireUser, h(async (req, res) => {
    const l = (await q("select * from lives where user_id = $1 and status = 'live'", [req.user.id])).rows[0];
    res.json({ live: l ? mapLive(l) : null });
  }));
  r.post('/live', requireUser, requireRtc, h(async (req, res) => {
    const me = req.user.id; const title = str(req.body?.title, 120);
    const prev = (await q("select id from lives where user_id = $1 and status = 'live'", [me])).rows[0];
    if (prev) await endLive(prev.id, me, 'restart');
    const l = (await q('insert into lives (user_id, title) values ($1,$2) returning *', [me, title])).rows[0];
    hostSeen.set(l.id, Date.now());
    await svc().createRoom({ name: liveRoom(l.id), emptyTimeout: 300, departureTimeout: 60, maxParticipants: config.liveMaxViewers + 1 }).catch((e) => console.warn('[live] createRoom:', e.message));
    // إشعار المتابعين (مرة كل 30 دقيقة على الأكثر لكل مضيف) + تنبيه فوري لمن الموقع مفتوح لديهم
    const fol = (await q(`insert into notifications (user_id, type, from_id, text)
      select f.follower_id, 'live', $1, $2 from follows f
      where f.followee_id = $1 and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = f.follower_id) or (b.blocker_id = f.follower_id and b.blocked_id = $1))
        and not exists (select 1 from notifications n where n.user_id = f.follower_id and n.type = 'live' and n.from_id = $1 and n.created_at > now() - interval '30 minutes')
      returning user_id`, [me, l.id])).rows;
    const host = await profileOf(me);
    for (const f of fol) emit(f.user_id, 'live', { live: mapLive(l, host) });
    res.status(201).json({ live: mapLive(l, host), url: config.livekitUrl, token: await token(me, liveRoom(l.id), { canPublish: true, canPublishData: false }, { name: host.name, ttl: '6h' }) });
  }));
  r.get('/live/:id', h(async (req, res) => {
    const l = await visibleLive(req, req.params.id);
    const host = await profileOf(l.user_id);
    const rows = (await q(`select c.* from live_comments c where c.live_id = $1 and c.deleted_at is null and ${'not exists (select 1 from blocks b where (b.blocker_id = c.user_id and b.blocked_id = $2::uuid) or (b.blocker_id = $2::uuid and b.blocked_id = c.user_id))'} order by c.created_at desc limit 40`, [l.id, req.user?.id || null])).rows.reverse();
    const users = rows.length ? new Map((await q(`select ${PROFILE_COLS} from profiles p where p.id = any($1::uuid[])`, [[...new Set(rows.map((c) => c.user_id))]])).rows.map((p) => [p.id, mapProfile(p)])) : new Map();
    res.json({ live: mapLive(l, host), comments: rows.map((c) => mapLiveComment(c, users.get(c.user_id))), isHost: req.user?.id === l.user_id, canModerate: req.user?.id === l.user_id || !!req.user?.is_admin });
  }));
  r.post('/live/:id/join', requireRtc, mkJoinLimit(), h(async (req, res) => {
    const l = await visibleLive(req, req.params.id);
    if (l.status !== 'live') throw new HttpError(410, 'ended');
    const me = req.user?.id || null;
    if (me === l.user_id) return res.json({ url: config.livekitUrl, token: await token(me, liveRoom(l.id), { canPublish: true }, { ttl: '6h' }), role: 'host' });
    if ((viewerCounts.get(l.id) || 0) >= config.liveMaxViewers) throw new HttpError(429, 'full');
    const identity = `${me || 'g'}.${crypto.randomBytes(3).toString('hex')}`;
    res.json({ url: config.livekitUrl, role: 'viewer', token: await token(identity, liveRoom(l.id), { canPublish: false, canPublishData: false, hidden: true }, { ttl: '6h' }) });
  }));
  r.post('/live/:id/comments', requireUser, rl(60000, 20), h(async (req, res) => {
    const l = await visibleLive(req, req.params.id);
    if (l.status !== 'live') throw new HttpError(410, 'ended');
    const text = str(req.body?.text, 200); if (!text) throw bad('empty');
    const c = (await q('insert into live_comments (live_id, user_id, text) values ($1,$2,$3) returning *', [l.id, req.user.id, text])).rows[0];
    const out = mapLiveComment(c, await profileOf(req.user.id));
    await sendLive(l.id, { t: 'comment', c: out });
    res.status(201).json(out);
  }));
  r.delete('/live/:id/comments/:cid', requireUser, h(async (req, res) => {
    const l = need((await q('select * from lives where id = $1', [uid(req.params.id)])).rows[0]);
    const c = need((await q('select * from live_comments where id = $1 and live_id = $2', [uid(req.params.cid), l.id])).rows[0]);
    if (![l.user_id, c.user_id].includes(req.user.id) && !req.user.is_admin) throw new HttpError(403, 'forbidden');
    await q('update live_comments set deleted_at = now() where id = $1 and deleted_at is null', [c.id]);
    await sendLive(l.id, { t: 'comment-del', ids: [c.id] });
    res.json({ ok: true });
  }));
  r.post('/live/:id/hearts', rl(10000, 30), h(async (req, res) => {
    const l = await visibleLive(req, req.params.id);
    if (l.status !== 'live') throw new HttpError(410, 'ended');
    const n = Math.max(1, Math.min(20, Number(req.body?.n) | 0 || 1));
    await q('update lives set hearts_count = hearts_count + $2 where id = $1', [l.id, n]);
    await sendLive(l.id, { t: 'hearts', n, from: req.user?.id || null });
    res.json({ ok: true });
  }));
  // المضيف يحظر مشاهداً: حظر عام (blocks) + إخراجه فوراً + إخفاء تعليقاته في هذا البث
  r.post('/live/:id/block', requireUser, h(async (req, res) => {
    const l = need((await q('select * from lives where id = $1', [uid(req.params.id)])).rows[0]);
    if (req.user.id !== l.user_id && !req.user.is_admin) throw new HttpError(403, 'forbidden');
    const target = uid(req.body?.userId); if (target === l.user_id) throw bad('self');
    if (req.user.id === l.user_id) await q('insert into blocks (blocker_id, blocked_id) values ($1,$2) on conflict do nothing', [l.user_id, target]);
    const del = (await q('update live_comments set deleted_at = now() where live_id = $1 and user_id = $2 and deleted_at is null returning id', [l.id, target])).rows.map((x) => x.id);
    if (del.length) await sendLive(l.id, { t: 'comment-del', ids: del });
    try {
      const parts = await svc().listParticipants(liveRoom(l.id));
      await Promise.all(parts.filter((p) => p.identity.startsWith(target + '.')).map((p) => svc().removeParticipant(liveRoom(l.id), p.identity).catch(() => {})));
    } catch {}
    res.json({ ok: true, removedComments: del.length });
  }));
  r.post('/live/:id/end', requireUser, h(async (req, res) => {
    const l = need((await q('select * from lives where id = $1', [uid(req.params.id)])).rows[0]);
    if (req.user.id !== l.user_id && !req.user.is_admin) throw new HttpError(403, 'forbidden');
    const ended = await endLive(l.id, req.user.id, req.user.id === l.user_id ? 'host' : 'admin');
    res.json({ ok: true, live: mapLive(ended || l) });
  }));
  r.post('/live/:id/save', requireUser, segUpload, h(async (req, res) => {
    const files = (req.files || []).map((f) => f.path);
    try {
      const l = need((await q('select * from lives where id = $1', [uid(req.params.id)])).rows[0]);
      if (req.user.id !== l.user_id) throw new HttpError(403, 'forbidden');
      if (l.saved_video_id || saving.has(l.id)) throw new HttpError(409, 'alreadySaved');
      if (l.status === 'live') await endLive(l.id, req.user.id, 'host');
      else if (Date.now() - ms(l.ended_at) > 2 * 3600000) throw new HttpError(410, 'tooLate');
      if (!files.length) throw bad('noFile');
      for (const f of files) if (!sniffVideo(f)) throw bad('badFile');
      let durs = []; try { durs = JSON.parse(req.body?.durs || '[]'); } catch {}
      durs = files.map((_, i) => Math.max(0, Math.min(400, Number(durs[i]) || 0)));
      saving.add(l.id);
      const own = files.splice(0);
      setImmediate(() => saveLiveClip(l, own, durs));
      res.status(202).json({ ok: true, queued: true });
    } finally { files.forEach(rm); }
  }));

  // ---------------- المكالمات ----------------
  r.get('/calls/can/:uid', requireUser, h(async (req, res) => { const p = await callPolicy(req.user.id, uid(req.params.uid)); res.json({ enabled: rtcEnabled(), can: rtcEnabled() && p.ok, reason: p.reason || null }); }));
  r.post('/calls', requireUser, requireRtc, rl(60000, 12), h(async (req, res) => {
    const me = req.user.id; const to = uid(req.body?.to); const kind = req.body?.kind === 'video' ? 'video' : 'audio';
    const p = await callPolicy(me, to); if (!p.ok) throw new HttpError(403, p.reason);
    // مكالمات قديمة مفتوحة لي (تبويب أُغلق مثلاً) تُغلق قبل بدء مكالمة جديدة
    for (const c of (await q("select * from calls where (caller_id = $1 or callee_id = $1) and status in ('ringing','active')", [me])).rows) {
      if (c.status === 'active') await finishCall(c, 'ended'); else await finishCall(c, c.caller_id === me ? 'cancelled' : 'declined', 'missed');
    }
    const busy = (await q("select 1 from calls where (caller_id = $1 or callee_id = $1) and status in ('ringing','active') and created_at > now() - interval '4 hours'", [to])).rowCount;
    const c = (await q('insert into calls (caller_id, callee_id, kind, status) values ($1,$2,$3,$4) returning *', [me, to, kind, busy ? 'missed' : 'ringing'])).rows[0];
    if (busy) { c.ended_at = new Date(); await q('update calls set ended_at = now() where id = $1', [c.id]); await callNotify(c, 'missed'); throw new HttpError(409, 'busy'); }
    await svc().createRoom({ name: callRoom(c.id), emptyTimeout: 60, departureTimeout: 20, maxParticipants: 2 }).catch((e) => console.warn('[calls] createRoom:', e.message));
    const from = await profileOf(me);
    const delivered = emit(to, 'call', { call: mapCall(c), from });
    res.status(201).json({ call: mapCall(c), delivered: delivered > 0, peer: await profileOf(to), url: config.livekitUrl, token: await token(me, callRoom(c.id), { canPublish: true }, { name: from.name, ttl: '4h' }) });
  }));
  const myCall = async (req) => {
    const c = need((await q('select * from calls where id = $1', [uid(req.params.id)])).rows[0]);
    if (c.caller_id !== req.user.id && c.callee_id !== req.user.id) throw new HttpError(404, 'notfound');
    return c;
  };
  r.get('/calls/:id', requireUser, h(async (req, res) => res.json({ call: mapCall(await myCall(req)) })));
  r.post('/calls/:id/accept', requireUser, requireRtc, h(async (req, res) => {
    const c = await myCall(req); if (c.callee_id !== req.user.id) throw new HttpError(403, 'forbidden');
    if (await isBlockedBetween(c.caller_id, c.callee_id)) throw new HttpError(403, 'blocked');
    const a = (await q("update calls set status = 'active', answered_at = now() where id = $1 and status = 'ringing' returning *", [c.id])).rows[0];
    if (!a) throw new HttpError(410, 'callOver');
    callSeen.set(a.id, Date.now());
    emit(a.caller_id, 'call-accepted', { id: a.id }); emit(a.callee_id, 'call-handled', { id: a.id });
    res.json({ call: mapCall(a), peer: await profileOf(a.caller_id), url: config.livekitUrl, token: await token(req.user.id, callRoom(a.id), { canPublish: true }, { ttl: '4h' }) });
  }));
  r.post('/calls/:id/decline', requireUser, h(async (req, res) => {
    const c = await myCall(req); if (c.callee_id !== req.user.id) throw new HttpError(403, 'forbidden');
    const d = await finishCall(c, 'declined', 'missed');
    res.json({ ok: !!d });
  }));
  r.post('/calls/:id/cancel', requireUser, h(async (req, res) => {
    const c = await myCall(req); if (c.caller_id !== req.user.id) throw new HttpError(403, 'forbidden');
    const d = c.status === 'ringing' ? await finishCall(c, 'cancelled', 'missed') : null;
    res.json({ ok: !!d });
  }));
  r.post('/calls/:id/end', requireUser, h(async (req, res) => {
    const c = await myCall(req);
    const d = await finishCall(c, c.status === 'ringing' ? (c.caller_id === req.user.id ? 'cancelled' : 'declined') : 'ended', c.status === 'ringing' ? 'missed' : null);
    res.json({ ok: !!d });
  }));
  return r;
}

// حدود معدل خفيفة لمسارات البث والمكالمات
function rl(windowMs, max) { return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.id || req.ip, handler: (_req, res) => res.status(429).json({ error: 'slowDown' }) }); }
function mkJoinLimit() { return rl(60000, 30); }
