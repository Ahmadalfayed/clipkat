// تغيير كلمة مرور أي حساب من سطر الأوامر (لا يوجد استرجاع بالبريد في هذه النسخة):
//   docker compose exec app node server/src/cli-reset-password.js user@example.com 'كلمة-جديدة-قوية'
import { pool } from './db.js';
import { hashPassword } from './util.js';
const [email, pw] = process.argv.slice(2);
if (!email || !pw || pw.length < 8) { console.error('usage: cli-reset-password.js <email> <new-password (8+ chars)>'); process.exit(1); }
const r = await pool.query('update profiles set password_hash = $2, token_version = token_version + 1 where lower(email) = lower($1) returning username', [email, await hashPassword(pw)]);
console.log(r.rowCount ? `OK: password changed for ${r.rows[0].username} (all sessions logged out)` : 'No account with that email');
await pool.end(); process.exit(r.rowCount ? 0 : 2);
