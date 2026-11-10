# صورة تطبيق كليب كات (Node.js + ffmpeg لتوليد الصور المصغّرة)
FROM node:20-alpine
RUN apk add --no-cache ffmpeg tini wget
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY server server
COPY web web
COPY db db
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web SCHEMA_FILE=/app/db/schema.sql UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
