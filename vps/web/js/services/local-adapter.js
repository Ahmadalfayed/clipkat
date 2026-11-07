// ===== LocalAdapter: تنفيذ واجهة خدمة البيانات فوق localStorage + IndexedDB =====
// كل الدوال async بنفس الشكل الذي سيعيده محوّل الخادم لاحقاً.
import { STORAGE_PREFIX, PLANS, SLOTS } from '../config.js';
import { blobStore } from './blobstore.js';
import { buildSeed } from './seed.js';

const TABLES = ['users', 'follows', 'videos', 'likes', 'saves', 'comments', 'stores', 'products', 'rentals', 'notifications'];
const DAY = 86400000;
export const uid = (p = '') => p + (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14));

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const tagsOf = (s) => [...String(s || '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]);
const norm = (s) => String(s || '').toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export class LocalAdapter {
  constructor() { this.db = {}; this.urlCache = new Map(); this.mode = 'local'; }

  // ---------- تخزين داخلي ----------
  _load() { for (const t of TABLES) this.db[t] = JSON.parse(localStorage.getItem(STORAGE_PREFIX + t) || '[]'); }
  _save(...tables) { for (const t of tables.length ? tables : TABLES) localStorage.setItem(STORAGE_PREFIX + t, JSON.stringify(this.db[t])); }
  _get(t, id) { return this.db[t].find((r) => r.id === id) || null; }
  _publicUser(u) { if (!u) return null; const { passHash, salt, ...rest } = u; return rest; }

  async init() {
    this._load();
    if (!localStorage.getItem(STORAGE_PREFIX + 'seeded')) {
      const seed = await buildSeed({ sha256, uid });
      for (const t of TABLES) this.db[t] = seed[t] || [];
      this._save(); localStorage.setItem(STORAGE_PREFIX + 'seeded', '1');
    }
  }
  async resetDemo() {
    for (const t of TABLES) localStorage.removeItem(STORAGE_PREFIX + t);
    localStorage.removeItem(STORAGE_PREFIX + 'seeded'); localStorage.removeItem(STORAGE_PREFIX + 'session');
    await blobStore.clear().catch(() => {}); await this.init();
  }

  // ---------- المصادقة (تجريبية وغير آمنة) ----------
  async currentUser() { const id = localStorage.getItem(STORAGE_PREFIX + 'session'); return this._publicUser(this._get('users', id)); }
  async signUp({ username, name, password }) {
    username = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(username)) throw new Error('username');
    if (this.db.users.some((u) => u.username === username)) throw new Error('taken');
    if (String(password).length < 6) throw new Error('password');
    const salt = uid(), id = uid('u_');
    const user = { id, username, name: name?.trim() || username, bio: '', avatar: null, role: 'user', createdAt: Date.now(), salt, passHash: await sha256(salt + password) };
    this.db.users.push(user);
    const now = Date.now();
    const n = (type, fromId, extra = {}) => ({ id: uid('n_'), userId: id, type, fromId, createdAt: now - Math.random() * 3600000, read: false, ...extra });
    this.db.notifications.push(n('system', null, { text: 'welcome', createdAt: now }), n('follow', 'u_noura'), n('follow', 'u_fahad'));
    this.db.follows.push({ a: 'u_noura', b: id }, { a: 'u_fahad', b: id });
    this._save('users', 'notifications', 'follows');
    localStorage.setItem(STORAGE_PREFIX + 'session', id);
    return this._publicUser(user);
  }
  async login(username, password) {
    const u = this.db.users.find((x) => x.username === String(username).trim().toLowerCase());
    if (!u || (await sha256(u.salt + password)) !== u.passHash) throw new Error('bad');
    localStorage.setItem(STORAGE_PREFIX + 'session', u.id); return this._publicUser(u);
  }
  async logout() { localStorage.removeItem(STORAGE_PREFIX + 'session'); }
  async _me() { const u = await this.currentUser(); if (!u) throw new Error('auth'); return u; }

  // ---------- المستخدمون والمتابعة ----------
  async getUser(id) { return this._publicUser(this._get('users', id)); }
  async listUsers() { return this.db.users.map((u) => this._publicUser(u)); }
  async updateProfile(patch) {
    const me = await this._me(); const u = this._get('users', me.id);
    for (const k of ['name', 'bio', 'avatar']) if (patch[k] !== undefined) u[k] = patch[k];
    this._save('users'); return this._publicUser(u);
  }
  async isFollowing(a, b) { return this.db.follows.some((f) => f.a === a && f.b === b); }
  async toggleFollow(targetId) {
    const me = await this._me(); if (me.id === targetId) return false;
    const i = this.db.follows.findIndex((f) => f.a === me.id && f.b === targetId);
    if (i >= 0) this.db.follows.splice(i, 1); else { this.db.follows.push({ a: me.id, b: targetId }); this.db.notifications.push({ id: uid('n_'), userId: targetId, type: 'follow', fromId: me.id, createdAt: Date.now(), read: false }); }
    this._save('follows', 'notifications'); return i < 0;
  }
  async userStats(id) {
    const vids = this.db.videos.filter((v) => v.userId === id);
    const likes = vids.reduce((s, v) => s + (v.base?.likes || 0) + this.db.likes.filter((l) => l.videoId === v.id).length, 0);
    return { followers: this.db.follows.filter((f) => f.b === id).length + (this._get('users', id)?.baseFollowers || 0), following: this.db.follows.filter((f) => f.a === id).length, likes, videos: vids.length };
  }

  // ---------- المقاطع ----------
  async listVideos({ tab = 'foryou', userId, tag, savedBy, likedBy, productStoreId } = {}) {
    let v = [...this.db.videos];
    if (tab === 'following') { const me = await this.currentUser(); const ids = new Set(this.db.follows.filter((f) => f.a === me?.id).map((f) => f.b)); v = v.filter((x) => ids.has(x.userId)); }
    if (userId) v = v.filter((x) => x.userId === userId);
    if (tag) v = v.filter((x) => x.hashtags.some((h) => norm(h) === norm(tag)));
    if (savedBy) { const s = new Set(this.db.saves.filter((x) => x.userId === savedBy).map((x) => x.videoId)); v = v.filter((x) => s.has(x.id)); }
    if (likedBy) { const s = new Set(this.db.likes.filter((x) => x.userId === likedBy).map((x) => x.videoId)); v = v.filter((x) => s.has(x.id)); }
    if (productStoreId) { const p = new Set(this.db.products.filter((x) => x.storeId === productStoreId).map((x) => x.id)); v = v.filter((x) => x.productIds?.some((id) => p.has(id))); }
    return v.sort((a, b) => b.createdAt - a.createdAt);
  }
  async getVideo(id) { return this._get('videos', id); }
  async videoURL(v) {
    if (!v.blobKey) return v.src;
    if (this.urlCache.has(v.blobKey)) return this.urlCache.get(v.blobKey);
    const blob = await blobStore.get(v.blobKey); if (!blob) return '';
    const url = URL.createObjectURL(blob); this.urlCache.set(v.blobKey, url); return url;
  }
  async createVideo({ file, poster, caption = '', hashtags = [], sound, productIds = [] }) {
    const me = await this._me(); const id = uid('v_'), blobKey = 'video:' + id;
    await blobStore.put(blobKey, file);
    const tags = [...new Set([...hashtags, ...tagsOf(caption)].map((h) => h.replace(/^#/, '').trim()).filter(Boolean))];
    const myStore = await this.getMyStore();
    const allowed = new Set(this.db.products.filter((p) => p.storeId === myStore?.id).map((p) => p.id));
    const v = { id, userId: me.id, blobKey, poster, caption, hashtags: tags, sound: sound || null, productIds: productIds.filter((p) => allowed.has(p)), createdAt: Date.now(), base: { likes: 0, comments: 0, shares: 0, saves: 0, views: 0 } };
    this.db.videos.push(v); this._save('videos'); return v;
  }
  async videoStats(v) {
    const me = await this.currentUser(); const b = v.base || {};
    return {
      likes: b.likes + this.db.likes.filter((l) => l.videoId === v.id).length,
      comments: b.comments + this.db.comments.filter((c) => c.videoId === v.id).length,
      saves: b.saves + this.db.saves.filter((s) => s.videoId === v.id).length,
      shares: b.shares + (v.shares || 0),
      liked: !!me && this.db.likes.some((l) => l.videoId === v.id && l.userId === me.id),
      saved: !!me && this.db.saves.some((l) => l.videoId === v.id && l.userId === me.id)
    };
  }
  async _toggle(table, videoId, notify) {
    const me = await this._me(); const i = this.db[table].findIndex((x) => x.videoId === videoId && x.userId === me.id);
    if (i >= 0) this.db[table].splice(i, 1);
    else {
      this.db[table].push({ userId: me.id, videoId, at: Date.now() });
      const v = this._get('videos', videoId);
      if (notify && v && v.userId !== me.id) this.db.notifications.push({ id: uid('n_'), userId: v.userId, type: notify, fromId: me.id, videoId, createdAt: Date.now(), read: false });
    }
    this._save(table, 'notifications'); return i < 0;
  }
  async toggleLike(videoId) { return this._toggle('likes', videoId, 'like'); }
  async setLike(videoId) { const s = await this.videoStats(this._get('videos', videoId)); if (!s.liked) await this.toggleLike(videoId); return true; }
  async toggleSave(videoId) { return this._toggle('saves', videoId); }
  async recordShare(videoId) { const v = this._get('videos', videoId); v.shares = (v.shares || 0) + 1; this._save('videos'); }

  // ---------- التعليقات ----------
  async listComments(videoId) { return this.db.comments.filter((c) => c.videoId === videoId).sort((a, b) => b.createdAt - a.createdAt); }
  async addComment(videoId, text) {
    const me = await this._me(); text = String(text).trim().slice(0, 300); if (!text) throw new Error('empty');
    const c = { id: uid('c_'), videoId, userId: me.id, text, createdAt: Date.now() }; this.db.comments.push(c);
    const v = this._get('videos', videoId);
    if (v && v.userId !== me.id) this.db.notifications.push({ id: uid('n_'), userId: v.userId, type: 'comment', fromId: me.id, videoId, text, createdAt: Date.now(), read: false });
    this._save('comments', 'notifications'); return c;
  }

  // ---------- البحث والاكتشاف ----------
  async trendingTags(n = 10) {
    const m = new Map(); for (const v of this.db.videos) for (const h of v.hashtags) m.set(h, (m.get(h) || 0) + 1 + (v.base?.views || 0) / 10000);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag, score]) => ({ tag, count: this.db.videos.filter((v) => v.hashtags.includes(tag)).length, score }));
  }
  async topCreators(n = 8) {
    const out = []; for (const u of this.db.users) if (u.role !== 'admin') out.push({ ...this._publicUser(u), stats: await this.userStats(u.id) });
    return out.sort((a, b) => b.stats.followers - a.stats.followers).slice(0, n);
  }
  async search(q) {
    const s = norm(q).replace(/^#/, ''); if (!s) return { users: [], tags: [], videos: [], stores: [] };
    const users = this.db.users.filter((u) => u.role !== 'admin' && (norm(u.username).includes(s) || norm(u.name).includes(s))).map((u) => this._publicUser(u));
    const tags = [...new Set(this.db.videos.flatMap((v) => v.hashtags))].filter((h) => norm(h).includes(s));
    const videos = this.db.videos.filter((v) => norm(v.caption).includes(s) || v.hashtags.some((h) => norm(h).includes(s)));
    const stores = await this.listStores({ q });
    return { users, tags, videos, stores };
  }

  // ---------- المتاجر والإيجار ----------
  storeStatus(store) {
    const plan = PLANS.find((p) => p.id === store.planId); const left = store.expiresAt - Date.now();
    return { active: left > 0, daysLeft: Math.max(0, Math.ceil(left / DAY)), plan };
  }
  async slots() {
    const active = this.db.stores.filter((s) => s.expiresAt > Date.now());
    return { storesUsed: active.length, storesTotal: SLOTS.stores, featuredUsed: active.filter((s) => s.featured).length, featuredTotal: SLOTS.featured };
  }
  async listStores({ q = '', category = '', includeInactive = false } = {}) {
    const s = norm(q);
    return this.db.stores.filter((st) => (includeInactive || st.expiresAt > Date.now()) && (!category || st.category === category) &&
      (!s || norm(st.name).includes(s) || norm(st.description).includes(s) || this.db.products.some((p) => p.storeId === st.id && norm(p.name).includes(s))))
      .map((st) => ({ ...st, productCount: this.db.products.filter((p) => p.storeId === st.id).length }))
      .sort((a, b) => (b.featured - a.featured) || (b.createdAt - a.createdAt));
  }
  async getStore(id) { return this._get('stores', id); }
  async getStoreByOwner(userId) { return this.db.stores.find((s) => s.ownerId === userId) || null; }
  async getMyStore() { const me = await this.currentUser(); return me ? this.getStoreByOwner(me.id) : null; }
  async createStoreWithRental({ store, planId, payment }) {
    const me = await this._me(); if (await this.getMyStore()) throw new Error('exists');
    const plan = PLANS.find((p) => p.id === planId); const sl = await this.slots();
    if (sl.storesUsed >= sl.storesTotal) throw new Error('full');
    const now = Date.now(), id = uid('s_');
    const st = { id, ownerId: me.id, name: store.name.trim(), category: store.category || 'other', description: store.description || '', contact: store.contact || '',
      logo: store.logo || null, banner: plan.banner ? store.banner || null : null, planId, featured: plan.featured && sl.featuredUsed < sl.featuredTotal, verified: plan.verified,
      createdAt: now, expiresAt: now + plan.days * DAY };
    this.db.stores.push(st);
    this.db.rentals.push({ id: uid('r_'), storeId: id, ownerId: me.id, planId, amount: plan.price, method: payment.method, ref: payment.ref, paidAt: now, startAt: now, endAt: st.expiresAt });
    this.db.notifications.push({ id: uid('n_'), userId: me.id, type: 'system', text: 'storeReady', createdAt: now, read: false });
    this._save('stores', 'rentals', 'notifications'); return st;
  }
  async renewRental({ storeId, planId, payment }) {
    const me = await this._me(); const st = this._get('stores', storeId); if (!st || st.ownerId !== me.id) throw new Error('forbidden');
    const plan = PLANS.find((p) => p.id === planId); const sl = await this.slots(); const now = Date.now();
    const start = Math.max(now, st.expiresAt);
    st.planId = planId; st.expiresAt = start + plan.days * DAY; st.verified = plan.verified;
    st.featured = plan.featured && (st.featured || sl.featuredUsed < sl.featuredTotal);
    if (!plan.banner) st.banner = null;
    this.db.rentals.push({ id: uid('r_'), storeId, ownerId: me.id, planId, amount: plan.price, method: payment.method, ref: payment.ref, paidAt: now, startAt: start, endAt: st.expiresAt });
    this._save('stores', 'rentals'); return st;
  }
  async updateStore(id, patch) {
    const me = await this._me(); const st = this._get('stores', id); if (!st || st.ownerId !== me.id) throw new Error('forbidden');
    const plan = PLANS.find((p) => p.id === st.planId);
    for (const k of ['name', 'category', 'description', 'contact', 'logo']) if (patch[k] !== undefined) st[k] = patch[k];
    if (patch.banner !== undefined && plan.banner) st.banner = patch.banner;
    this._save('stores'); return st;
  }

  async listRentals({ storeId } = {}) { const me = await this._me(); const st = storeId ? this._get('stores', storeId) : null; if (st && st.ownerId !== me.id && me.role !== 'admin') throw new Error('forbidden'); return this.db.rentals.filter((r) => !storeId || r.storeId === storeId).sort((a, b) => b.paidAt - a.paidAt); }

  // ---------- المنتجات ----------
  async listProducts(storeId) { return this.db.products.filter((p) => p.storeId === storeId).sort((a, b) => b.createdAt - a.createdAt); }
  async getProduct(id) { return this._get('products', id); }
  async productsByIds(ids = []) { return ids.map((id) => this._get('products', id)).filter(Boolean); }
  async saveProduct(p) {
    const me = await this._me(); const st = await this.getMyStore(); if (!st) throw new Error('nostore');
    const status = this.storeStatus(st); if (!status.active) throw new Error('expired');
    const price = Math.max(0, Number(p.price) || 0), stock = Math.max(0, Math.floor(Number(p.stock) || 0));
    if (p.id) {
      const ex = this._get('products', p.id); if (!ex || ex.storeId !== st.id) throw new Error('forbidden');
      Object.assign(ex, { name: p.name, price, stock, image: p.image ?? ex.image, description: p.description ?? ex.description });
      this._save('products'); return ex;
    }
    const count = this.db.products.filter((x) => x.storeId === st.id).length;
    if (count >= status.plan.maxProducts) { const e = new Error('limit'); e.limit = status.plan.maxProducts; throw e; }
    const np = { id: uid('p_'), storeId: st.id, name: p.name, price, stock, image: p.image || null, description: p.description || '', createdAt: Date.now() };
    this.db.products.push(np); this._save('products'); return np;
  }
  async deleteProduct(id) {
    const st = await this.getMyStore(); const i = this.db.products.findIndex((p) => p.id === id && p.storeId === st?.id); if (i < 0) throw new Error('forbidden');
    this.db.products.splice(i, 1); for (const v of this.db.videos) if (v.productIds) v.productIds = v.productIds.filter((x) => x !== id);
    this._save('products', 'videos');
  }

  // ---------- الإشعارات ----------
  async listNotifications() { const me = await this.currentUser(); return me ? this.db.notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt - a.createdAt) : []; }
  async unreadCount() { return (await this.listNotifications()).filter((n) => !n.read).length; }
  async markAllRead() { const me = await this._me(); for (const n of this.db.notifications) if (n.userId === me.id) n.read = true; this._save('notifications'); }

  // ---------- المشرف ----------
  async adminSummary() {
    const me = await this._me(); if (me.role !== 'admin') throw new Error('forbidden');
    const rentals = [...this.db.rentals].sort((a, b) => b.paidAt - a.paidAt);
    const revenue = rentals.reduce((s, r) => s + r.amount, 0);
    const months = []; const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    for (let i = 5; i >= 0; i--) { const s = new Date(d.getFullYear(), d.getMonth() - i, 1), e = new Date(d.getFullYear(), d.getMonth() - i + 1, 1); months.push({ start: +s, total: rentals.filter((r) => r.paidAt >= +s && r.paidAt < +e).reduce((a, r) => a + r.amount, 0) }); }
    const byPlan = PLANS.map((p) => ({ planId: p.id, count: rentals.filter((r) => r.planId === p.id).length, total: rentals.filter((r) => r.planId === p.id).reduce((a, r) => a + r.amount, 0) }));
    return { revenue, rentals: rentals.map((r) => ({ ...r, store: this._get('stores', r.storeId), owner: this._publicUser(this._get('users', r.ownerId)) })), months, byPlan,
      slots: await this.slots(), users: this.db.users.length, videos: this.db.videos.length, activeStores: this.db.stores.filter((s) => s.expiresAt > Date.now()).length };
  }
}
