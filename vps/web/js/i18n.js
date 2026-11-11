import { BRAND } from './config.js';

const ar = {
  email: 'البريد الإلكتروني', cloudNoteApi: 'تسجيل دخول حقيقي بالبريد وكلمة المرور (8 أحرف على الأقل).', demoNoticeCloud: 'نسخة تجريبية — مرتبطة بخادمك', confirmEmailSent: 'تم إنشاء الحساب. افتح بريدك واضغط رابط التأكيد ثم سجّل الدخول.', unconfirmed: 'يجب تأكيد بريدك أولاً (افتح رابط التأكيد في بريدك).', emailTaken: 'هذا البريد مسجّل مسبقاً', rentalPending: 'تم تسجيل طلب الإيجار — بانتظار التفعيل بعد تأكيد الدفع', pending: 'بانتظار التفعيل', pendingNote: 'إيجارك بانتظار التفعيل. يتم التفعيل تلقائياً بعد تأكيد بوابة الدفع (Webhook) أو يدوياً من المشرف. يمكنك تجهيز منتجاتك الآن.', activate: 'تفعيل', cancelRental: 'إلغاء', activated: 'تم تفعيل الإيجار', fileTooLarge: 'حجم المقطع أكبر من الحد ({n} ميجابايت)', cancelled: 'ملغى', failed: 'فشل', pendingRentals: 'طلبات بانتظار التفعيل', forYou: 'لك', following: 'المتابَعون', home: 'الرئيسية', stores: 'المتاجر', inbox: 'الصندوق', me: 'حسابي', create: 'إنشاء',
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
  badLogin: 'اسم المستخدم أو كلمة المرور غير صحيحة', userTaken: 'اسم المستخدم مستخدم مسبقاً', fillAll: 'يرجى تعبئة الحقول المطلوبة', pwShort: 'كلمة المرور 6 أحرف على الأقل', pwShort8: 'كلمة المرور 8 أحرف على الأقل',
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
  email: 'Email', cloudNoteApi: 'Real email/password login (8+ characters).', demoNoticeCloud: 'Demo version — connected to your server', pwShort8: 'Password must be at least 8 characters', confirmEmailSent: 'Account created. Open your email, click the confirmation link, then log in.', unconfirmed: 'Please confirm your email first (open the link we sent you).', emailTaken: 'This email is already registered', rentalPending: 'Rental request recorded — awaiting activation after payment confirmation', pending: 'Pending activation', pendingNote: 'Your rental is pending. It is activated automatically after the payment gateway confirms (webhook) or manually by an admin. You can prepare your products now.', activate: 'Activate', cancelRental: 'Cancel', activated: 'Rental activated', fileTooLarge: 'Video is larger than the limit ({n} MB)', cancelled: 'Cancelled', failed: 'Failed', pendingRentals: 'Pending rentals', forYou: 'For You', following: 'Following', home: 'Home', stores: 'Stores', inbox: 'Inbox', me: 'Me', create: 'Create',
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

// ===== المرحلة 1: الإعدادات والخصوصية والحظر والتبليغ والردود (© 2026 وطن النهار) =====
Object.assign(ar, {
  settings: 'الإعدادات والخصوصية', secAccount: 'الحساب', secPrivacy: 'الخصوصية', secRequests: 'طلبات المتابعة', secBlocked: 'الحسابات المحظورة', secSoon: 'غير متاح في هذه المرحلة',
  privateAccount: 'حساب خاص', privateAccountSub: 'فقط المتابِعون الذين توافق عليهم يشاهدون مقاطعك. الطلبات المعلّقة تُقبل تلقائياً إذا رجعت الحساب عاماً.',
  whoComments: 'من يستطيع التعليق على مقاطعي', cp_everyone: 'الجميع', cp_followers: 'المتابِعون فقط', cp_nobody: 'لا أحد',
  allowDuet: 'السماح بالديويتو على مقاطعي', allowDuetSub: 'الآخرون يصوّرون بجانب مقطعك في شاشة مقسمة.', allowStitch: 'السماح بالستيتش على مقاطعي', allowStitchSub: 'الآخرون يختارون حتى 5 ثوانٍ من مقطعك ويكملون بعدها.',
  duet: 'ديويتو', stitch: 'ستيتش', duetWith: 'ديويتو مع', stitchWith: 'ستيتش مع', sourceUnavailable: 'المصدر غير متاح', remixOff: 'صاحب المقطع أوقف هذه الإضافة',
  duetHint: 'سيظهر مقطع المصدر بجانبك أثناء التصوير', stitchHint: 'بعد المقطع المختار سيُلحق تسجيلك', stitchPick: 'اختر مقطعاً حتى 5 ثوانٍ من المصدر', stitchRange: 'مقطع المصدر', stitchThenRecord: 'التالي: سجّل تكملتك',
  layoutLR: 'جنبًا إلى جنب', layoutTB: 'أعلى وأسفل', sourceRight: 'المصدر يمين', sourceLeft: 'المصدر يسار', sourceTop: 'المصدر أعلى', sourceBottom: 'المصدر أسفل',
  volSource: 'صوت المصدر', volMe: 'صوتي', audioMix: 'مزج الصوت', remixes: 'الديويتو والستيتش', noRemixes: 'لا إضافات بعد', n_remix: 'أضاف على مقطعك', n_remix_duet: 'أضاف ديويتو على مقطعك', n_remix_stitch: 'أضاف ستيتش على مقطعك',
  whoMessages: 'من يستطيع مراسلتي', whoMessagesSub: 'يُطبَّق مع الحظر والحساب الخاص في كل رسالة.', mp_everyone: 'الجميع', mp_followers: 'من أتابعه فقط', mp_mutual: 'المتابعة المتبادلة فقط', mp_nobody: 'لا أحد',
  message: 'رسالة', drafts: 'المسودات', draft: 'مسودة', noDrafts: 'لا توجد مسودات', noScheduled: 'لا يوجد نشر مجدول', draftSaved: 'حُفظت المسودة', scheduledOk: 'جُدول النشر', publishNow: 'نشر الآن', saveDraft: 'حفظ كمسودة', schedulePublish: 'جدولة النشر', scheduleAt: 'موعد النشر', publishWhen: 'متى يُنشر؟', scheduleNeed: 'اختر موعداً صالحاً (بعد 30 ثانية وعلى الأكثر 30 يوماً)', scheduled: 'مجدول', scheduledFor: 'موعد النشر: {d}', confirmDeleteDraft: 'حذف هذه المسودة؟',
  noConversations: 'لا رسائل بعد', noConversationsSub: 'ابدأ محادثة من صفحة أي حساب عبر زر الرسالة.', messagePh: 'اكتب رسالة…', noMessages: 'ابدأ المحادثة', shareClip: 'مشاركة مقطع', sharedClip: 'مقطع مشارك', clipUnavailable: 'المقطع غير متاح', deleteMessage: 'حذف الرسالة', messageDeleted: 'تم حذف الرسالة',
  messagesOff: 'هذا الحساب لا يستقبل رسائل', msgFollowersOnly: 'المراسلة لمن يتابعهم صاحب الحساب فقط', msgMutualOnly: 'المراسلة للمتابعة المتبادلة فقط',
  changePassword: 'تغيير كلمة المرور', currentPassword: 'كلمة المرور الحالية', newPassword: 'كلمة المرور الجديدة (8 أحرف على الأقل)', passwordChanged: 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى',
  badPassword: 'كلمة المرور الحالية غير صحيحة', logoutAll: 'تسجيل الخروج من كل الأجهزة', logoutAllConfirm: 'سيتم تسجيل خروجك من كل الأجهزة بما فيها هذا الجهاز. متأكد؟',
  editProfileLink: 'تعديل الملف الشخصي (الاسم، النبذة، الصورة)', noRequests: 'لا توجد طلبات متابعة', noBlocked: 'لم تحظر أحداً', accept: 'قبول', decline: 'رفض', unblock: 'إلغاء الحظر',
  soonList: 'التحقق بخطوتين · حذف الحساب · تنزيل بياناتك — لم تُبنَ بعد، لذلك لا تظهر كخيارات.',
  serverOnly: 'الإعدادات الحقيقية تعمل فقط مع الخادم (نسخة VPS). هذه نسخة تجريبية محلية.',
  requested: 'تم الطلب', requestSent: 'تم إرسال طلب المتابعة', privateProfile: 'هذا الحساب خاص', privateProfileSub: 'تابع هذا الحساب لمشاهدة مقاطعه بعد موافقة صاحبه.',
  blockedProfile: 'أنت حظرت هذا الحساب', block: 'حظر', blockConfirm: 'حظر @{u}؟ لن يرى أحدكما محتوى الآخر وستُلغى المتابعة بينكما.', blockedOk: 'تم الحظر', unblockedOk: 'تم إلغاء الحظر',
  more: 'المزيد', copyLink: 'نسخ الرابط', report: 'تبليغ', reportVideo: 'تبليغ عن المقطع', reportUser: 'تبليغ عن الحساب', reportComment: 'تبليغ عن التعليق', reportDetails: 'تفاصيل إضافية (اختياري)',
  reportSent: 'شكراً، وصل تبليغك للمشرف', alreadyReported: 'سبق أن بلّغت عن هذا', reportReason: 'سبب التبليغ',
  r_spam: 'رسائل مزعجة أو احتيال متكرر', r_harassment: 'تنمّر أو إساءة', r_hate: 'خطاب كراهية', r_violence: 'عنف أو خطر', r_nudity: 'محتوى غير لائق', r_scam: 'نصب أو منتج مزيّف', r_ip: 'انتهاك حقوق ملكية', r_other: 'سبب آخر',
  reply: 'رد', replyingTo: 'رد على @{u}', cancel: 'إلغاء', deleteComment: 'حذف', deleted: 'تم الحذف', commentsOff: 'صاحب المقطع أوقف التعليقات', followersOnly: 'التعليق للمتابِعين فقط', blocked: 'غير متاح بسبب الحظر',
  n_follow_request: 'طلب متابعتك', n_follow_accept: 'وافق على طلب متابعتك', n_reply: 'ردّ على تعليقك: {text}',
  reports: 'التبليغات', openReports: 'مفتوحة', closedReports: 'محسومة', noReports: 'لا توجد تبليغات', reporter: 'المُبلِّغ', target: 'المُبلَّغ عنه',
  a_dismiss: 'رفض التبليغ', a_hide_video: 'إخفاء المقطع', a_delete_comment: 'حذف التعليق', a_ban_user: 'إيقاف الحساب', t_video: 'مقطع', t_user: 'حساب', t_comment: 'تعليق', removeFollower: 'إزالة'
});
Object.assign(en, {
  settings: 'Settings & privacy', secAccount: 'Account', secPrivacy: 'Privacy', secRequests: 'Follow requests', secBlocked: 'Blocked accounts', secSoon: 'Not available yet',
  privateAccount: 'Private account', privateAccountSub: 'Only followers you approve can watch your clips. Pending requests are auto-approved if you switch back to public.',
  whoComments: 'Who can comment on my clips', cp_everyone: 'Everyone', cp_followers: 'Followers only', cp_nobody: 'No one',
  allowDuet: 'Allow duets of my clips', allowDuetSub: 'Others can film beside your clip in a split screen.', allowStitch: 'Allow stitches of my clips', allowStitchSub: 'Others can take up to 5 seconds of your clip and continue it.',
  duet: 'Duet', stitch: 'Stitch', duetWith: 'Duet with', stitchWith: 'Stitch with', sourceUnavailable: 'Source unavailable', remixOff: 'The creator turned this remix off',
  duetHint: 'The source clip will play beside you while you record', stitchHint: 'Your recording will be appended after the chosen segment', stitchPick: 'Pick up to 5 seconds from the source', stitchRange: 'Source segment', stitchThenRecord: 'Next: record your continuation',
  layoutLR: 'Side by side', layoutTB: 'Top and bottom', sourceRight: 'Source on the right', sourceLeft: 'Source on the left', sourceTop: 'Source on top', sourceBottom: 'Source at the bottom',
  volSource: 'Source volume', volMe: 'My volume', audioMix: 'Audio mix', remixes: 'Duets & stitches', noRemixes: 'No remixes yet', n_remix: 'remixed your clip', n_remix_duet: 'added a duet of your clip', n_remix_stitch: 'added a stitch of your clip',
  whoMessages: 'Who can message me', whoMessagesSub: 'Applied with blocking and private accounts on every send.', mp_everyone: 'Everyone', mp_followers: 'People I follow only', mp_mutual: 'Mutual follows only', mp_nobody: 'No one',
  message: 'Message', drafts: 'Drafts', draft: 'Draft', noDrafts: 'No drafts', noScheduled: 'Nothing scheduled', draftSaved: 'Draft saved', scheduledOk: 'Scheduled', publishNow: 'Publish now', saveDraft: 'Save as draft', schedulePublish: 'Schedule publish', scheduleAt: 'Publish at', publishWhen: 'When should it go live?', scheduleNeed: 'Pick a valid time (at least 30 seconds and at most 30 days from now)', scheduled: 'Scheduled', scheduledFor: 'Publishes: {d}', confirmDeleteDraft: 'Delete this draft?',
  noConversations: 'No messages yet', noConversationsSub: 'Start a conversation from a profile with the Message button.', messagePh: 'Write a message…', noMessages: 'Start the conversation', shareClip: 'Share a clip', sharedClip: 'Shared clip', clipUnavailable: 'Clip unavailable', deleteMessage: 'Delete message', messageDeleted: 'Message deleted',
  messagesOff: 'This account is not accepting messages', msgFollowersOnly: 'Only people this account follows can message them', msgMutualOnly: 'Only mutual follows can message this account',
  changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password (min 8 chars)', passwordChanged: 'Password changed; other devices signed out',
  badPassword: 'Current password is wrong', logoutAll: 'Log out of all devices', logoutAllConfirm: 'You will be logged out everywhere, including here. Continue?',
  editProfileLink: 'Edit profile (name, bio, photo)', noRequests: 'No follow requests', noBlocked: 'You have not blocked anyone', accept: 'Accept', decline: 'Decline', unblock: 'Unblock',
  soonList: 'Two-factor auth · account deletion · data download — not built yet, so they are not offered.',
  serverOnly: 'Real settings work only with the server (VPS) version. This is the local demo.',
  requested: 'Requested', requestSent: 'Follow request sent', privateProfile: 'This account is private', privateProfileSub: 'Follow this account to see its clips once approved.',
  blockedProfile: 'You blocked this account', block: 'Block', blockConfirm: 'Block @{u}? Neither of you will see the other\'s content and follows are removed.', blockedOk: 'Blocked', unblockedOk: 'Unblocked',
  more: 'More', copyLink: 'Copy link', report: 'Report', reportVideo: 'Report clip', reportUser: 'Report account', reportComment: 'Report comment', reportDetails: 'Extra details (optional)',
  reportSent: 'Thanks, your report reached the moderators', alreadyReported: 'You already reported this', reportReason: 'Reason',
  r_spam: 'Spam', r_harassment: 'Harassment or bullying', r_hate: 'Hate speech', r_violence: 'Violence or danger', r_nudity: 'Inappropriate content', r_scam: 'Scam or fake product', r_ip: 'Intellectual property', r_other: 'Other',
  reply: 'Reply', replyingTo: 'Replying to @{u}', cancel: 'Cancel', deleteComment: 'Delete', deleted: 'Deleted', commentsOff: 'Comments are turned off', followersOnly: 'Only followers can comment', blocked: 'Unavailable due to blocking',
  n_follow_request: 'requested to follow you', n_follow_accept: 'accepted your follow request', n_reply: 'replied to your comment: {text}',
  reports: 'Reports', openReports: 'Open', closedReports: 'Resolved', noReports: 'No reports', reporter: 'Reporter', target: 'Reported',
  a_dismiss: 'Dismiss', a_hide_video: 'Hide clip', a_delete_comment: 'Delete comment', a_ban_user: 'Suspend account', t_video: 'Clip', t_user: 'Account', t_comment: 'Comment', removeFollower: 'Remove'
});


// ===== المرحلة 2: الاستوديو ومكتبة الأصوات (© 2026 وطن النهار) =====
Object.assign(ar, {
  studio: 'الاستوديو', studioHint: 'صوّر من الكاميرا أو اختر ملفاً، ثم قصّ وأضف نصاً أو فلترًا قبل النشر.',
  recordCam: 'تصوير', recordCamSub: 'الكاميرا والميكروفون من المتصفح', pickHintStudio: 'MP4 أو WebM أو MOV — حتى 3 دقائق',
  startRec: 'بدء التصوير', stopRec: 'إيقاف', flipCam: 'قلب الكاميرا', recEmpty: 'لم يُحفظ أي تصوير',
  camDenied: 'لم يُسمح بالوصول للكاميرا أو الميكروفون. اسمح بالإذن من إعدادات المتصفح ثم حاول مرة أخرى.',
  camMissing: 'لا توجد كاميرا على هذا الجهاز.', camBusy: 'الكاميرا مشغولة في تطبيق آخر.', camInsecure: 'التصوير يحتاج صفحة آمنة (https أو localhost).',
  camFail: 'تعذر تشغيل الكاميرا.', camNoMic: 'تم التصوير بدون ميكروفون.',
  noRecorderHint: 'متصفحك لا يدعم تسجيل أو تصدير الفيديو (MediaRecorder). جرّب كروم أو فَيَرفُكس، أو اختر ملفاً جاهزاً. بعض نسخ متصفح هواوي لا تدعم هذه الميزة.',
  editClip: 'تحرير المقطع', trimRange: 'القص', speed: 'السرعة', filters: 'الفلاتر',
  flt_none: 'بدون', flt_gray: 'رمادي', flt_contrast: 'واضح', flt_warm: 'دافئ', flt_cool: 'بارد', flt_vintage: 'قديم',
  textOverlay: 'نص على المقطع', textPh: 'اكتب نصاً…', textColor: 'اللون', textSize: 'الحجم', textPos: 'الموضع', addText: 'إضافة نص',
  posTop: 'أعلى', posMid: 'وسط', posBot: 'أسفل',
  volOrig: 'صوت المقطع', volSound: 'صوت المكتبة', setCover: 'اعتماد هذه اللقطة غلافاً', coverSet: 'تم اختيار الغلاف', coverFail: 'تعذر التقاط الغلاف',
  exportNext: 'تصدير ثم متابعة', exporting: 'جارٍ التصدير', exportFail: 'فشل التصدير. جرّب متصفحاً أحدث أو اختر ملفاً أقصر.',
  exportHint: 'يُصدَّر المقطع غالباً بصيغة WebM داخل المتصفح (فلاتر ونصوص مدمجة في الصورة). بعض المتصفحات — ومنها نسخ من متصفح هواوي — قد لا تدعم التصدير أو التشغيل.',
  saveAsSound: 'حفظ صوت هذا المقطع في المكتبة ليُعاد استخدامه', backEdit: 'العودة للتحرير',
  badVideo: 'تعذر قراءة ملف الفيديو', videoTooLong: 'المقطع أطول من الحد ({n} ثانية)',
  soundLibrary: 'مكتبة الأصوات', soundLibNote: 'الأصوات هنا يرفعها المستخدمون أو تُستخرج من مقاطعهم. لا توجد مقاطع موسيقية محفوظة الحقوق في المكتبة. بلّغ عن أي صوت مخالف.',
  uploadSound: 'رفع صوت (ملف صوت أو مقطع لاستخراج الصوت)', soundTitle: 'اسم الصوت', soundTitlePh: 'مثال: نغمة قصيرة',
  publishSound: 'إضافة للمكتبة', soundSaved: 'أُضيف الصوت', noSounds: 'لا أصوات بعد', noSoundsSub: 'ارفع صوتاً أو استخرجه من مقطعك.',
  useSound: 'استخدام هذا الصوت', usingSound: 'سيُستخدم الصوت', clipsWithSound: 'مقاطع بهذا الصوت',
  usedBy: '{n} استخدام', reportSound: 'تبليغ عن الصوت', soundHidden: 'هذا الصوت غير متاح',
  badSound: 'ملف الصوت غير صالح', soundTooLong: 'الصوت أطول من الحد المسموح', noAudio: 'لا يوجد مسار صوتي في الملف',
  t_sound: 'صوت', a_hide_sound: 'إخفاء الصوت'
});
Object.assign(en, {
  studio: 'Studio', studioHint: 'Record from the camera or pick a file, then trim and add text or a filter before publishing.',
  recordCam: 'Record', recordCamSub: 'Camera and microphone in the browser', pickHintStudio: 'MP4, WebM or MOV — up to 3 minutes',
  startRec: 'Start recording', stopRec: 'Stop', flipCam: 'Flip camera', recEmpty: 'Nothing was recorded',
  camDenied: 'Camera or microphone permission was denied. Allow it in the browser settings and try again.',
  camMissing: 'No camera was found on this device.', camBusy: 'The camera is in use by another app.', camInsecure: 'Recording needs a secure page (https or localhost).',
  camFail: 'Could not start the camera.', camNoMic: 'Recording without a microphone.',
  noRecorderHint: 'Your browser cannot record or export video (MediaRecorder). Try Chrome or Firefox, or pick an existing file. Some Huawei browser builds lack this feature.',
  editClip: 'Edit clip', trimRange: 'Trim', speed: 'Speed', filters: 'Filters',
  flt_none: 'None', flt_gray: 'Gray', flt_contrast: 'Crisp', flt_warm: 'Warm', flt_cool: 'Cool', flt_vintage: 'Vintage',
  textOverlay: 'On-screen text', textPh: 'Type text…', textColor: 'Color', textSize: 'Size', textPos: 'Position', addText: 'Add text',
  posTop: 'Top', posMid: 'Middle', posBot: 'Bottom',
  volOrig: 'Clip volume', volSound: 'Library sound volume', setCover: 'Use this frame as cover', coverSet: 'Cover saved', coverFail: 'Could not capture a cover',
  exportNext: 'Export and continue', exporting: 'Exporting', exportFail: 'Export failed. Try a newer browser or a shorter file.',
  exportHint: 'The clip is usually exported as WebM in the browser (filters and text are baked into the picture). Some browsers — including some Huawei builds — may not support export or playback.',
  saveAsSound: 'Save this clip’s sound to the library so others can reuse it', backEdit: 'Back to edit',
  badVideo: 'Could not read the video file', videoTooLong: 'The clip is longer than the limit ({n} seconds)',
  soundLibrary: 'Sound library', soundLibNote: 'Sounds here are uploaded by users or extracted from their clips. The library does not ship copyrighted music. Report anything that should not be here.',
  uploadSound: 'Upload a sound (audio file, or a video to extract audio from)', soundTitle: 'Sound name', soundTitlePh: 'e.g. short tone',
  publishSound: 'Add to library', soundSaved: 'Sound added', noSounds: 'No sounds yet', noSoundsSub: 'Upload a sound or extract one from your clip.',
  useSound: 'Use this sound', usingSound: 'Using sound', clipsWithSound: 'Clips with this sound',
  usedBy: '{n} uses', reportSound: 'Report sound', soundHidden: 'This sound is not available',
  badSound: 'Invalid sound file', soundTooLong: 'The sound is longer than allowed', noAudio: 'The file has no audio track',
  t_sound: 'Sound', a_hide_sound: 'Hide sound'
});


// ===== الدخول بحساب Google (© 2026 وطن النهار) =====
Object.assign(ar, {
  continueWithGoogle: 'المتابعة بحساب Google',
  orDivider: 'أو',
  badGoogle: 'تعذر الدخول بحساب Google. حاول مرة أخرى.',
  googleDisabled: 'الدخول بحساب Google غير مفعّل حالياً.',
  googleUnavailable: 'تعذر تحميل زر Google. حدّث الصفحة ثم حاول.',
  googleLinked: 'هذا البريد مرتبط بحساب Google آخر.',
  privacyPolicy: 'سياسة الخصوصية', termsOfUse: 'شروط الاستخدام'
});
Object.assign(en, {
  continueWithGoogle: 'Continue with Google',
  orDivider: 'or',
  badGoogle: 'Google sign-in failed. Please try again.',
  googleDisabled: 'Google sign-in is not enabled.',
  googleUnavailable: 'Could not load the Google button. Refresh and try again.',
  googleLinked: 'This email is already linked to a different Google account.',
  privacyPolicy: 'Privacy policy', termsOfUse: 'Terms of use'
});

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
