// © 2026 وطن النهار — مزوّدو دفع شحن العملات (لهدايا البث فقط).
// هذا الملف لا علاقة له بمبيعات المتاجر: التعامل بين التاجر والمشتري مباشر ولا تأخذ كليب كات منه أي مبلغ.
//
// الواجهة الموحّدة لكل مزوّد:
//   configured()                       → هل المفاتيح موجودة في .env
//   live                               → true = يخصم أموالاً حقيقية
//   createCharge({ purchase, user, returnUrl, webhookUrl }) → { status: 'paid' } فوراً (التجريبي)
//                                         أو { redirectUrl, ref } لصفحة دفع المزوّد (KNET/بطاقات)
//   verify({ purchase, req })          → { paid: boolean, ref, amount, currency } بعد العودة أو عند الـ webhook
//
// حالياً: المزوّد الوحيد المفعّل هو "demo" (وضع تجريبي، لا يخصم شيئاً). MyFatoorah وTap جاهزان كهيكل فقط —
// يكفي لاحقاً إكمال createCharge/verify هنا ووضع المفاتيح في .env ثم PAYMENT_PROVIDER=myfatoorah أو tap.
import { config } from './config.js';
import { HttpError } from './util.js';

const env = process.env;
const notReady = (name) => { throw new HttpError(503, 'payNotReady', { provider: name }); };

export const providers = {
  demo: {
    name: 'demo', live: false,
    configured: () => true,
    async createCharge({ purchase }) { return { status: 'paid', ref: `demo-${purchase.id}` }; },
    async verify({ purchase }) { return { paid: true, ref: `demo-${purchase.id}`, amount: purchase.price, currency: purchase.currency }; }
  },
  // MyFatoorah (KNET + بطاقات) — https://docs.myfatoorah.com : ExecutePayment ثم GetPaymentStatus
  myfatoorah: {
    name: 'myfatoorah', live: true,
    configured: () => !!(env.MYFATOORAH_API_KEY || '').trim(),
    baseUrl: () => (env.MYFATOORAH_BASE_URL || 'https://api.myfatoorah.com').trim(),
    async createCharge() { notReady('myfatoorah'); },
    async verify() { notReady('myfatoorah'); }
  },
  // Tap Payments (KNET src_kw.knet) — https://developers.tap.company : POST /v2/charges ثم GET /v2/charges/:id
  tap: {
    name: 'tap', live: true,
    configured: () => !!(env.TAP_SECRET_KEY || '').trim(),
    async createCharge() { notReady('tap'); },
    async verify() { notReady('tap'); }
  }
};

export const provider = () => providers[config.paymentProvider] || providers.demo;
export const isDemo = () => !provider().live;
