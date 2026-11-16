# كليب كات — تطبيق أندرويد

جميع الحقوق محفوظة © 2026 وطن النهار

غلاف أصلي (WebView) يفتح الموقع الحي [clipkat.live](https://clipkat.live). ليس حزمة Capacitor لملفات ثابتة: الاستوديو والبث المباشر والمكالمات والمتجر تعتمد على الخادم وLiveKit (`live.clipkat.live`).

- معرّف التطبيق: `live.clipkat.app`
- الاسم: كليب كات
- الإصدار: `1.0.0` (`versionCode` 1)
- `minSdk 24` (أندرويد 7) و`targetSdk`/`compileSdk` 36
- **بدون Google Play Services أو Firebase** — يعمل على أجهزة هواوي.

## ماذا يفعل الغلاف

- يبقى التصفح داخل التطبيق لنطاقَي `clipkat.live` و`live.clipkat.live` (و`www`).
- الروابط الخارجية (واتساب `wa.me`، روابط الدفع، `mailto`، وغيرها) تُفتح في Custom Tab أو متصفح النظام. إن لم يتوفر Chrome على هواوي يُستخدم المتصفح المتاح.
- زر الرجوع يمر على سجل WebView ثم يخرج إلى الخلفية.
- سحب للتحديث في الصفحات غير البث والفيديو العمودي (لا يقاطع شريط الفيديو أو البث).
- صفحة عربية بدون إنترنت، مع إعادة محاولة تلقائية عند عودة الشبكة.
- `getUserMedia`: يطلب إذن الكاميرا/الميكروفون من أندرويد ثم يمنحها لـ WebView (استوديو التسجيل، البث عبر LiveKit، المكالمات).
- اختيار الملفات (`<input type=file>`) مع إمكانية التصوير، والتحميل عبر DownloadManager.

## تسجيل الدخول بجوجل

الموقع يستخدم Google Identity Services (زر «متابعة مع Google» داخل الصفحة، `ux_mode: popup` ثم `POST /api/auth/google`). **جوجل لا تدعم هذا التدفق داخل WebView** (`disallowed_useragent`).

ما يفعله هذا التطبيق:

- يضبط وكيل المستخدم ليبدو كمتصفح Chrome (يحذف علامة `wv`) حتى لا تظهر صفحة الخطأ فوراً.
- نوافذ `window.open` تُفتح داخل التطبيق (نفس ملفات تعريف الارتباط) لأنها الطريقة الوحيدة التي قد تُرجع بيانات GIS إلى الصفحة.
- إن ظهرت صفحة المنع، تُعرض رسالة عربية تقترح **البريد وكلمة المرور** (يعمل داخل التطبيق) أو فتح الموقع في المتصفح.

ما لا يمكن ضمانه في 1.0.0 بدون تغيير الخادم: إكمال جلسة جوجل عبر Custom Tab ثم إعادتها إلى WebView (ملفات الارتباط لا تُشارك، وتدفق GIS يعتمد على `postMessage` من النافذة المنبثقة). تسجيل الدخول بالبريد وكلمة المرور هو المسار المعتمد داخل التطبيق.

لا نستخدم حزمة Google Sign-In الرسمية لأنها تحتاج خدمات جوجل ولن تعمل على هواوي.

## التوقيع

ملف المفتاح **خارج المستودع** وهو النسخة الوحيدة:

- `/workspace/clipkat-signing/clipkat-upload.p12`
- `/workspace/clipkat-signing/keystore.properties` (صلاحية 600)

يمكن تغيير المسار بالمتغير `CLIPKAT_SIGNING_PROPS`. لا ترفع المفتاح أو كلمات السر إلى GitHub أبداً. احتفظ بنسخة احتياطية آمنة؛ بدونها لا يمكن تحديث التطبيق على Google Play بنفس المعرّف.

## البناء

```bash
export ANDROID_HOME=/home/box/opt/android-sdk   # أو مسار الـ SDK عندك
export JAVA_HOME=...                            # JDK 17
cd android-app
./gradlew bundleRelease assembleRelease assembleDebug
```

- AAB (Google Play): `app/build/outputs/bundle/release/app-release.aab`
- APK موقّع: `app/build/outputs/apk/release/app-release.apk`

متطلبات التشغيل: كاميرا وميكروفون للتسجيل/البث/المكالمات، وشبكة للوصول إلى clipkat.live.

## تحديث الإصدار

ارفع `versionCode` و`versionName` في `app/build.gradle` قبل كل رفع للمتجر.
