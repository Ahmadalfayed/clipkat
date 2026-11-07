#!/usr/bin/env bash
# استرجاع نسخة احتياطية.   الاستخدام:  ./restore.sh backups/clipkat-20261011-033000
# تحذير: يستبدل قاعدة البيانات والملفات الحالية بمحتوى النسخة. (الملفات الحالية تُحفظ في data/uploads.before-restore-*)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$ROOT"
SRC="${1:-}"
DC=(docker compose --project-directory "$ROOT")
if [ -z "$SRC" ] || [ ! -f "$SRC/db.sql.gz" ] || [ ! -f "$SRC/uploads.tar.gz" ]; then
  echo "الاستخدام: ./restore.sh backups/clipkat-التاريخ"; echo "النسخ المتوفرة:"; ls -1 "$ROOT/backups" 2>/dev/null || true; exit 1
fi
gzip -t "$SRC/db.sql.gz"; tar tzf "$SRC/uploads.tar.gz" >/dev/null
if [ "${ASSUME_YES:-0}" != 1 ]; then
  echo "⚠️  سيتم استبدال كل بيانات الموقع الحالية بالنسخة: $SRC"
  read -r -p "اكتب YES للمتابعة: " a; [ "$a" = YES ] || { echo "أُلغي."; exit 1; }
fi
STAMP="$(date +%Y%m%d-%H%M%S)"
echo "[restore] إيقاف التطبيق…"; "${DC[@]}" stop app
echo "[restore] قاعدة البيانات…"
"${DC[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U clipkat -d clipkat -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
gunzip -c "$SRC/db.sql.gz" | "${DC[@]}" exec -T db psql -v ON_ERROR_STOP=1 -q -U clipkat -d clipkat >/dev/null
echo "[restore] الملفات المرفوعة…"
[ -d "$ROOT/data/uploads" ] && mv "$ROOT/data/uploads" "$ROOT/data/uploads.before-restore-$STAMP"
mkdir -p "$ROOT/data"; tar xzf "$SRC/uploads.tar.gz" -C "$ROOT/data"
chown -R 1000:1000 "$ROOT/data/uploads" 2>/dev/null || true
echo "[restore] تشغيل التطبيق…"; "${DC[@]}" up -d app
echo "[restore] تم ✅"
