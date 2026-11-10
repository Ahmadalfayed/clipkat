// فحص صياغة كل ملفات JavaScript (الخادم + الواجهة) — بدون تشغيل
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const root = new URL('../..', import.meta.url).pathname; let n = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'vendor', 'media'].includes(e.name)) walk(p); } else if (/\.(m?js)$/.test(e.name)) { execFileSync(process.execPath, ['--check', p]); n++; } });
walk(path.join(root, 'server')); walk(path.join(root, 'web/js'));
console.log(`syntax OK: ${n} files`);
