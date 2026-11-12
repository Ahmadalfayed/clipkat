// © 2026 وطن النهار — تصحيح منفذ TURN/TLS المعلن من LiveKit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixTurnTls } from '../../web/js/turn-port.js';

test('rewrites turns:host:443 to the real TLS port and leaves everything else alone', () => {
  const cfg = { iceTransportPolicy: 'all', iceServers: [{ urls: ['turn:2.25.1.119:3478?transport=udp', 'turns:live.clipkat.live:443?transport=tcp'], username: 'u', credential: 'c' }, { urls: 'stun:stun.example.com:443' }] };
  const out = fixTurnTls(cfg, 5349);
  assert.deepEqual(out.iceServers[0].urls, ['turn:2.25.1.119:3478?transport=udp', 'turns:live.clipkat.live:5349?transport=tcp']);
  assert.equal(out.iceServers[0].username, 'u'); assert.equal(out.iceServers[0].credential, 'c');
  assert.deepEqual(out.iceServers[1].urls, ['stun:stun.example.com:443']);
  assert.equal(out.iceTransportPolicy, 'all');
  assert.deepEqual(fixTurnTls({ iceServers: [{ urls: 'turns:a.b:443' }] }, 5349).iceServers[0].urls, ['turns:a.b:5349']);
  assert.equal(fixTurnTls(cfg, 443), cfg);         // 443 فعلي = بدون تغيير
  assert.equal(fixTurnTls(undefined, 5349), undefined);
  assert.deepEqual(fixTurnTls({}, 5349), {});
});
