#!/usr/bin/env bash
# =====================================================================
#  كليب كات — مثبّت VPS (Ubuntu 22.04 / 24.04)
#  الاستخدام:   sudo bash install.sh
#  يثبّت Docker إن لزم، يسألك عن النطاق والبريد وحساب المشرف، يولّد أسراراً قوية،
#  يشغّل الحزمة، يفعّل الجدار الناري (22/80/443) ويطبع الرابط النهائي.
#
#  تشغيل بدون أسئلة (اختياري): DOMAIN=example.com ACME_EMAIL=me@x.com ADMIN_EMAIL=me@x.com \
#                              ADMIN_PASSWORD='...' ASSUME_YES=1 sudo -E bash install.sh
#  تجربة بلا أي تغيير على النظام: DRY_RUN=1 bash install.sh
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env"
DRY_RUN="${DRY_RUN:-0}"
ASSUME_YES="${ASSUME_YES:-0}"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[تنبيه] %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m[خطأ] %s\033[0m\n' "$*" >&2; exit 1; }
# ينفّذ الأمر، أو يطبعه فقط في وضع DRY_RUN
run() { if [ "$DRY_RUN" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi; }
is_tty() { [ -t 0 ] && [ "$ASSUME_YES" != 1 ]; }

# ---------- 0) فحوصات ----------
if [ "$DRY_RUN" != 1 ] && [ "$(id -u)" -ne 0 ]; then die "شغّل السكربت كمستخدم root:  sudo bash install.sh"; fi
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:22.04|ubuntu:24.04) ;;
    *) warn "هذا السكربت مُختبَر على Ubuntu 22.04/24.04 فقط (نظامك: ${PRETTY_NAME:-غير معروف})."
       if is_tty; then read -r -p "هل تريد المتابعة على مسؤوليتك؟ (y/N) " a; [ "${a:-n}" = y ] || exit 1; fi ;;
  esac
fi

# ---------- 1) قراءة .env الحالي (إن وُجد) ----------
env_get() { # env_get KEY → قيمة المفتاح من .env (بدون تنفيذ أي شيفرة)
  [ -f "$ENV_FILE" ] || return 0
  local line; line="$(grep -E "^$1=" "$ENV_FILE" | tail -n1 || true)"; line="${line#*=}"
  line="${line%\'}"; line="${line#\'}"; printf '%s' "$line"
}
ask() { # ask "سؤال" الافتراضي  → يطبع الإجابة
  local q="$1" def="${2:-}" a=""
  if is_tty; then read -r -p "$q${def:+ [$def]}: " a || true; fi
  printf '%s' "${a:-$def}"
}
rand_hex() { openssl rand -hex "$1"; }
rand_pass() { openssl rand -base64 18 | tr -d '/+=\n' | cut -c1-14; }

command -v openssl >/dev/null 2>&1 || run apt-get install -y openssl

say "إعداد كليب كات"
DOMAIN="${DOMAIN:-$(env_get DOMAIN)}"
if [ -z "$DOMAIN" ]; then
  DOMAIN="$(ask 'اسم النطاق (مثال: clipkat.example.com) — اتركه فارغاً لاستخدام عنوان IP بدون HTTPS' '')"
fi
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##; s/[[:space:]]//g')"
if [ -n "$DOMAIN" ] && ! printf '%s' "$DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; then die "اسم النطاق غير صالح: $DOMAIN"; fi

ADMIN_EMAIL="${ADMIN_EMAIL:-$(env_get ADMIN_EMAIL)}"
[ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL="$(ask 'بريد المشرف (للدخول إلى لوحة الإدارة)' '')"
printf '%s' "$ADMIN_EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' || die "بريد المشرف غير صالح (أعد التشغيل وأدخل بريداً صحيحاً)"

ACME_EMAIL="${ACME_EMAIL:-$(env_get ACME_EMAIL)}"
[ "$ACME_EMAIL" = admin@example.com ] && ACME_EMAIL=""
[ -n "$ACME_EMAIL" ] || ACME_EMAIL="$(ask 'بريد لشهادة HTTPS (Let'"'"'s Encrypt)' "$ADMIN_EMAIL")"

ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(env_get ADMIN_PASSWORD)}"
GENERATED_PASS=0; KEEP_PASS=0
if [ -z "$ADMIN_PASSWORD" ] && [ -n "$(env_get ADMIN_EMAIL)" ] && [ "$(env_get ADMIN_EMAIL)" = "$ADMIN_EMAIL" ] && [ -n "$(env_get JWT_SECRET)" ]; then
  KEEP_PASS=1      # إعادة تشغيل: الحساب أُنشئ سابقاً وكلمة المرور لم تعد محفوظة في .env
