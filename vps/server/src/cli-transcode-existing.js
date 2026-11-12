// © 2026 وطن النهار — وضع المقاطع الموجودة غير المتوافقة في طابور التحويل (تبقى ظاهرة أثناء التحويل)
// الاستخدام داخل الحاوية: node server/src/cli-transcode-existing.js [--dry]
import path from 'node:path';
import fs from 'node:fs';
import { q, pool } from './db.js';
import { config } from './config.js';
import { analyze, plan } from './transcode.js';

const dry = process.argv.includes('--dry');
const rows = (await q("select id, video_path from videos where media_status in ('ready','failed') order by created_at")).rows;
let queued = 0;
for (const r of rows) {
  const f = path.join(config.uploadDir, r.video_path.replace(/^\/uploads\/?/, ''));
  if (!fs.existsSync(f)) { console.log(r.id, 'missing file'); continue; }
  const info = await analyze(f); const p = plan(info, f);
  console.log(r.id, info?.video?.codec, info?.video?.pixFmt, `${info?.video?.width}x${info?.video?.height}`, info?.audio?.codec || '-', '→', p);
  if (p !== 'ready' && !dry) { await q("update videos set media_status = 'reprocess', media_error = null where id = $1", [r.id]); queued++; }
}
console.log(dry ? 'dry run' : `queued ${queued} of ${rows.length}`);
await pool.end();
