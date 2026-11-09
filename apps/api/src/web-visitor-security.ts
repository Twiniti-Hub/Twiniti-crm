/** Bounded, expiring per-instance IP limits independent of supplied tokens. */
export function createWebVisitorLimiter(limit = 60, capacity = 10_000, windowMs = 60_000) {
  const entries = new Map<string, { expires: number; count: number }>();
  return (ip: string, now = Date.now()) => {
    for (const [key, entry] of entries) {
      if (entry.expires > now) break;
      entries.delete(key);
    }
    const entry = entries.get(ip);
    if (entry) return ++entry.count <= limit;
    if (entries.size >= capacity) return false;
    entries.set(ip, { expires: now + windowMs, count: 1 });
    return true;
  };
}
export function redactWebVisitorUrl(value: string) {
  return value.replace(/(\/api\/v1\/webhooks\/web-visitors\/)[^\s?"'<>]+(?:\?[^\s"'<>]*)?/g, "$1[REDACTED]");
}
export const safeRequestSerializers = {
  msg: redactWebVisitorUrl,
  req(request: { method?: string; url?: string; id?: string }) {
    return { method: request.method, url: redactWebVisitorUrl(request.url ?? ""), id: request.id };
  },
  err(error: Error & { code?: string }) {
    return { type: error.name, code: error.code, message: redactWebVisitorUrl(error.message), stack: redactWebVisitorUrl(error.stack ?? "") };
  }
};