fi
if [ "$KEEP_PASS" = 0 ]; then
  if [ -z "$ADMIN_PASSWORD" ]; then
    if is_tty; then
      read -r -s -p "كلمة مرور المشرف (8 أحرف فأكثر) — اتركها فارغة ليولّد السكربت واحدة قوية: " ADMIN_PASSWORD || true; echo
    fi
    if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD="$(rand_pass)"; GENERATED_PASS=1; fi
  fi
  [ "${#ADMIN_PASSWORD}" -ge 8 ] || die "كلمة المرور أقصر من 8 أحرف"
  case "$ADMIN_PASSWORD" in *\'*|*\\*|*\"*|*\$*|*\`*) die "كلمة المرور لا يجب أن تحتوي على  ' \" \\ \$ \`  — اختر كلمة أبسط" ;; esac
fi

MAX_VIDEO_MB="${MAX_VIDEO_MB:-$(env_get MAX_VIDEO_MB)}"; MAX_VIDEO_MB="${MAX_VIDEO_MB:-500}"
case "$MAX_VIDEO_MB" in ''|*[!0-9]*) die "MAX_VIDEO_MB يجب أن يكون رقماً" ;; esac
MAX_BODY="$((MAX_VIDEO_MB + 20))MB"

# أسرار: تُولَّد مرة واحدة فقط ولا يُعاد توليدها (حتى لا تنقطع الجلسات/قاعدة البيانات)
DB_PASSWORD="$(env_get DB_PASSWORD)";   [ -n "$DB_PASSWORD" ] || DB_PASSWORD="$(rand_hex 24)"
JWT_SECRET="$(env_get JWT_SECRET)";     [ -n "$JWT_SECRET" ] || JWT_SECRET="$(rand_hex 32)"
WEBHOOK_SECRET="$(env_get WEBHOOK_SECRET)"
CORS_ORIGINS="$(env_get CORS_ORIGINS)"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(env_get GOOGLE_CLIENT_ID)}"
# البث المباشر والمكالمات: تُحفظ القيم الموجودة كما هي (لا تُولَّد هنا)
COMPOSE_PROFILES="$(env_get COMPOSE_PROFILES)"; LIVEKIT_URL="$(env_get LIVEKIT_URL)"; LIVEKIT_API_KEY="$(env_get LIVEKIT_API_KEY)"; LIVEKIT_API_SECRET="$(env_get LIVEKIT_API_SECRET)"; LIVEKIT_NODE_IP="$(env_get LIVEKIT_NODE_IP)"
if [ -n "$DOMAIN" ]; then SITE_ADDRESS="$DOMAIN"; COOKIE_SECURE=1; else SITE_ADDRESS=":80"; COOKIE_SECURE=0; fi

umask 077
cat > "$ENV_FILE" <<ENVEOF
# أُنشئ بواسطة install.sh — لا ترفع هذا الملف لأي مكان عام
DOMAIN=$DOMAIN
SITE_ADDRESS=$SITE_ADDRESS
ACME_EMAIL=$ACME_EMAIL
COOKIE_SECURE=$COOKIE_SECURE
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD='$ADMIN_PASSWORD'
MAX_VIDEO_MB=$MAX_VIDEO_MB
MAX_BODY=$MAX_BODY
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
WEBHOOK_SECRET=$WEBHOOK_SECRET
CORS_ORIGINS=$CORS_ORIGINS
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
COMPOSE_PROFILES=$COMPOSE_PROFILES
LIVEKIT_URL=$LIVEKIT_URL
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET
LIVEKIT_NODE_IP=$LIVEKIT_NODE_IP
ENVEOF
chmod 600 "$ENV_FILE"
say "تم حفظ الإعدادات في .env (أسرار عشوائية قوية)"

# ---------- 2) الحزم الأساسية + Docker ----------
say "تثبيت المتطلبات"
export DEBIAN_FRONTEND=noninteractive
run apt-get update -y
run apt-get install -y curl ca-certificates ufw cron unzip
if ! command -v docker >/dev/null 2>&1; then
  say "تثبيت Docker (من المصدر الرسمي get.docker.com)"
  if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] curl -fsSL https://get.docker.com | sh"; else curl -fsSL https://get.docker.com | sh; fi
