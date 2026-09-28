const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

export function validEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
}

// min 8, max 72 (argon2/bcrypt sane bound), require letter + digit
export function validPassword(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 8 || v.length > 72) return false;
  return /[A-Za-z]/.test(v) && /\d/.test(v);
}

export function validPostBody(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length >= 1 && t.length <= 500;
}

export function parseId(v: string | null): number | null {
  if (!v) return null;
  if (!/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function parsePagination(search: URLSearchParams): { cursor: number; limit: number } {
  const rawLimit = Number(search.get("limit") ?? 20);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 50) : 20;
  const rawCursor = Number(search.get("cursor") ?? 0);
  const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? Math.floor(rawCursor) : 0;
  return { cursor, limit };
}
