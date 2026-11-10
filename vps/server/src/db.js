import pg from 'pg';
import fs from 'node:fs';
import { config } from './config.js';

pg.types.setTypeParser(1700, (v) => Number(v)); // numeric → number
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { try { await c.query('rollback'); } catch {} throw e; }
  finally { c.release(); }
}

export async function waitForDb(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { await pool.query('select 1'); return; } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
}

export async function migrate() {
  const sql = fs.readFileSync(config.schemaFile, 'utf8');
  const c = await pool.connect();
  try { await c.query('select pg_advisory_lock(727001)'); await c.query(sql); }
  finally { try { await c.query('select pg_advisory_unlock(727001)'); } catch {} c.release(); }
}
