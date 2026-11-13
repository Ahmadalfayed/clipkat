// يحوّل رابط التشغيل الموقّع (/vs/<payload>/<sig>.mp4) إلى مسار الملف الخام /uploads/videos/... (للاختبارات فقط)
export function rawUrl(src) {
  const m = /^\/vs\/([^/]+)\//.exec(String(src || ''));
  if (!m) return src;
  return '/uploads/videos/' + JSON.parse(Buffer.from(m[1], 'base64url').toString()).p;
}
