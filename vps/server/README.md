# ClipKat server (Express + PostgreSQL)

الخادم يقدّم الواجهة الأمامية (`web/`) وواجهة REST تحت `/api`. الإعدادات من متغيرات البيئة (ملف `.env`).

## الأمان المطبَّق
- كلمات المرور: scrypt مع ملح عشوائي (Node المدمج). الجلسة: JWT في كوكي `HttpOnly` + `SameSite=Strict` (+`Secure` مع HTTPS) وحقل `token_version` لإبطال الجلسات.
- تحديد المعدّل: عام (600/دقيقة/IP)، ودخول/تسجيل (20/15 دقيقة/IP)، ورفع (60 فيديو/ساعة)، وتعليقات.
- حماية CSRF: كل طلب يغيّر بيانات يحتاج ترويسة `X-CK: 1` (تُجبر المتصفح على CORS preflight).
- helmet (CSP صارم، HSTS مع HTTPS)، CORS مغلق افتراضياً (`CORS_ORIGINS` لإضافة مواقع).
- رفع الملفات: حد حجم قابل للضبط (`MAX_VIDEO_MB`)، التحقق من النوع الحقيقي بالبايتات الأولى (mp4/mov/webm، jpg/png/webp)، أسماء عشوائية، مجلد لكل مستخدم، تنظيف الملفات المؤقتة، `nosniff`.
- كل المدخلات تُتحقَّق في الخادم (أطوال، UUID، روابط الصور محلية فقط). الأسعار تُحسب من جدول `plans` في الخادم.
- **التأجير:** الإنشاء/التجديد من المتصفح يسجّل `pending` فقط. التفعيل لا يتم إلا عبر `POST /api/admin/rentals/:id/activate` (حساب `is_admin`) أو Webhook الدفع.

## Webhook الدفع (هيكل أولي — غير مكتمل)
`POST /api/payment-webhook/tap|myfatoorah` معطّل ما لم تضع `WEBHOOK_SECRET` في `.env`. الحالي: يتحقق من ترويسة سرّية بسيطة `x-webhook-secret` ثم يفعّل الإيجار `{ rentalId, paid:true, ref }`.
**قبل استخدامه مع دفع حقيقي يجب إكمال (TODO):**
1. دالة إنشاء دفع في الخادم (`POST /api/payments/create`) تحسب المبلغ من `plans` وتنشئ شحنة Tap (`/v2/charges`) أو `ExecutePayment` في MyFatoorah وتحفظ معرّفها في `rentals.gateway_ref`.
2. التحقق الحقيقي: Tap → حساب HMAC `hashstring` وإعادة جلب الشحنة `GET /v2/charges/:id` والتأكد أن `status=CAPTURED` والمبلغ/العملة تطابق الإيجار. MyFatoorah → التحقق من توقيع الـ Webhook ثم `GetPaymentStatus`.
3. اختبار كامل في بيئة sandbox للبوابة.
حتى ذلك الحين: فعّل الإيجارات يدوياً من صفحة المشرف.

## أوامر
- تغيير كلمة مرور حساب: `docker compose exec app node server/src/cli-reset-password.js البريد 'كلمة-جديدة'`
- جعل حساب مشرفاً: `docker compose exec db psql -U clipkat -d clipkat -c "update profiles set is_admin=true where lower(email)=lower('البريد')"`

## واجهة REST (مختصر)
`/api/auth/{signup,login,logout,me}` · `/api/users/…` · `/api/videos` (GET/POST multipart) · `/api/videos/:id/{like,save,share,comments}` · `/api/upload/image` · `/api/stores…` · `/api/products…` · `/api/notifications…` · `/api/admin/{summary,rentals/:id/activate,rentals/:id/cancel}` · `/api/health`
