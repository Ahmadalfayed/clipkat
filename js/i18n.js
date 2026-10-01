import { BRAND } from './config.js';

const ar = {
  forYou: 'لك', following: 'المتابَعون', home: 'الرئيسية', stores: 'المتاجر', inbox: 'الصندوق', me: 'حسابي', create: 'إنشاء',
  search: 'بحث', searchPh: 'ابحث عن مقاطع، صنّاع، وسوم، متاجر…', discover: 'اكتشف', trendingTags: 'الوسوم الرائجة', topCreators: 'صنّاع بارزون',
  videos: 'مقاطع', views: 'مشاهدة', like: 'إعجاب', comment: 'تعليق', share: 'مشاركة', save: 'حفظ', follow: 'متابعة', followingBtn: 'تتابعه', unfollow: 'إلغاء المتابعة',
  followers: 'متابِعون', followingCount: 'يتابع', likes: 'إعجابات', saved: 'المحفوظات', liked: 'أعجبني',
  tapUnmute: 'اضغط لتشغيل الصوت', paused: 'متوقف مؤقتاً', originalSound: 'صوت أصلي',
  comments: 'التعليقات', addComment: 'أضف تعليقاً…', send: 'إرسال', noComments: 'لا توجد تعليقات بعد. كن أول من يعلّق!',
  close: 'إغلاق', linkCopied: 'تم نسخ الرابط', saved_ok: 'تم الحفظ', removed: 'تمت الإزالة',
  emptyFollowing: 'لا تتابع أحداً بعد', emptyFollowingSub: 'تابع صنّاع المحتوى لتظهر مقاطعهم هنا.', goDiscover: 'اكتشف صنّاعاً',
  loginRequired: 'سجّل الدخول للمتابعة', login: 'تسجيل الدخول', signup: 'إنشاء حساب', logout: 'تسجيل الخروج',
  username: 'اسم المستخدم', displayName: 'الاسم الظاهر', password: 'كلمة المرور', bio: 'نبذة',
  insecureNote: 'نموذج تجريبي — تسجيل الدخول هنا غير آمن: الحسابات وكلمات المرور (مُجزّأة) محفوظة في متصفحك فقط. لا تستخدم كلمة مرور حقيقية.',
  demoUser: 'دخول سريع كمستخدم تجريبي', demoSeller: 'دخول كبائع تجريبي', demoAdmin: 'دخول كمشرف تجريبي',
  badLogin: 'اسم المستخدم أو كلمة المرور غير صحيحة', userTaken: 'اسم المستخدم مستخدم مسبقاً', fillAll: 'يرجى تعبئة الحقول المطلوبة', pwShort: 'كلمة المرور 6 أحرف على الأقل',
  welcome: 'أهلاً بك في {brand}!',
  editProfile: 'تعديل الملف', saveChanges: 'حفظ التغييرات', changeAvatar: 'تغيير الصورة', cancel: 'إلغاء',
  noVideos: 'لا توجد مقاطع بعد', myStore: 'متجري', visitStore: 'زيارة المتجر',
  upload: 'نشر مقطع', pickVideo: 'اختر ملف فيديو', pickHint: 'MP4 / WebM / MOV — يُحفظ محلياً في IndexedDB', caption: 'الوصف', captionPh: 'اكتب وصفاً… استخدم #وسوم', hashtags: 'الوسوم', hashtagsPh: 'مثال: كويت قهوة',
  sound: 'اسم الصوت', attachProducts: 'اربط منتجات من متجرك', noStoreForTag: 'استأجر متجراً لتتمكن من ربط منتجاتك بالمقاطع.', rentNow: 'استأجر متجراً',
  publish: 'نشر', publishing: 'جارٍ النشر…', published: 'تم نشر المقطع!', pickFirst: 'اختر فيديو أولاً', change: 'تغيير',
  notifications: 'الإشعارات', messages: 'الرسائل', markAll: 'تعليم الكل كمقروء', mockInbox: 'صندوق تجريبي — الرسائل للعرض فقط',
  n_like: 'أُعجب بمقطعك', n_follow: 'بدأ بمتابعتك', n_comment: 'علّق: {text}', n_system: '{text}', n_order: 'استفسار عن منتج: {text}',
  storesTitle: 'سوق المتاجر', storesSub: 'متاجر صغيرة داخل {brand} — استأجر واجهتك واعرض منتجاتك في المقاطع.',
  slotsAvail: 'مساحات متاحة', featuredAvail: 'مساحات مميّزة', of: 'من', rentYourStore: 'استأجر متجرك', storeSearchPh: 'ابحث عن متجر أو منتج…', all: 'الكل',
  featured: 'مميّز', verified: 'موثّق', productsTitle: 'المنتجات', products: 'منتجات', product: 'منتج', noStores: 'لا توجد متاجر مطابقة', inactive: 'غير نشط',
  cat_perfume: 'عطور', cat_coffee: 'قهوة', cat_fashion: 'أزياء', cat_art: 'فنون', cat_digital: 'رقمي', cat_food: 'أكل', cat_beauty: 'تجميل', cat_other: 'أخرى',
  rentTitle: 'متاجر للإيجار', rentSub: 'اختر خطة، ادفع (تجريبياً)، واحصل على متجرك فوراً.',
  plan_weekly: 'أسبوعي', plan_monthly: 'شهري', plan_yearly: 'سنوي', per_weekly: '/ أسبوع', per_monthly: '/ شهر', per_yearly: '/ سنة',
  f_products: 'حتى {n} منتج', f_unlimited: 'منتجات غير محدودة', f_banner: 'بانر مخصّص للمتجر', f_noBanner: 'بانر افتراضي', f_featured: 'ظهور مميّز في السوق', f_verified: 'شارة توثيق', f_tag: 'ربط المنتجات بالمقاطع', f_page: 'صفحة متجر وزر تواصل/شراء',
  popular: 'الأكثر طلباً', choose: 'اختر الخطة', soldOut: 'المساحات ممتلئة', featuredFull: 'المساحات المميّزة ممتلئة — ستحصل على باقي المزايا',
  checkout: 'الدفع', demoPay: 'وضع تجريبي — لن يتم خصم أي مبلغ. بوابة الدفع (Tap / MyFatoorah) غير مفعّلة.',
  orderSummary: 'ملخص الطلب', total: 'الإجمالي', payMethod: 'طريقة الدفع', knet: 'كي نت', card: 'بطاقة ائتمان', applepay: 'Apple Pay',
  storeInfo: 'بيانات المتجر', storeName: 'اسم المتجر', category: 'التصنيف', description: 'الوصف', contactLink: 'رابط التواصل / الشراء', contactPh: 'https://wa.me/965XXXXXXXX',
  logo: 'الشعار', banner: 'البانر', bannerLocked: 'البانر المخصّص متاح في الخطة الشهرية والسنوية', payDemo: 'ادفع {amount} (تجريبي)', processing: 'جارٍ معالجة الدفع التجريبي…',
  paySuccess: 'تم الدفع التجريبي بنجاح — مرجع {ref}', renew: 'تجديد', renewTitle: 'تجديد الاشتراك', alreadyHaveStore: 'لديك متجر بالفعل — يمكنك التجديد أو تغيير الخطة.',
  dashboard: 'لوحة البائع', rentalStatus: 'حالة الإيجار', active: 'نشط', expired: 'منتهي', expires: 'ينتهي في', daysLeft: 'متبقٍ {n} يوم', plan: 'الخطة',
  addProduct: 'إضافة منتج', editProduct: 'تعديل المنتج', productName: 'اسم المنتج', price: 'السعر (د.ك)', stock: 'المخزون', image: 'الصورة', delete: 'حذف', edit: 'تعديل',
  confirmDelete: 'حذف هذا المنتج؟', limitReached: 'وصلت للحد الأقصى من المنتجات في خطتك ({n}). رقِّ خطتك.', productSaved: 'تم حفظ المنتج', productDeleted: 'تم حذف المنتج',
  outOfStock: 'نفد المخزون', inStock: 'متوفر: {n}', buy: 'شراء / تواصل', noProducts: 'لا توجد منتجات بعد', storeVideos: 'مقاطع تعرض منتجات المتجر', storeSettings: 'إعدادات المتجر', viewStore: 'عرض المتجر',
  noStoreYet: 'ليس لديك متجر بعد', noStoreSub: 'استأجر متجراً لتعرض منتجاتك وتربطها بمقاطعك.', storeInactive: 'هذا المتجر غير نشط حالياً (انتهى الإيجار).', rentals: 'الإيجارات',
  admin: 'لوحة المشرف (تجريبي)', revenue: 'الإيرادات', activeRentals: 'إيجارات نشطة', users: 'مستخدمون', totalVideos: 'مقاطع', monthlyRevenue: 'الإيرادات الشهرية', byPlan: 'حسب الخطة',
  store: 'المتجر', owner: 'المالك', amount: 'المبلغ', date: 'التاريخ', status: 'الحالة', method: 'الطريقة', adminOnly: 'هذه الصفحة للمشرف فقط', settings: 'الإعدادات',
  theme: 'المظهر', dark: 'داكن', light: 'فاتح', language: 'اللغة', shopNow: 'تسوّق', taggedProducts: 'منتجات في هذا المقطع', back: 'رجوع', notFound: 'الصفحة غير موجودة',
  prototype: 'نموذج أولي', demoNotice: 'نسخة تجريبية — بياناتك تبقى على جهازك فقط', hideNotice: 'إخفاء التنبيه', results: 'النتائج', creators: 'صنّاع', resetDemo: 'إعادة ضبط البيانات التجريبية', resetConfirm: 'سيتم حذف كل البيانات المحلية وإعادة البيانات التجريبية. متابعة؟'
};

