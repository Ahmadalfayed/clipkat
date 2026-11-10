// ===== إعدادات التطبيق — غيّر اسم العلامة من هنا فقط =====
export const BRAND = Object.freeze({
  ar: 'كليب كات',
  en: 'ClipKat',
  tagline: { ar: 'مقاطع قصيرة… ومتاجر حقيقية', en: 'Short clips. Real shops.' },
  // لون العلامة الأصلي (زمردي ← كهرماني) — لا يشبه أي علامة أخرى
  colors: { primary: '#12c2a0', accent: '#f5a524', ink: '#0b1020' }
});

// ===== وضع البيانات =====
// 'auto'  : (الافتراضي) إن كان الخادم الذاتي يعمل (/api) يُستخدم، وإلا يعمل الوضع التجريبي المحلي تلقائياً.
// 'api'   : الخادم فقط.      'demo' : الوضع التجريبي المحلي فقط (بيانات في المتصفح، بدون خادم).
export const DATA_MODE = 'auto';
export const API_BASE = '';            // فارغ = نفس الموقع. (مثال لخادم آخر: 'https://api.example.com')
export const MAX_VIDEO_MB = 100;       // قيمة احتياطية؛ الحد الحقيقي يأتي من الخادم (MAX_VIDEO_MB في ملف .env)

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
