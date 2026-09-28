// Security headers + bounded JSON parsing. No rate limiter: removed by design
// (load experiment showed it masking real capacity; abuse protection lives
// at the proxy / WAF layer instead).

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
