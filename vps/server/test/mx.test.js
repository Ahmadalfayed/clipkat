// © 2026 وطن النهار — استقبال البريد وتحويله (support@…): لا ترحيل مفتوح، رفض العناوين غير الموجودة، حد الحجم والمعدل، منع الحلقات
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nodemailer from 'nodemailer';

const PORT = 42500 + crypto.randomInt(0, 400);
const here = path.dirname(new URL(import.meta.url).pathname);
const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-mx-'));
let srv;
const mails = () => fs.readdirSync(outbox).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8')));
const send = (msg) => nodemailer.createTransport({ host: '127.0.0.1', port: PORT, secure: false, ignoreTLS: true, connectionTimeout: 5000 }).sendMail(msg);
const sendErr = async (msg) => { try { await send(msg); return null; } catch (e) { return e; } };

before(async () => {
  srv = spawn(process.execPath, ['src/mx.js'], {
    cwd: path.join(here, '..'),
    env: { ...process.env, MX_PORT: String(PORT), MX_HOSTNAME: 'mail.clipkat.test', MX_ROUTES: 'support@clipkat.test=owner@gmail.test, hello@clipkat.test=owner2@gmail.test',
      MAIL_FROM: 'no-reply@clipkat.test', MAIL_OUTBOX_DIR: outbox, MX_AUTH_CHECK: '0', MX_MAX_MB: '1', MX_RATE_PER_HOUR: '6', MAIL_DIRECT: '', SMTP_HOST: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('mx start timeout')), 15000); srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } }); srv.on('exit', (c) => no(new Error('mx exited ' + c))); });
});
after(() => { srv?.kill('SIGTERM'); fs.rmSync(outbox, { recursive: true, force: true }); });

test('mail to support@ is forwarded from no-reply with Reply-To = original sender, attachments kept', async () => {
  const info = await send({ from: '"سارة" <sara@example.org>', to: 'Support@ClipKat.test', subject: 'سؤال عن متجري', text: 'مرحبا، عندي سؤال', attachments: [{ filename: 'note.txt', content: 'hello file' }] });
  assert.match(info.response, /^250/);
  const m = mails();
  assert.equal(m.length, 1);
  assert.equal(m[0].to, 'owner@gmail.test');
  assert.equal(m[0].from, 'no-reply@clipkat.test');
  assert.equal(m[0].fromName, 'سارة عبر كليب كات');
  assert.equal(m[0].replyTo, 'sara@example.org');
  assert.equal(m[0].subject, 'سؤال عن متجري');
  assert.match(m[0].text, /من: سارة <sara@example\.org>/);
  assert.match(m[0].text, /عندي سؤال/);
  assert.equal(m[0].headers['X-ClipKat-Forwarded'], 'support@clipkat.test');
  assert.deepEqual(m[0].attachments.map((a) => a.filename), ['note.txt']);
});

test('not an open relay: other domains and unknown local users are refused at RCPT (550)', async () => {
  const before = mails().length;
  for (const to of ['someone@gmail.com', 'owner@gmail.test', 'nobody@clipkat.test', 'admin@clipkat.test']) {
    const e = await sendErr({ from: 'spammer@example.net', to, subject: 'x', text: 'x' });
    assert.ok(e, `should refuse ${to}`);
    assert.equal(e.responseCode, 550);
  }
  assert.equal(mails().length, before);
});

test('AUTH is not offered or accepted (cannot log in to send)', async () => {
  const { default: net } = await import('node:net');
  const out = await new Promise((ok, no) => {
    const sock = net.connect(PORT, '127.0.0.1'); let buf = ''; let step = 0;
    sock.on('data', (d) => {
      buf += d;
      if (step === 0 && /^220 /m.test(buf)) { step = 1; sock.write('EHLO test.local\r\n'); }
      else if (step === 1 && /^250 /m.test(buf)) { step = 2; sock.write('AUTH PLAIN AGEAYg==\r\n'); }
      else if (step === 2 && /^5\d\d /m.test(buf.split('AUTH').pop() || buf)) { step = 3; sock.end('QUIT\r\n'); ok(buf); }
    });
    sock.on('error', no); setTimeout(() => no(new Error('timeout: ' + buf)), 5000);
  });
  assert.ok(!/250[ -]AUTH/.test(out), 'AUTH must not be advertised');
  assert.match(out, /\r?\n5\d\d [^\n]*$/m);
});

test('messages over the size limit are rejected (552)', async () => {
  const before = mails().length;
  const e = await sendErr({ from: 'big@example.org', to: 'support@clipkat.test', subject: 'big', text: 'x'.repeat(1.3 * 1024 * 1024) });
  assert.ok(e); assert.equal(e.responseCode, 552);
  assert.equal(mails().length, before);
});

test('loops are refused: our own no-reply sender and already-forwarded mail', async () => {
  const before = mails().length;
  const e1 = await sendErr({ from: 'no-reply@clipkat.test', to: 'support@clipkat.test', subject: 'loop', text: 'x' });
  assert.equal(e1?.responseCode, 550);
  const e2 = await sendErr({ from: 'x@example.org', to: 'support@clipkat.test', subject: 'loop2', text: 'x', headers: { 'X-ClipKat-Forwarded': 'support@clipkat.test' } });
  assert.equal(e2?.responseCode, 550);
  assert.equal(mails().length, before);
});

test('one message to two routed addresses reaches each owner once', async () => {
  const before = mails().length;
  await send({ from: 'a@example.org', to: ['support@clipkat.test', 'hello@clipkat.test'], subject: 'two', text: 'x' });
  const m = mails().slice(before);
  assert.deepEqual(m.map((x) => x.to).sort(), ['owner2@gmail.test', 'owner@gmail.test']);
});

test('per-IP rate limit: further messages get a temporary 4xx', async () => {
  const codes = [];
  for (let i = 0; i < 8; i++) { const e = await sendErr({ from: 'r@example.org', to: 'support@clipkat.test', subject: 'r' + i, text: 'x' }); codes.push(e ? e.responseCode : 250); }
  assert.ok(codes.includes(250));
  assert.ok(codes.some((c) => c === 421 || c === 451), JSON.stringify(codes));
  assert.ok(mails().filter((m) => /^r\d$/.test(m.subject)).length <= 6);
});
