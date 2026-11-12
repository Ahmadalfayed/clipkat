#!/bin/sh
# يعيد تشغيل LiveKit عندما يجدّد Caddy شهادة live.<domain> (يقرأ LiveKit الشهادة عند التشغيل فقط — تُستخدم لـ TURN/TLS)
# يُشغَّل يومياً من /etc/cron.d/clipkat-livekit
set -eu
ROOT="${ROOT:-/opt/clipkat}"
CRT="$(ls -1 "$ROOT"/data/caddy/caddy/certificates/*/live.*/live.*.crt 2>/dev/null | head -1)"
[ -n "$CRT" ] || exit 0
MARK="$ROOT/data/.livekit-cert.sha256"
NEW="$(sha256sum "$CRT" | cut -d' ' -f1)"
[ "$(cat "$MARK" 2>/dev/null)" = "$NEW" ] && exit 0
cd "$ROOT" && docker compose restart livekit >/dev/null 2>&1 && echo "$NEW" > "$MARK" && logger -t clipkat "livekit restarted for renewed TURN certificate"
