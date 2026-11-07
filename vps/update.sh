#!/usr/bin/env bash
# تحديث كليب كات.
#   ./update.sh                      إعادة بناء وتشغيل بنفس الملفات (بعد تعديل ملفات يدوياً)
#   ./update.sh clipkat-vps.zip      تحديث من حزمة جديدة (ملف على السيرفر)
#   ./update.sh https://.../x.zip    تحديث من رابط
# يأخذ نسخة احتياطية أولاً، ويحافظ على .env والبيانات والنسخ الاحتياطية.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$ROOT"
DC=(docker compose --project-directory "$ROOT")
SRC="${1:-}"

echo "[update] نسخة احتياطية قبل التحديث…"
"$ROOT/backup.sh" || echo "[update] تحذير: فشل النسخ الاحتياطي (قد يكون أول تشغيل)"

if [ -n "$SRC" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  case "$SRC" in
    http://*|https://*) echo "[update] تنزيل…"; curl -fsSL "$SRC" -o "$TMP/new.zip"; SRC="$TMP/new.zip" ;;
  esac
  [ -f "$SRC" ] || { echo "الملف غير موجود: $SRC"; exit 1; }
  command -v unzip >/dev/null 2>&1 || apt-get install -y unzip
  unzip -q "$SRC" -d "$TMP/x"
  NEW="$TMP/x"; [ "$(find "$TMP/x" -mindepth 1 -maxdepth 1 | wc -l)" = 1 ] && [ -d "$(find "$TMP/x" -mindepth 1 -maxdepth 1)" ] && NEW="$(find "$TMP/x" -mindepth 1 -maxdepth 1)"
  [ -f "$NEW/docker-compose.yml" ] || { echo "هذه ليست حزمة كليب كات صالحة"; exit 1; }
  echo "[update] نسخ الملفات الجديدة (مع الحفاظ على .env والبيانات)…"
  (cd "$NEW" && tar cf - --exclude=./.env --exclude=./data --exclude=./backups .) | tar xf - -C "$ROOT"
fi
chmod +x "$ROOT"/*.sh
echo "[update] إعادة البناء والتشغيل…"
"${DC[@]}" up -d --build
for _ in $(seq 1 60); do "${DC[@]}" exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 && { echo "[update] تم ✅"; docker image prune -f >/dev/null 2>&1 || true; exit 0; }; sleep 2; done
"${DC[@]}" logs --tail=40 app; echo "التطبيق لم يصبح جاهزاً"; exit 1
