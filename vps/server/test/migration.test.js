// © 2026 وطن النهار — يتأكد أن ترقية قاعدة بيانات قديمة (v1) آمنة: لا فقدان بيانات، وإعادة التطبيق متكررة بأمان
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error('Set TEST_DATABASE_URL to a database whose name ends with _test');
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('v1 database upgrades additively and idempotently', async () => {
  const c = new pg.Client({ connectionString: DB }); await c.connect();
  try {
    await c.query('drop schema public cascade; create schema public;');
    await c.query(rd('./fixtures/schema-v1.sql'));
    const u = (await c.query("insert into profiles (email, password_hash, username) values ('old@x.y','scrypt$1$a$b','olduser') returning id")).rows[0].id;
    const v = (await c.query("insert into videos (user_id, video_path, video_url, caption) values ($1,'/a','/a','old') returning id", [u])).rows[0].id;
    await c.query("insert into comments (video_id, user_id, text) values ($1,$2,'old comment')", [v, u]);
    await c.query("insert into reports (reporter_id, video_id, reason) values ($1,$2,'old reason')", [u, v]);
    await c.query("insert into notifications (user_id, type, text) values ($1,'system','hi')", [u]);
    const next = rd('../../db/schema.sql');
    await c.query(next); await c.query(next);   // مرتين = آمن للتكرار
    const p = (await c.query("select is_private, comment_policy from profiles where username = 'olduser'")).rows[0];
    assert.deepEqual(p, { is_private: false, comment_policy: 'everyone' });
    assert.equal((await c.query('select parent_id from comments')).rows[0].parent_id, null);
    const r = (await c.query('select target_type, status, reason from reports')).rows[0];
    assert.deepEqual(r, { target_type: 'video', status: 'open', reason: 'old reason' });
    assert.equal((await c.query('select count(*)::int n from notifications')).rows[0].n, 1);
    assert.equal((await c.query('select count(*)::int n from videos')).rows[0].n, 1);
  } finally { await c.end(); }
});
