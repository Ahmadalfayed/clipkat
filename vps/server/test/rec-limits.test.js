// © 2026 وطن النهار — حدود تصوير الكاميرا في الاستوديو (3 دقائق)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recLimitSec, recState, recExt, fmtClock, REC_DEFAULT_SEC, REC_TIMESLICE_MS, REC_VIDEO_BPS, REC_AUDIO_BPS } from '../../web/js/rec-limits.js';

test('camera limit follows the server clip limit (180 s by default)', () => {
  assert.equal(REC_DEFAULT_SEC, 180);
  assert.equal(recLimitSec(180), 180);
  assert.equal(recLimitSec(undefined), 180);
  assert.equal(recLimitSec('x'), 180);
  assert.equal(recLimitSec(0), 180);
});
test('timer keeps going past 60 s and stops exactly at 3:00', () => {
  const t0 = 1_000_000;
  const at = (s) => recState(t0, t0 + s * 1000, 180);
  assert.equal(at(0).label, '0:00 / 3:00');
  assert.equal(at(61).done, false); assert.equal(at(61).label, '1:01 / 3:00');
  assert.equal(at(169).warn, false); assert.equal(at(171).warn, true);
  assert.equal(at(179.9).done, false);
  assert.equal(at(180).done, true); assert.equal(at(180).progress, 1);
  assert.equal(at(200).label, '3:00 / 3:00');
  assert.ok(Math.abs(at(90).progress - 0.5) < 1e-9);
});
test('recorder settings keep a 3-minute clip small and chunked', () => {
  assert.ok(REC_TIMESLICE_MS > 0 && REC_TIMESLICE_MS <= 2000);
  const mb = ((REC_VIDEO_BPS + REC_AUDIO_BPS) * 180) / 8 / 1048576;
  assert.ok(mb < 100, `3-minute recording ≈ ${mb.toFixed(0)} MB`);
  assert.equal(recExt('video/mp4;codecs=avc1'), 'mp4'); assert.equal(recExt('video/webm;codecs=vp9,opus'), 'webm');
  assert.equal(fmtClock(125), '2:05');
});
