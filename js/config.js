// ===== إعدادات التطبيق — غيّر اسم العلامة من هنا فقط =====
export const BRAND = Object.freeze({
  ar: 'كليب كات',
  en: 'ClipKat',
  tagline: { ar: 'مقاطع قصيرة… ومتاجر حقيقية', en: 'Short clips. Real shops.' },
  // لون العلامة الأصلي (زمردي ← كهرماني) — لا يشبه أي علامة أخرى
  colors: { primary: '#12c2a0', accent: '#f5a524', ink: '#0b1020' }
});

export const CURRENCY = 'KWD';

// خطط تأجير المتاجر (بالدينار الكويتي)
export const PLANS = Object.freeze([
  { id: 'weekly', days: 7, price: 3, maxProducts: 10, banner: false, featured: false, verified: false },
  { id: 'monthly', days: 30, price: 9, maxProducts: 50, banner: true, featured: false, verified: false, popular: true },
  { id: 'yearly', days: 365, price: 90, maxProducts: Infinity, banner: true, featured: true, verified: true }
]);

export const SLOTS = Object.freeze({ stores: 50, featured: 6 });

export const STORE_CATEGORIES = ['perfume', 'coffee', 'fashion', 'art', 'digital', 'food', 'beauty', 'other'];

export const STORAGE_PREFIX = 'ck:v1:';