fi
run systemctl enable --now docker
if [ "$DRY_RUN" != 1 ]; then docker compose version >/dev/null 2>&1 || die "Docker Compose غير متوفر — ثبّت docker-compose-plugin"; fi

# ---------- 3) مجلدات البيانات + النسخ الاحتياطي اليومي ----------
say "تجهيز مجلدات البيانات"
run mkdir -p "$ROOT/data/uploads" "$ROOT/data/postgres" "$ROOT/data/caddy" "$ROOT/backups"
run chown -R 1000:1000 "$ROOT/data/uploads"     # مستخدم node داخل الحاوية
run chmod 700 "$ROOT/backups"
run chmod +x "$ROOT"/install.sh "$ROOT"/update.sh "$ROOT"/backup.sh "$ROOT"/restore.sh
CRON_LINE="30 3 * * * root $ROOT/backup.sh >> /var/log/clipkat-backup.log 2>&1"
if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] write /etc/cron.d/clipkat-backup: $CRON_LINE"; else printf '%s\n' "$CRON_LINE" > /etc/cron.d/clipkat-backup; chmod 644 /etc/cron.d/clipkat-backup; fi

# ---------- 4) الجدار الناري ----------
say "الجدار الناري (ufw): 22 و80 و443 فقط"
SSH_PORTS="22"
if command -v sshd >/dev/null 2>&1; then
  P="$( (sshd -T 2>/dev/null || true) | awk '$1=="port"{print $2}' | sort -u | tr '\n' ' ')"
  [ -z "$P" ] || SSH_PORTS="$P"
fi
for p in $SSH_PORTS; do run ufw allow "$p/tcp"; done
run ufw allow 80/tcp
run ufw allow 443/tcp
run ufw allow 443/udp
run ufw --force enable

# ---------- 5) التشغيل ----------
say "بناء وتشغيل الحزمة (قد يستغرق عدة دقائق في أول مرة)"
run docker compose --project-directory "$ROOT" up -d --build

if [ "$DRY_RUN" != 1 ]; then
  say "انتظار جاهزية التطبيق"
  ready=0
  for _ in $(seq 1 90); do
    if docker compose --project-directory "$ROOT" exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
  done
  [ "$ready" = 1 ] || { docker compose --project-directory "$ROOT" logs --tail=40 app || true; die "التطبيق لم يصبح جاهزاً. شغّل:  docker compose logs app"; }
  # حذف كلمة مرور المشرف النصية من .env بعد إنشاء الحساب
  sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=/" "$ENV_FILE"
fi

# ---------- 6) النتيجة ----------
IP="$(curl -4fsS --max-time 6 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
[ -n "${IP:-}" ] || IP="عنوان-السيرفر"
if [ -n "$DOMAIN" ]; then
  URL="https://$DOMAIN"
  RES="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
  if [ "$DRY_RUN" != 1 ] && [ "$RES" != "$IP" ]; then
    warn "النطاق $DOMAIN يشير الآن إلى '${RES:-لا شيء}' وليس إلى $IP. أضف سجل DNS من نوع A يشير إلى $IP وانتظر دقائق ليعمل HTTPS."
  fi
else
  URL="http://$IP"
fi

TITLE='✅ كليب كات يعمل!'; [ "$DRY_RUN" = 1 ] && TITLE='🧪 تجربة (DRY_RUN) — لم يُنفَّذ أي تغيير على النظام'
cat <<DONE

========================================================
 $TITLE

   الرابط:            $URL
   بريد المشرف:       $ADMIN_EMAIL
$( if [ "$GENERATED_PASS" = 1 ]; then echo "   كلمة مرور المشرف:  $ADMIN_PASSWORD   ← احفظها الآن (لن تظهر مرة أخرى)"; else echo "   كلمة المرور:       التي أدخلتها سابقاً"; fi )

   النسخ الاحتياطي:   تلقائي يومياً 03:30 في  $ROOT/backups
   أوامر مفيدة:       cd $ROOT
                      docker compose logs -f app     (سجلات التطبيق)
                      ./backup.sh   ./update.sh   ./restore.sh
========================================================
DONE
if [ -z "$DOMAIN" ]; then warn "تعمل بدون نطاق = HTTP بدون تشفير (كلمات المرور تنتقل بلا تشفير). للإنتاج اربط نطاقاً وأعد تشغيل install.sh."; fi
