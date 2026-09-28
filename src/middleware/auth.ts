import { sql } from "../db.ts";
import { cache } from "../cache.ts";
import { verifyJWT, type JwtPayload } from "../lib/jwt.ts";

export async function requireAuth(req: Request): Promise<JwtPayload | null> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const payload = await verifyJWT(h.slice(7));
  if (!payload) return null;
  // Fast path: Redis blocklist (logout). Fallback: Postgres row.
  if (await cache.exists(`bl:${payload.jti}`)) return null;
  const hit = await sql`SELECT 1 FROM revoked_tokens WHERE jti=${payload.jti} AND exp>now() LIMIT 1`;
  return hit.length ? null : payload;
}
