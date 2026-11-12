// © 2026 وطن النهار — اختيار صيغة التسجيل: آيفون/سفاري (MP4) مقابل كروم (WebM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRecorderMime, isWebKitUA, recordedType } from '../../web/js/rec-mime.js';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.46 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  chrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  huawei: 'Mozilla/5.0 (Linux; Android 12; NOH-AN00; HMSCore 6.13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 HuaweiBrowser/15.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0'
};
// سلوك سفاري iOS 14.3–18.3: MP4 فقط | سفاري 18.4+: MP4 و WebM | كروم: WebM (+MP4 في الإصدارات الحديثة)
const safariOld = (t) => /^video\/mp4/.test(t);
const safariNew = (t) => /^video\/(mp4|webm)/.test(t);
const chromeLike = (t) => /^video\/(webm|mp4)/.test(t);

test('WebKit detection covers every iOS browser and Safari, not Chrome/Huawei/Firefox', () => {
  assert.ok(isWebKitUA(UA.iosSafari)); assert.ok(isWebKitUA(UA.iosChrome)); assert.ok(isWebKitUA(UA.macSafari));
  assert.ok(isWebKitUA(UA.ipadDesktop, '', 5));
  assert.ok(!isWebKitUA(UA.chrome)); assert.ok(!isWebKitUA(UA.huawei)); assert.ok(!isWebKitUA(UA.firefox));
});
test('iPhone (Safari and Chrome on iOS) records MP4 H.264/AAC', () => {
  assert.equal(pickRecorderMime({ isTypeSupported: safariOld, ua: UA.iosSafari }), 'video/mp4;codecs=avc1,mp4a.40.2');
  assert.equal(pickRecorderMime({ isTypeSupported: safariNew, ua: UA.iosSafari }), 'video/mp4;codecs=avc1,mp4a.40.2', 'MP4 preferred even when WebM exists');
  assert.equal(pickRecorderMime({ isTypeSupported: safariOld, ua: UA.iosChrome }), 'video/mp4;codecs=avc1,mp4a.40.2');
  // سفاري لا يعترف بسلسلة codecs: نتراجع إلى video/mp4
  assert.equal(pickRecorderMime({ isTypeSupported: (t) => t === 'video/mp4', ua: UA.iosSafari }), 'video/mp4');
});
test('Chrome/Huawei/Firefox keep WebM first', () => {
  assert.equal(pickRecorderMime({ isTypeSupported: chromeLike, ua: UA.chrome }), 'video/webm;codecs=vp9,opus');
  assert.equal(pickRecorderMime({ isTypeSupported: (t) => /webm/.test(t) && !/vp9/.test(t), ua: UA.huawei }), 'video/webm;codecs=vp8,opus');
});
test('no isTypeSupported or nothing supported → let the browser choose (never "unsupported")', () => {
  assert.equal(pickRecorderMime({ isTypeSupported: undefined, ua: UA.iosSafari }), '');
  assert.equal(pickRecorderMime({ isTypeSupported: () => false, ua: UA.iosSafari }), '');
  assert.equal(pickRecorderMime({ isTypeSupported: () => { throw new Error('x'); }, ua: UA.chrome }), '');
});
test('recorded blob type and file extension', () => {
  assert.deepEqual(recordedType('video/mp4;codecs=avc1,mp4a.40.2', '', '', true), { type: 'video/mp4', ext: 'mp4' });
  assert.deepEqual(recordedType('', '', '', true), { type: 'video/mp4', ext: 'mp4' }, 'Safari default');
  assert.deepEqual(recordedType('', 'video/webm;codecs=vp8,opus', '', false), { type: 'video/webm', ext: 'webm' });
  assert.deepEqual(recordedType('', '', '', false), { type: 'video/webm', ext: 'webm' });
});
