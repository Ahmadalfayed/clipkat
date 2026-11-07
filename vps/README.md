# كليب كات / ClipKat — حزمة الاستضافة الذاتية (VPS + Docker)

نسخة «ClipKat» تعمل على سيرفرك الخاص (مثل Hostinger VPS) بدل Supabase:
**Docker Compose = قاعدة PostgreSQL + تطبيق Node.js + Caddy (HTTPS تلقائي عند وجود نطاق).**

> **المرحلة 1 (جديد):** إعدادات وخصوصية، حساب خاص وطلبات متابعة، حظر، تبليغ ومراجعة مشرف، ردود على التعليقات — التفاصيل والتحديث في **المرحلة-1-دليل-التحديث.md**. الاختبارات: `cd server && npm test` (تحتاج `TEST_DATABASE_URL`).

## التثبيت (Ubuntu 22.04 / 24.04)
```bash
unzip clipkat-vps.zip && cd clipkat-vps
sudo bash install.sh
```
الدليل المبسّط بالعربية: **دليل-التثبيت-هوستنجر.html** (أو `.md`).

## ما في المجلد
| المسار | الوظيفة |
|---|---|
| `install.sh` | مثبّت واحد: Docker، أسرار عشوائية، تشغيل، ufw، نسخ احتياطي يومي |
| `update.sh` / `backup.sh` / `restore.sh` | تحديث / نسخ احتياطي (قاعدة+ملفات) / استرجاع |
| `docker-compose.yml`, `Dockerfile`, `Caddyfile`, `.env.example` | تعريف الحزمة |
| `db/schema.sql` | مخطط PostgreSQL + بذور الخطط (يُطبَّق تلقائياً) |
| `server/` | الـ API (Express) — انظر `server/README.md` |
| `web/` | الواجهة الأمامية؛ `js/services/api-adapter.js` يتصل بالـ API، و`local-adapter.js` للوضع التجريبي |

## وضع البيانات (`web/js/config.js`)
`DATA_MODE = 'auto'` (الافتراضي): API إن كان الخادم يعمل وإلا الوضع التجريبي. `'api'` أو `'demo'` لفرض أحدهما. لاستضافة الواجهة وحدها كنسخة تجريبية (مثل GitHub Pages) ضع `'demo'`.

## الإيجار والدفع
الدفع تجريبي (Mock). بعد «الدفع» يبقى الإيجار **قيد الانتظار (pending)** ولا يمكن تفعيله من المتصفح؛ المشرف يفعّله من صفحة الإدارة. الربط الحقيقي مع Tap/MyFatoorah هيكل أولي غير مكتمل (`server/README.md`).

## الرخصة
جميع الحقوق محفوظة — انظر `LICENSE` (خط Cairo بترخيص OFL). تنبيه: اسم «ClipKat/كليب كات» قريب من علامات موجودة (KitKat) — مراجعة الاسم قبل أي إطلاق تجاري لم تتغير.
