// تصحيح منفذ TURN/TLS في إعدادات ICE (LiveKit يعلن turns:host:443 دائماً) — دالة نقية قابلة للاختبار
export function fixTurnTls(cfg, port = 5349) {
  if (!cfg || !Array.isArray(cfg.iceServers) || !port || port === 443) return cfg;
  return { ...cfg, iceServers: cfg.iceServers.map((s) => ({ ...s, urls: [].concat(s.urls).map((u) => String(u).replace(/^(turns:[^:?/]+):443(?=\?|$)/, `$1:${port}`)) })) };
}
