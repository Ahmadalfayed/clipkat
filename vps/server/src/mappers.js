import { ms } from './util.js';

export const PROFILE_COLS = `p.id, p.username, p.name, p.bio, p.avatar_url, p.is_admin, p.is_private, p.created_at,
  (select count(*)::int from follows f where f.followee_id = p.id) as followers_count,
  (select count(*)::int from follows f where f.follower_id = p.id) as following_count`;
export const VIDEO_COLS = `v.id, v.user_id, v.video_url, v.poster_url, v.caption, v.hashtags, v.sound, v.sound_id, v.status, v.scheduled_at, v.source_clip_id, v.remix_type, v.media_status, v.created_at, v.shares_count, v.views_count,
  (select count(*)::int from videos r where r.source_clip_id = v.id and not r.is_hidden and r.status = 'published' and r.media_status <> 'processing') as remix_count,
  (select count(*)::int from likes l where l.video_id = v.id) as likes_count,
  (select count(*)::int from comments c where c.video_id = v.id) as comments_count,
  (select count(*)::int from saves s where s.video_id = v.id) as saves_count,
  array(select vp.product_id from video_products vp where vp.video_id = v.id) as product_ids`;

export const mapProfile = (p) => p && ({ id: p.id, username: p.username, name: p.name || p.username, bio: p.bio || '', avatar: p.avatar_url || null, role: p.is_admin ? 'admin' : 'user', createdAt: ms(p.created_at), followersCount: p.followers_count, followingCount: p.following_count, isPrivate: !!p.is_private });
export const mapVideo = (v) => ({ id: v.id, userId: v.user_id, src: v.video_url, poster: v.poster_url, caption: v.caption || '', hashtags: v.hashtags || [], sound: v.sound, soundId: v.sound_id || null, status: v.status || 'published', scheduledAt: ms(v.scheduled_at), sourceClipId: v.source_clip_id || null, remixType: v.remix_type || null, mediaStatus: v.media_status || 'ready', remixCount: v.remix_count || 0, productIds: v.product_ids || [], createdAt: ms(v.created_at),
  base: { likes: v.likes_count, comments: v.comments_count, saves: v.saves_count, shares: v.shares_count, views: v.views_count } });
export const mapStore = (s) => s && ({ id: s.id, ownerId: s.owner_id, name: s.name, category: s.category, description: s.description || '', contact: s.contact_url || '', logo: s.logo_url || null, banner: s.banner_url || null, planId: s.plan_id, featured: !!s.featured, verified: !!s.verified, createdAt: ms(s.created_at), expiresAt: ms(s.expires_at) });
export const mapProduct = (p) => p && ({ id: p.id, storeId: p.store_id, name: p.name, price: Number(p.price), stock: p.stock, image: p.image_url || null, description: p.description || '', createdAt: ms(p.created_at) });
export const mapRental = (r) => ({ id: r.id, storeId: r.store_id, ownerId: r.owner_id, planId: r.plan_id, amount: Number(r.amount), method: r.method || 'card', ref: r.gateway_ref || r.id.slice(0, 8), status: r.status, paidAt: ms(r.created_at), startAt: ms(r.start_at), endAt: ms(r.end_at) });
export const SOUND_COLS = `s.id, s.user_id, s.title, s.audio_url, s.duration_ms, s.source_video_id, s.uses_count, s.created_at`;
export const mapSound = (x) => x && ({ id: x.id, userId: x.user_id, title: x.title, src: x.audio_url, durationMs: x.duration_ms, sourceVideoId: x.source_video_id, usesCount: x.uses_count, createdAt: ms(x.created_at) });
export const mapComment = (c) => ({ id: c.id, videoId: c.video_id, userId: c.user_id, parentId: c.parent_id || null, text: c.text, createdAt: ms(c.created_at) });
export const mapNotif = (n) => ({ id: n.id, userId: n.user_id, type: n.type, fromId: n.from_id, videoId: n.video_id, text: n.text, read: n.read, createdAt: ms(n.created_at) });
