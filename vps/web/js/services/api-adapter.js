// ===== ApiAdapter: نفس واجهة LocalAdapter فوق الخادم الذاتي (Node + PostgreSQL) =====
// يُحمَّل تلقائياً عندما يستجيب /api/health (انظر js/services/index.js).
// الأمان الحقيقي في الخادم (server/src) وليس هنا: المتصفح لا يستطيع تفعيل إيجار ولا ترقية نفسه.
import { PLANS, SLOTS, MAX_VIDEO_MB } from '../config.js';
import { POLICY } from '../policy-text.js';

const DAY = 86400000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dataURLToBlob(url) {
  const [head, b64] = url.split(','); const mime = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function createApiAdapter({ base = '', health = true } = {}) {
  const a = new ApiAdapter(base);
  const cfg = await a._req('GET', '/config');          // يرمي خطأ إن لم يكن الخادم متاحاً
  a.maxVideoMb = cfg.maxVideoMb || MAX_VIDEO_MB;
  a.maxSoundMb = cfg.maxSoundMb || 8;
  a.maxSoundSec = cfg.maxSoundSec || 60;
  a.maxVideoSec = cfg.maxVideoSec || 180;
  return a;
}

export class ApiAdapter {
  constructor(base = '') {
    this.base = base.replace(/\/$/, '') + '/api'; this.mode = 'api'; this.social = true; this.lastFollow = null; this.commentMeta = {};
    this.profiles = new Map(); this.videos = new Map();
    this._me = undefined; this._mine = null; this.maxVideoMb = MAX_VIDEO_MB;
  }
  async init() {}
  async resetDemo() { /* غير متاح في وضع الخادم */ }

  async _req(method, path, body, { form, timeout = 30000 } = {}) {
    const opt = { method, credentials: 'same-origin', headers: { 'X-CK': '1' } };
    if (form) opt.body = form; else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), form ? 10 * 60000 : timeout); opt.signal = ctl.signal;
    let res;
    try { res = await fetch(this.base + path, opt); } finally { clearTimeout(tm); }
    let json = null; try { json = await res.json(); } catch { /* ليس JSON */ }
    if (!res.ok) { const e = new Error(json?.error || 'failed'); e.status = res.status; if (json?.limit) e.limit = json.limit; throw e; }
    return json;
  }
  _qs(o) { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; }

  // ---------- Uploads ----------
  async _img(value) {
    if (!value || typeof value !== 'string' || !value.startsWith('data:')) return value;
    const fd = new FormData(); fd.append('file', dataURLToBlob(value), 'image.jpg');
    return (await this._req('POST', '/upload/image', undefined, { form: fd })).url;
  }

  // ---------- Auth ----------
  async currentUser() {
    if (this._me !== undefined) return this._me;
    this._me = (await this._req('GET', '/auth/me')).user; if (this._me) this.profiles.set(this._me.id, this._me);
    return this._me;
  }
  async _meOrThrow() { const u = await this.currentUser(); if (!u) throw new Error('auth'); return u; }
  async signUp({ email, username, name, password }) {
    username = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(username)) throw new Error('username');
    if (String(password).length < 8) throw new Error('password');
    const { user } = await this._req('POST', '/auth/signup', { email, username, name, password });
    this._me = user; this._mine = null; this.profiles.set(user.id, user); return user;
  }
  async login(email, password) {
    const { user } = await this._req('POST', '/auth/login', { email, password });
    this._me = user; this._mine = null; this.profiles.set(user.id, user); return user;
  }
  async logout() { try { await this._req('POST', '/auth/logout', {}); } finally { this._me = null; this._mine = null; } }

  // ---------- Profiles ----------
  async _profile(id, fresh = false) {
    if (!id || !UUID_RE.test(id)) return null;
    if (!fresh && this.profiles.has(id)) return this.profiles.get(id);
    const p = await this._req('GET', '/users/' + id); if (p) this.profiles.set(id, p); return p;
  }
  async _prefetchProfiles(ids) {
    const need = [...new Set(ids.filter((i) => i && UUID_RE.test(i) && !this.profiles.has(i)))]; if (!need.length) return;
    for (const p of await this._req('GET', '/users/by-ids' + this._qs({ ids: need.join(',') }))) this.profiles.set(p.id, p);
  }
  async getUser(id) { return this._profile(id); }
  async listUsers() { return this._req('GET', '/users'); }
  async updateProfile(patch) {
    await this._meOrThrow(); const body = {};
    if (patch.name !== undefined) body.name = String(patch.name).slice(0, 40);
    if (patch.bio !== undefined) body.bio = String(patch.bio).slice(0, 160);
    if (patch.avatar !== undefined) body.avatar = await this._img(patch.avatar);
    this._me = await this._req('PATCH', '/users/me', body); this.profiles.set(this._me.id, this._me); return this._me;
  }
  async isFollowing(a, b) { if (!a || !b) return false; return (await this._req('GET', '/follows/check' + this._qs({ a, b }))).following; }
  async toggleFollow(id) { await this._meOrThrow(); const r = await this._req('POST', `/users/${id}/follow`, {}); this.lastFollow = r; this.profiles.delete(id); return r.following; }
  async userStats(id) { this.profiles.delete(id); return this._req('GET', `/users/${id}/stats`); }

  // ---------- Videos ----------
  _mapVideo(v) { const o = this.videos.get(v.id) || {}; Object.assign(o, v); this.videos.set(v.id, o); return o; }
  async _vids(rows) { await this._prefetchProfiles(rows.map((r) => r.userId)); return rows.map((v) => this._mapVideo(v)); }
  async listVideos({ tab = 'foryou', userId, tag, savedBy, likedBy, productStoreId, soundId } = {}) {
    return this._vids(await this._req('GET', '/videos' + this._qs({ tab, userId, tag, savedBy, likedBy, productStoreId, soundId })));
  }
  async getVideo(id) {
    if (!id || !UUID_RE.test(id)) return null; if (this.videos.has(id)) return this.videos.get(id);
    const v = await this._req('GET', '/videos/' + id); return v ? (await this._vids([v]))[0] : null;
  }
  async videoURL(v) { return v.src; }
  async createVideo({ file, poster, caption = '', hashtags = [], sound, soundId, saveSound = false, productIds = [] }) {
    await this._meOrThrow();
    if (file.size > this.maxVideoMb * 1024 * 1024) { const e = new Error('tooLarge'); e.limit = this.maxVideoMb; throw e; }
    const fd = new FormData();
    fd.append('file', file, file.name || 'video.mp4');
    if (poster) fd.append('poster', dataURLToBlob(poster), 'poster.jpg');
    fd.append('caption', caption.slice(0, 300)); fd.append('hashtags', JSON.stringify(hashtags)); fd.append('productIds', JSON.stringify(productIds));
    if (sound) fd.append('sound', String(sound).slice(0, 80));
    if (soundId) fd.append('soundId', soundId);
    if (saveSound) fd.append('saveSound', '1');
    return (await this._vids([await this._req('POST', '/videos', undefined, { form: fd })]))[0];
  }
  async _loadMine() {
    if (this._mine) return this._mine;
    const me = await this.currentUser(); if (!me) return { likes: new Set(), saves: new Set() };
    const r = await this._req('GET', '/me/interactions'); this._mine = { likes: new Set(r.likes), saves: new Set(r.saves) }; return this._mine;
  }
  async videoStats(v) {
    const mine = await this._loadMine(); const b = (this.videos.get(v.id) || v).base || {};
    return { likes: b.likes || 0, comments: b.comments || 0, saves: b.saves || 0, shares: b.shares || 0, liked: mine.likes.has(v.id), saved: mine.saves.has(v.id) };
  }
  async _toggle(path, set, id) {
    await this._meOrThrow(); const mine = await this._loadMine();
    const r = await this._req('POST', `/videos/${id}/${path}`, {});
    if (r.on) mine[set].add(id); else mine[set].delete(id);
    if (r.video) this._mapVideo(r.video);
    return r.on;
  }
  async toggleLike(id) { return this._toggle('like', 'likes', id); }
  async setLike(id) { const mine = await this._loadMine(); if (!mine.likes.has(id)) await this.toggleLike(id); return true; }
  async toggleSave(id) { return this._toggle('save', 'saves', id); }
  async recordShare(id) { await this._req('POST', `/videos/${id}/share`, {}); const v = this.videos.get(id); if (v?.base) v.base.shares++; }

  // ---------- Comments ----------
  async listComments(videoId) {
    const r = await this._req('GET', `/videos/${videoId}/comments`); for (const u of r.users) this.profiles.set(u.id, u); this.commentMeta[videoId] = { canComment: r.canComment, policy: r.policy }; return r.comments;
  }
  async addComment(videoId, text, parentId = null) {
    await this._meOrThrow(); text = String(text).trim().slice(0, 300); if (!text) throw new Error('empty');
    const c = await this._req('POST', `/videos/${videoId}/comments`, parentId ? { text, parentId } : { text });
    const v = this.videos.get(videoId); if (v?.base) v.base.comments++;
    return c;
  }

  async deleteComment(id, videoId) { await this._req('DELETE', '/comments/' + id); const v = this.videos.get(videoId); if (v?.base) v.base.comments = Math.max(0, v.base.comments - 1); }

  // ---------- Settings / privacy / blocks / reports (المرحلة 1) ----------
  async getProfileFresh(id) { this.profiles.delete(id); return this._profile(id, true); }
  async getSettings() { return this._req('GET', '/me/settings'); }
  async updateSettings(patch) { return this._req('PATCH', '/me/settings', patch); }
  async changePassword(current, next) { return this._req('POST', '/auth/password', { current, next }); }
  async logoutAll() { try { await this._req('POST', '/auth/logout-all', {}); } finally { this._me = null; this._mine = null; } }
  async listFollowRequests() { const rows = await this._req('GET', '/me/follow-requests'); for (const p of rows) this.profiles.set(p.id, p); return rows; }
  async respondFollowRequest(id, accept) { return this._req('POST', `/me/follow-requests/${id}/${accept ? 'accept' : 'decline'}`, {}); }
  async removeFollower(id) { return this._req('DELETE', '/me/followers/' + id); }
  async listBlocks() { return this._req('GET', '/me/blocks'); }
  async block(id) { const r = await this._req('POST', `/users/${id}/block`, {}); this.profiles.delete(id); this.videos.clear(); return r; }
  async unblock(id) { const r = await this._req('DELETE', `/users/${id}/block`); this.profiles.delete(id); return r; }
  async report({ type, id, reason, details = '' }) { return this._req('POST', '/reports', { type, id, reason, details: String(details).slice(0, 500) }); }
  async adminReports(status = 'open') { const r = await this._req('GET', '/admin/reports' + this._qs({ status })); for (const u of r.users) this.profiles.set(u.id, u); return r; }
  async resolveReport(id, action) { return this._req('POST', `/admin/reports/${id}/resolve`, { action }); }

  // ---------- Sounds ----------
  async listSounds() { return this._req('GET', '/sounds'); }
  async getSound(id) { if (!id || !UUID_RE.test(id)) return null; return this._req('GET', '/sounds/' + id); }
  async listSoundVideos(id) { return this._vids(await this._req('GET', `/sounds/${id}/videos`)); }
  async uploadSound({ file, title }) {
    await this._meOrThrow();
    if (file.size > (this.maxSoundMb || 8) * 1024 * 1024) { const e = new Error('tooLarge'); e.limit = this.maxSoundMb; throw e; }
    const fd = new FormData(); fd.append('file', file, file.name || 'sound'); fd.append('title', String(title || '').slice(0, 80));
    return this._req('POST', '/sounds', undefined, { form: fd });
  }
  async extractSound(videoId, title) { return this._req('POST', `/videos/${videoId}/extract-sound`, { title: title || '' }); }

  // ---------- Discover ----------
  async trendingTags(n = 10) { return this._req('GET', '/tags/trending' + this._qs({ n })); }
  async topCreators(n = 8) { const rows = await this._req('GET', '/creators/top' + this._qs({ n })); for (const p of rows) this.profiles.set(p.id, p); return rows; }
  async search(q) {
    const s = String(q || '').trim(); if (!s) return { users: [], tags: [], videos: [], stores: [] };
    const r = await this._req('GET', '/search' + this._qs({ q: s })); for (const u of r.users) this.profiles.set(u.id, u);
    return { ...r, videos: await this._vids(r.videos) };
  }

  // ---------- Stores & rentals ----------
  storeStatus(store) {
    const plan = PLANS.find((p) => p.id === store.planId) || PLANS[0]; const left = (store.expiresAt || 0) - Date.now();
    return { active: left > 0, daysLeft: Math.max(0, Math.ceil(left / DAY)), plan, pending: !!store.pending };
  }
  async slots() { const r = await this._req('GET', '/slots'); return { storesUsed: r.storesUsed, storesTotal: r.storesTotal ?? SLOTS.stores, featuredUsed: r.featuredUsed, featuredTotal: r.featuredTotal ?? SLOTS.featured }; }
  async listStores({ q = '', category = '', includeInactive = false } = {}) { return this._req('GET', '/stores' + this._qs({ q, category, includeInactive: includeInactive ? '1' : '' })); }
  async getStore(id) { if (!UUID_RE.test(String(id))) return null; return this._req('GET', '/stores/' + id); }
  async getStoreByOwner(uid) { if (!uid || !UUID_RE.test(uid)) return null; return this._req('GET', '/stores/by-owner/' + uid); }
  async getMyStore() { const me = await this.currentUser(); return me ? this.getStoreByOwner(me.id) : null; }
  async createStoreWithRental({ store, planId, payment }) {
    await this._meOrThrow(); const plan = PLANS.find((p) => p.id === planId);
    const body = { name: store.name, category: store.category, description: store.description, contact: store.contact || '', logo: await this._img(store.logo), banner: plan?.banner ? await this._img(store.banner) : null };
    // الإيجار يبقى pending — التفعيل من المشرف أو Webhook الدفع فقط
    return this._req('POST', '/stores', { store: body, planId, payment: { method: payment?.method, ref: payment?.ref }, acceptPolicy: POLICY.version });
  }
  async renewRental({ storeId, planId, payment }) { await this._meOrThrow(); return this._req('POST', `/stores/${storeId}/rentals`, { planId, payment: { method: payment?.method, ref: payment?.ref }, acceptPolicy: POLICY.version }); }
  async updateStore(id, patch) {
    const body = { name: patch.name, category: patch.category, description: patch.description, contact: patch.contact };
    if (patch.logo) body.logo = await this._img(patch.logo); if (patch.banner) body.banner = await this._img(patch.banner);
    return this._req('PATCH', '/stores/' + id, body);
  }
  async listRentals({ storeId } = {}) { return this._req('GET', '/rentals' + this._qs({ storeId })); }

  // ---------- Products ----------
  async listProducts(storeId) { return this._req('GET', `/stores/${storeId}/products`); }
  async getProduct(id) { if (!UUID_RE.test(String(id))) return null; return this._req('GET', '/products/' + id); }
  async productsByIds(ids = []) { return ids?.length ? this._req('GET', '/products' + this._qs({ ids: ids.join(',') })) : []; }
  async saveProduct(p) {
    const st = await this.getMyStore(); if (!st) throw new Error('nostore');
    const body = { id: p.id, name: p.name, price: p.price, stock: p.stock, description: p.description };
    if (p.image !== undefined) body.image = await this._img(p.image);
    try { return await this._req('POST', '/products', body); }
    catch (e) { if (e.message === 'limit') { const err = new Error('limit'); err.limit = e.limit; throw err; } throw e; }
  }
  async deleteProduct(id) { await this._req('DELETE', '/products/' + id); }

  // ---------- Notifications ----------
  async listNotifications() {
    const me = await this.currentUser(); if (!me) return [];
    const r = await this._req('GET', '/notifications'); for (const u of r.users) this.profiles.set(u.id, u); return r.notifications;
  }
  async unreadCount() { const me = await this.currentUser(); if (!me) return 0; return (await this._req('GET', '/notifications/unread-count')).count; }
  async markAllRead() { await this._meOrThrow(); await this._req('POST', '/notifications/read-all', {}); }

  // ---------- Admin ----------
  async adminSummary() {
    const me = await this._meOrThrow(); if (me.role !== 'admin') throw new Error('forbidden');
    const r = await this._req('GET', '/admin/summary');
    for (const x of r.rentals) if (x.owner) this.profiles.set(x.owner.id, x.owner);
    const paid = r.rentals.filter((x) => x.status === 'active');
    const months = []; const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    for (let i = 5; i >= 0; i--) { const s = new Date(d.getFullYear(), d.getMonth() - i, 1), e = new Date(d.getFullYear(), d.getMonth() - i + 1, 1); months.push({ start: +s, total: paid.filter((x) => x.paidAt >= +s && x.paidAt < +e).reduce((acc, x) => acc + x.amount, 0) }); }
    return {
      revenue: paid.reduce((s, x) => s + x.amount, 0), rentals: r.rentals, months,
      byPlan: PLANS.map((p) => ({ planId: p.id, count: paid.filter((x) => x.planId === p.id).length, total: paid.filter((x) => x.planId === p.id).reduce((a, x) => a + x.amount, 0) })),
      slots: r.slots, users: r.users, videos: r.videos, activeStores: r.slots.storesUsed, pendingCount: r.rentals.filter((x) => x.status === 'pending').length
    };
  }
  // تفعيل يدوي من المشرف (إلى أن يُربط Webhook الدفع)
  async activateRental(id) { return this._req('POST', `/admin/rentals/${id}/activate`, {}); }
  async cancelRental(id) { await this._req('POST', `/admin/rentals/${id}/cancel`, {}); }
}
