# كليب كات · ClipKat — نموذج أولي (Prototype)

تطبيق ويب للمقاطع القصيرة (عمودي، تمرير بملء الشاشة) مع **«متاجر للإيجار»**: البائع يستأجر واجهة متجر بخطة أسبوعية/شهرية/سنوية (بالدينار الكويتي)، يضيف منتجاته، ثم يربطها بمقاطعه لتظهر كبطاقة تسوّق في الفيد.

> 🔗 النسخة التجريبية: https://ahmadalfayed.github.io/clipkat/

> ⚠️ **نسخة تجريبية.** لا يوجد خادم: كل البيانات في متصفحك (localStorage + IndexedDB). تسجيل الدخول **غير آمن** (للعرض فقط)، والدفع **تجريبي** (لا خصم).

## التشغيل
يحتاج خادماً محلياً (لا يعمل من `file://` لأن ES Modules و `crypto.subtle` تتطلب سياقاً آمناً: `localhost` أو `https`):
```bash
cd clip-souq && python3 -m http.server 8080   # ثم افتح http://localhost:8080
# أو: node ../clip-souq-tools/serve.js 8080 .   (يدعم Range لتشغيل الفيديو بسلاسة)
```
حسابات تجريبية (كلمة المرور `demo1234`): `sara.travels` (مستخدم)، `fahad.coffee` (بائع لديه متجر)، `admin` (مشرف). توجد أزرار دخول سريع في صفحة الدخول، وزر «إعادة ضبط البيانات التجريبية» في صفحة حسابي.

## الاسم والهوية
- الاسم في ثابت واحد: `js/config.js` → `BRAND = { ar: 'كليب كات', en: 'ClipKat' }` (و `<title>` في `index.html` و `manifest.webmanifest` كقيم أولية). غيّره من هناك.
- الشعار أصلي: رأس قطة بأذنين بداخله زر تشغيل، بتدرّج زمردي ← كهرماني (`assets/logo.svg`، و `logoMark()` في `js/ui.js`). لا يستخدم أي أصول أو ألوان أو أسماء لتطبيقات أخرى.

## البنية
```
index.html, manifest.webmanifest, css/app.css
js/config.js          BRAND، الخطط، عدد المساحات، التصنيفات
js/i18n.js            العربية (افتراضي RTL) + الإنجليزية، تنسيق الأرقام/العملة/الوقت
js/ui.js              أيقونات SVG، شعار، صور رمزية/منتجات مولّدة، toast، bottom sheet
js/app.js             موجّه hash + الشريط السفلي + المظهر/اللغة
js/services/index.js  ← نقطة تبديل طبقة البيانات (سطر واحد)
js/services/local-adapter.js  LocalAdapter (localStorage للسجلات + IndexedDB للفيديو)
js/services/blobstore.js      غلاف IndexedDB
js/services/payments.js       بوابة دفع وهمية + تعليقات ربط Tap / MyFatoorah
js/services/seed.js           بيانات تجريبية
js/views/*.js         feed, discover, upload, inbox, profile, auth, stores (سوق/متجر/خطط), checkout, dashboard, admin
media/videos, media/posters   مقاطع مولّدة محلياً (رسوم canvas + لحن مركّب) — CC0
assets/fonts          خط Cairo (رخصة OFL، انظر OFL.txt)
```
المسارات: `#/feed` `#/following` `#/watch/:id` `#/discover` `#/tag/:tag` `#/upload` `#/inbox` `#/profile/:id` `#/me` `#/login` `#/stores` `#/store/:id` `#/rent` `#/checkout/:plan` `#/dashboard` `#/admin`

