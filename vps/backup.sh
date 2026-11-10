#!/usr/bin/env bash
# نسخة احتياطية: قاعدة البيانات + الملفات المرفوعة (+ نسخة من .env) داخل backups/clipkat-التاريخ/
# الاستخدام: ./backup.sh        (يعمل تلقائياً كل يوم 03:30 عبر cron)
# الاحتفاظ: BACKUP_KEEP_DAYS (الافتراضي 14 يوماً)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$ROOT"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$ROOT/backups/clipkat-$STAMP"
DC=(docker compose --project-directory "$ROOT")

umask 077
mkdir -p "$DEST"
ok=0; trap '[ "$ok" = 1 ] || rm -rf "$DEST"' EXIT
echo "[backup] قاعدة البيانات…"
"${DC[@]}" exec -T db pg_dump -U clipkat -d clipkat --no-owner | gzip -9 > "$DEST/db.sql.gz"
gzip -t "$DEST/db.sql.gz"
echo "[backup] الملفات المرفوعة…"
if [ -d "$ROOT/data/uploads" ]; then tar czf "$DEST/uploads.tar.gz" -C "$ROOT/data" uploads; else tar czf "$DEST/uploads.tar.gz" --files-from /dev/null; fi
[ -f "$ROOT/.env" ] && cp "$ROOT/.env" "$DEST/env.backup"
ok=1
echo "[backup] تم: $DEST ($(du -sh "$DEST" | cut -f1))"
# حذف النسخ الأقدم من KEEP_DAYS
find "$ROOT/backups" -maxdepth 1 -type d -name 'clipkat-*' -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true
