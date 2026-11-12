// © 2026 وطن النهار — اختيار صيغة MediaRecorder لكل متصفح (قابل للاختبار بلا متصفح)
// سفاري/آيفون (وكل متصفحات iOS لأنها WebKit) تسجّل MP4 (H.264/AAC) فقط، وكروم/فايرفوكس WebM.
export const MP4_TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'];
export const WEBM_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function isWebKitUA(ua = '', platform = '', maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;                                   // كل متصفحات iOS
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return true;                       // iPadOS بوضع سطح المكتب
  return /AppleWebKit/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|HuaweiBrowser|SamsungBrowser/i.test(ua) || /CriOS|FxiOS|EdgiOS/i.test(ua);
}
// يُرجع النوع المدعوم، أو '' = «دع المتصفح يختار» (نُنشئ MediaRecorder بلا mimeType)
export function pickRecorderMime({ isTypeSupported, ua = '', maxTouchPoints = 0 } = {}) {
  const order = isWebKitUA(ua, '', maxTouchPoints) ? [...MP4_TYPES, ...WEBM_TYPES] : [...WEBM_TYPES, ...MP4_TYPES];
  if (typeof isTypeSupported !== 'function') return '';
  for (const t of order) { try { if (isTypeSupported(t)) return t; } catch { /* نتابع */ } }
  return '';
}
// الامتداد والنوع النهائيان للملف المسجّل
export function recordedType(recMime, blobType, chosen, webkit) {
  const t = recMime || blobType || chosen || (webkit ? 'video/mp4' : 'video/webm');
  return { type: t.split(';')[0].trim() || t, ext: /mp4|quicktime/i.test(t) ? 'mp4' : 'webm' };
}
