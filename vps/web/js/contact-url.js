// © 2026 وطن النهار — رابط التواصل للمتجر (نفس قواعد الخادم في server/src/util.js normContact)
// رقم/واتساب → https://wa.me/<أرقام> · ‎@حساب أو instagram.com/x → https://instagram.com/x · نطاق بدون https → https://
// يرجع '' إذا فارغ، أو رابط http/https فقط، أو null إذا الصيغة غير مفهومة
export function normContact(v) {
  let s = String(v ?? '').replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (!s) return '';
  if (s.length > 300) return null;
  let url;
  const digits = s.replace(/[\s\-().]/g, '');
  if (/^\+?\d{7,15}$/.test(digits)) {
    let n = digits.replace(/^\+/, '').replace(/^00/, '');
    if (n.length === 8) n = '965' + n;
    if (n.length < 8 || n.length > 15) return null;
    url = 'https://wa.me/' + n;
  } else if (/^@[A-Za-z0-9._]{1,30}$/.test(s)) url = 'https://instagram.com/' + s.slice(1);
  else if (/^https?:\/\//i.test(s)) url = s;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(s)) return null;
  else if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/?#]\S*)?$/i.test(s)) url = 'https://' + s;
  else return null;
  let u; try { u = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password || /\s/.test(url)) return null;
  const out = u.href;
  return out.length > 300 || !/^https?:\/\//i.test(out) ? null : out;
}

// رسالة عربية/إنجليزية واضحة تحدد الحقل الخاطئ في نموذج المتجر
export function storeErrorMessage(ex, t) {
  if (ex?.message === 'tooLarge') return t('storeErr_imageLarge', { n: ex.limit || 10 });
  const f = ex?.field;
  if (f && t('storeErr_' + f) !== 'storeErr_' + f) return t('storeErr_' + f);
  const m = ex?.message || '';
  if (m === 'exists') return t('storeErr_exists');
  if (m === 'auth') return t('storeErr_auth');
  if (m === 'badFile' || m === 'bad image') return t('storeErr_image');
  if (m === 'tooLarge') return t('storeErr_imageLarge', { n: ex.limit || 10 });
  if (m === 'policyRequired') return 'يجب الموافقة على سياسة تأجير المتاجر أولاً';
  if (m === 'full') return t('soldOut');
  if (m === 'notfound') return t('storeErr_plan');
  if (/[\u0600-\u06FF]/.test(m)) return m;              // رسالة عربية جاهزة من الخادم (مثل كثرة المحاولات)
  if (ex?.name === 'TypeError' || ex?.name === 'AbortError' || m === 'Failed to fetch' || m === 'Load failed') return t('storeErr_network');
  return t('storeErr_generic');
}
