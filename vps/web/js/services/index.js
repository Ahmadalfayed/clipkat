// نقطة الدخول الوحيدة لطبقة البيانات (النسخة الذاتية على VPS):
//  DATA_MODE في js/config.js:
//   'auto' (الافتراضي) → إن استجاب الخادم على /api/config نستخدم ApiAdapter، وإلا نرجع للوضع التجريبي المحلي
//   'api'              → ApiAdapter فقط (إن فشل نرجع للتجريبي مع تحذير في الـ console)
//   'demo'             → LocalAdapter (بيانات في المتصفح فقط)
import { DATA_MODE, API_BASE } from '../config.js';
import { LocalAdapter } from './local-adapter.js';

let impl;
if (DATA_MODE !== 'demo') {
  try {
    const { createApiAdapter } = await import('./api-adapter.js');
    impl = await createApiAdapter({ base: API_BASE });
  } catch (e) {
    if (DATA_MODE === 'api') console.error('[ClipKat] API server unreachable — falling back to local demo mode:', e);
    impl = new LocalAdapter();
  }
} else impl = new LocalAdapter();
export const api = impl;