const en = {
  forYou: 'For You', following: 'Following', home: 'Home', stores: 'Stores', inbox: 'Inbox', me: 'Me', create: 'Create',
  search: 'Search', searchPh: 'Search clips, creators, tags, stores…', discover: 'Discover', trendingTags: 'Trending hashtags', topCreators: 'Top creators',
  videos: 'Videos', views: 'views', like: 'Like', comment: 'Comment', share: 'Share', save: 'Save', follow: 'Follow', followingBtn: 'Following', unfollow: 'Unfollow',
  followers: 'Followers', followingCount: 'Following', likes: 'Likes', saved: 'Saved', liked: 'Liked',
  tapUnmute: 'Tap to unmute', paused: 'Paused', originalSound: 'Original sound',
  comments: 'Comments', addComment: 'Add a comment…', send: 'Send', noComments: 'No comments yet. Be the first!',
  close: 'Close', linkCopied: 'Link copied', saved_ok: 'Saved', removed: 'Removed',
  emptyFollowing: 'You are not following anyone yet', emptyFollowingSub: 'Follow creators to see their clips here.', goDiscover: 'Discover creators',
  loginRequired: 'Log in to continue', login: 'Log in', signup: 'Sign up', logout: 'Log out',
  username: 'Username', displayName: 'Display name', password: 'Password', bio: 'Bio',
  insecureNote: 'Prototype — this login is NOT secure: accounts and (hashed) passwords live only in your browser. Do not use a real password.',
  demoUser: 'Quick demo user login', demoSeller: 'Demo seller login', demoAdmin: 'Demo admin login',
  badLogin: 'Wrong username or password', userTaken: 'Username already taken', fillAll: 'Please fill the required fields', pwShort: 'Password must be at least 6 characters',
  welcome: 'Welcome to {brand}!',
  editProfile: 'Edit profile', saveChanges: 'Save changes', changeAvatar: 'Change photo', cancel: 'Cancel',
  noVideos: 'No clips yet', myStore: 'My store', visitStore: 'Visit store',
  upload: 'Post a clip', pickVideo: 'Choose a video file', pickHint: 'MP4 / WebM / MOV — stored locally in IndexedDB', caption: 'Caption', captionPh: 'Write a caption… use #hashtags', hashtags: 'Hashtags', hashtagsPh: 'e.g. kuwait coffee',
  sound: 'Sound name', attachProducts: 'Attach products from your store', noStoreForTag: 'Rent a store to tag your products in clips.', rentNow: 'Rent a store',
  publish: 'Post', publishing: 'Posting…', published: 'Clip posted!', pickFirst: 'Choose a video first', change: 'Change',
  notifications: 'Notifications', messages: 'Messages', markAll: 'Mark all read', mockInbox: 'Demo inbox — messages are for display only',
  n_like: 'liked your clip', n_follow: 'started following you', n_comment: 'commented: {text}', n_system: '{text}', n_order: 'asked about a product: {text}',
  storesTitle: 'Stores marketplace', storesSub: 'Small shops inside {brand} — rent a storefront and show products in clips.',
  slotsAvail: 'Slots available', featuredAvail: 'Featured slots', of: 'of', rentYourStore: 'Rent your store', storeSearchPh: 'Search stores or products…', all: 'All',
  featured: 'Featured', verified: 'Verified', productsTitle: 'Products', products: 'products', product: 'product', noStores: 'No matching stores', inactive: 'Inactive',
  cat_perfume: 'Perfume', cat_coffee: 'Coffee', cat_fashion: 'Fashion', cat_art: 'Art', cat_digital: 'Digital', cat_food: 'Food', cat_beauty: 'Beauty', cat_other: 'Other',
  rentTitle: 'Stores for rent', rentSub: 'Pick a plan, pay (demo), and get your store instantly.',
  plan_weekly: 'Weekly', plan_monthly: 'Monthly', plan_yearly: 'Yearly', per_weekly: '/ week', per_monthly: '/ month', per_yearly: '/ year',
  f_products: 'Up to {n} products', f_unlimited: 'Unlimited products', f_banner: 'Custom store banner', f_noBanner: 'Default banner', f_featured: 'Featured placement', f_verified: 'Verified badge', f_tag: 'Tag products in clips', f_page: 'Store page + contact/buy button',
  popular: 'Most popular', choose: 'Choose plan', soldOut: 'Slots are full', featuredFull: 'Featured slots full — other perks still apply',
  checkout: 'Checkout', demoPay: 'DEMO mode — no money is charged. The payment gateway (Tap / MyFatoorah) is not connected.',
  orderSummary: 'Order summary', total: 'Total', payMethod: 'Payment method', knet: 'KNET', card: 'Credit card', applepay: 'Apple Pay',
  storeInfo: 'Store details', storeName: 'Store name', category: 'Category', description: 'Description', contactLink: 'Contact / buy link', contactPh: 'https://wa.me/965XXXXXXXX',
  logo: 'Logo', banner: 'Banner', bannerLocked: 'Custom banner is available on Monthly and Yearly', payDemo: 'Pay {amount} (demo)', processing: 'Processing demo payment…',
  paySuccess: 'Demo payment succeeded — ref {ref}', renew: 'Renew', renewTitle: 'Renew subscription', alreadyHaveStore: 'You already have a store — you can renew or switch plan.',
  dashboard: 'Seller dashboard', rentalStatus: 'Rental status', active: 'Active', expired: 'Expired', expires: 'Expires', daysLeft: '{n} days left', plan: 'Plan',
  addProduct: 'Add product', editProduct: 'Edit product', productName: 'Product name', price: 'Price (KWD)', stock: 'Stock', image: 'Image', delete: 'Delete', edit: 'Edit',
  confirmDelete: 'Delete this product?', limitReached: 'Product limit for your plan reached ({n}). Upgrade your plan.', productSaved: 'Product saved', productDeleted: 'Product deleted',
  outOfStock: 'Out of stock', inStock: 'In stock: {n}', buy: 'Buy / Contact', noProducts: 'No products yet', storeVideos: 'Clips featuring this store', storeSettings: 'Store settings', viewStore: 'View store',
  noStoreYet: 'You have no store yet', noStoreSub: 'Rent a store to list products and tag them in your clips.', storeInactive: 'This store is currently inactive (rental expired).', rentals: 'Rentals',
  admin: 'Admin dashboard (demo)', revenue: 'Revenue', activeRentals: 'Active rentals', users: 'Users', totalVideos: 'Clips', monthlyRevenue: 'Monthly revenue', byPlan: 'By plan',
  store: 'Store', owner: 'Owner', amount: 'Amount', date: 'Date', status: 'Status', method: 'Method', adminOnly: 'Admins only', settings: 'Settings',
  theme: 'Theme', dark: 'Dark', light: 'Light', language: 'Language', shopNow: 'Shop', taggedProducts: 'Products in this clip', back: 'Back', notFound: 'Page not found',
  prototype: 'Prototype', demoNotice: 'Demo version — your data stays on this device only', hideNotice: 'Hide notice', results: 'Results', creators: 'Creators', resetDemo: 'Reset demo data', resetConfirm: 'All local data will be erased and demo data restored. Continue?'
};

const dict = { ar, en };
export let lang = localStorage.getItem('ck:lang') || 'ar';
export const brandName = () => BRAND[lang];

export function t(key, vars = {}) {
  let s = dict[lang][key] ?? dict.ar[key] ?? key;
  vars = { brand: brandName(), ...vars };
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
export function setLang(l) {
  lang = l; localStorage.setItem('ck:lang', l);
  document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}
const loc = () => (lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en');
export const fmtNum = (n) => new Intl.NumberFormat(loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const fmtKWD = (n) => (n === Infinity ? '∞' : (lang === 'ar' ? `${Number(n).toFixed(3)} د.ك` : `KWD ${Number(n).toFixed(3)}`));
export const fmtDate = (ts) => new Intl.DateTimeFormat(loc(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ts));
export function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto', style: 'short' });
  for (const [u, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) if (s >= sec) return rtf.format(-Math.floor(s / sec), u);
  return rtf.format(-s, 'second');
}
