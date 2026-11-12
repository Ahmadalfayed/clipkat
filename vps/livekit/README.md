# البث المباشر والمكالمات — خادم LiveKit

- الخدمة `livekit` في `docker-compose.yml` (ملف تعريف `live`، شبكة المضيف). الإعداد: `livekit/livekit.yaml` (بدون أسرار).
- الأسرار في `.env` فقط: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` + `LIVEKIT_URL=wss://live.<domain>` و`LIVEKIT_NODE_IP=<IP العام>` و`COMPOSE_PROFILES=live`.
- Caddy يمرّر `https://live.<domain>` إلى `host.docker.internal:7880` ويصدر الشهادة؛ LiveKit يستعمل نفس الشهادة لـ TURN/TLS على 5349.
- منافذ الجدار الناري (ufw): `7881/tcp`, `7882/udp`, `3478/udp`, `5349/tcp`، و`7880/tcp` من شبكات Docker فقط (`172.16.0.0/12`).
- `livekit/reload-cert.sh` يعيد تشغيل LiveKit عند تجدد الشهادة (cron يومي).
- تعطيل الميزتين: أفرغ `LIVEKIT_URL` ثم `docker compose up -d app`.
