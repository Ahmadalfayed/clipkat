// نقطة الدخول الوحيدة لطبقة البيانات. لاستبدالها بـ Supabase/Firebase:
// أنشئ SupabaseAdapter بنفس أسماء الدوال (انظر README) وغيّر السطر التالي فقط.
import { LocalAdapter } from './local-adapter.js';
export const api = new LocalAdapter();
