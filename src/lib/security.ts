// Tiny in-memory fixed-window rate limiter. No leak: capped Map + periodic sweep.
const hits = new Map<string, { count: number; reset: number }>();
const MAX_KEYS = 5000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  // hard cap: drop oldest if abused
  while (hits.size > MAX_KEYS) {
    const first = hits.keys().next().value;
    if (first === undefined) break;
    hits.delete(first);
  }
}, 60_000).unref?.();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  cur.count++;
  return cur.count <= max;
}

export const SEC_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'",
} as const;

export function withSec(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SEC_HEADERS)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export const MAX_JSON_BYTES = 8 * 1024; // 8KB: auth/post payloads are tiny

export async function safeJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const len = req.headers.get("content-length");
  if (len && Number(len) > MAX_JSON_BYTES) return { ok: false };
  try {
    const text = await req.text();
    if (text.length > MAX_JSON_BYTES) return { ok: false };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
