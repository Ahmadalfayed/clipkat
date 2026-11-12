// © 2026 وطن النهار — حدود تصوير الكاميرا في الاستوديو (منطق بسيط قابل للاختبار بلا متصفح)
export const REC_DEFAULT_SEC = 180;          // 3 دقائق = نفس حد المقطع على الخادم
export const REC_TIMESLICE_MS = 1000;        // MediaRecorder يسلّم قطعة كل ثانية (ذاكرة أقل وعدم فقدان التسجيل)
export const REC_VIDEO_BPS = 2_500_000;      // ≈ 57 ميجابايت لـ 3 دقائق (أقل بكثير من حد الرفع)
export const REC_AUDIO_BPS = 128_000;

export const recLimitSec = (maxVideoSec) => {
  const n = Number(maxVideoSec);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 600) : REC_DEFAULT_SEC;
};
export const fmtClock = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const recExt = (mime = '') => (/mp4/i.test(mime) ? 'mp4' : 'webm');
// حالة العدّاد من الزمن الفعلي (لا يتأثر بتباطؤ setInterval على الجوال)
export function recState(startedAt, now, limitSec) {
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  return { elapsed, label: `${fmtClock(Math.min(elapsed, limitSec))} / ${fmtClock(limitSec)}`, progress: Math.min(1, elapsed / limitSec), warn: limitSec - elapsed <= 10, done: elapsed >= limitSec };
}
