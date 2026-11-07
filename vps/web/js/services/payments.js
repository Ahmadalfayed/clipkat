// ===== بوابة الدفع — وضع تجريبي (Mock) =====
// لا يتم خصم أي مبلغ. نقطة الربط الحقيقية موضّحة أدناه.
//
// للتشغيل الفعلي (Tap Payments أو MyFatoorah):
// 1) الواجهة تستدعي دالة خادم (مثلاً مسار في الخادم: POST /api/payments/create (غير مُنفَّذ بعد)) مع planId و storeId فقط —
//    لا ترسل المبلغ من المتصفح؛ الخادم يحسبه من جدول الخطط.
// 2) الخادم ينشئ عملية دفع:
//    - Tap:        POST https://api.tap.company/v2/charges   (source.id = "src_kw.knet" أو "src_card" / Apple Pay)
//    - MyFatoorah: POST {baseUrl}/v2/ExecutePayment          (PaymentMethodId لـ KNET / Visa-Master / Apple Pay)
//    ويعيد رابط الدفع (transaction.url / PaymentURL) فتنتقل إليه الواجهة.
// 3) بعد الدفع تُعيد البوابة المستخدم إلى redirect URL، والأهم: Webhook يصل للخادم،
//    يتحقق الخادم من التوقيع/الحالة (CAPTURED / Paid) ثم يُفعّل الإيجار ويُحدّث expires_at في قاعدة البيانات.
// 4) لا تُفعّل أي متجر بناءً على رد المتصفح وحده.

export const PAYMENT_METHODS = ['knet', 'card', 'applepay'];
export const GATEWAY = { provider: 'mock', live: false };

export async function startPayment({ amount, currency = 'KWD', method, description }) {
  // HOOK: استبدل هذا بـ: const { url } = await fetch('/functions/v1/create-payment', {...}); location.href = url;
  await new Promise((r) => setTimeout(r, 1100));
  if (!PAYMENT_METHODS.includes(method)) return { ok: false, error: 'method' };
  return { ok: true, ref: 'DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase(), amount, currency, method, description, provider: GATEWAY.provider, at: Date.now() };
}