## واجهة خدمة البيانات (كل الدوال async)
| المجال | الدوال |
|---|---|
| تهيئة | `init()`, `resetDemo()` |
| مصادقة | `currentUser()`, `signUp({username,name,password})`, `login(u,p)`, `logout()` |
| مستخدمون | `getUser(id)`, `listUsers()`, `updateProfile({name,bio,avatar})`, `toggleFollow(id)`, `isFollowing(a,b)`, `userStats(id)` |
| مقاطع | `listVideos({tab,userId,tag,savedBy,likedBy,productStoreId})`, `getVideo(id)`, `videoURL(v)`, `createVideo({file,poster,caption,hashtags,sound,productIds})`, `videoStats(v)`, `toggleLike(id)`, `setLike(id)`, `toggleSave(id)`, `recordShare(id)` |
| تعليقات | `listComments(videoId)`, `addComment(videoId,text)` |
| اكتشاف | `trendingTags(n)`, `topCreators(n)`, `search(q)` |
| متاجر | `slots()`, `listStores({q,category})`, `getStore(id)`, `getStoreByOwner(uid)`, `getMyStore()`, `storeStatus(store)`, `createStoreWithRental({store,planId,payment})`, `renewRental({storeId,planId,payment})`, `updateStore(id,patch)`, `listRentals({storeId})` |
| منتجات | `listProducts(storeId)`, `getProduct(id)`, `productsByIds(ids)`, `saveProduct(p)`, `deleteProduct(id)` |
| إشعارات | `listNotifications()`, `unreadCount()`, `markAllRead()` |
| مشرف | `adminSummary()` |

### الانتقال إلى Supabase (مقترح)
1. أنشئ `js/services/supabase-adapter.js` بنفس الدوال أعلاه، وغيّر سطر الاستيراد في `js/services/index.js`.
2. الجداول (Postgres): `profiles(id uuid → auth.users, username unique, name, bio, avatar_url, role)`, `follows(follower, followee, pk)`, `videos(id, user_id, storage_path, poster_url, caption, hashtags text[], sound, created_at, status)`, `video_products(video_id, product_id)`, `likes`, `saves`, `comments`, `stores(id, owner_id unique, name, category, description, contact_url, logo_url, banner_url, plan_id, featured, verified, expires_at)`, `products(id, store_id, name, price numeric(10,3), stock, image_url)`, `rentals(id, store_id, plan_id, amount, gateway, gateway_ref, status, paid_at, start_at, end_at)`, `plans`, `notifications`, `reports` (للإبلاغ).
3. **RLS**: القراءة عامة للمحتوى المنشور؛ الكتابة لمالك الصف فقط (`auth.uid() = user_id/owner_id`)؛ `rentals` و `stores.expires_at/featured/verified` تُكتب **من الخادم فقط** (Edge Function بمفتاح service role بعد التحقق من Webhook الدفع).
4. **Auth**: Supabase Auth (بريد/OTP جوال/Apple/Google) بدلاً من التخزين المحلي — احذف `passHash` تماماً.
5. **الفيديو**: رفع مباشر (TUS/resumable) إلى Storage أو خدمة فيديو مخصّصة (Cloudflare Stream / Mux) لتحويل HLS وصور مصغّرة؛ `videoURL()` يُرجع رابط HLS/CDN.
6. Firebase بديل مماثل: Auth + Firestore (نفس المجموعات) + Cloud Storage + Cloud Functions للـ Webhooks.

## الدفع
`js/services/payments.js` → `startPayment()` وهمية الآن. للتشغيل الفعلي: الواجهة تستدعي دالة خادم تنشئ عملية دفع لدى Tap (`POST /v2/charges`) أو MyFatoorah (`ExecutePayment`) وتعيد رابط الدفع؛ تفعيل/تجديد الإيجار يتم فقط بعد Webhook موثّق.

## الاختبار
`/workspace/clip-souq-tools/test.js` (Playwright + Chromium، جوال 390×844 وسطح مكتب 1366×900): تسجيل، تمرير، إعجاب، نقر مزدوج، تعليق، حفظ/مشاركة/متابعة، استئجار متجر، إضافة/تعديل منتج، رفع فيديو وربط منتج، صفحة المتجر، السوق، الملف، الاكتشاف، الصندوق، الوضع الداكن، الإنجليزية، المشرف، وصفر أخطاء في الـ console.

## الترخيص
جميع الحقوق محفوظة — انظر `LICENSE` (خط Cairo مستثنى برخصة OFL).
