import { sql } from "../../db.ts";
import { cache } from "../../cache.ts";
import { hashPassword, verifyPassword, SEVEN_DAYS_SEC } from "../../lib/password.ts";
import { signJWT } from "../../lib/jwt.ts";

export const authService = {
  async signup(email: string, password: string) {
    const hash = await hashPassword(password);
    const [u] = await sql`INSERT INTO users (email,password_hash) VALUES (${email.toLowerCase()},${hash}) RETURNING id,email`;
    return u;
  },

  async login(email: string, password: string) {
    const rows = await sql`SELECT id,password_hash FROM users WHERE email=${email.toLowerCase()} LIMIT 1`;
    if (!rows.length) return null;
    if (!(await verifyPassword(password, rows[0].password_hash as string))) return null;
    const userId = rows[0].id as number;
    return { token: await signJWT(userId, SEVEN_DAYS_SEC), userId };
  },

  async logout(jti: string, exp: number) {
    const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 1);
    // Redis first (fast auth check), Postgres as durable fallback.
    await cache.setStr(`bl:${jti}`, ttl);
    await sql`INSERT INTO revoked_tokens (jti,exp) VALUES (${jti},to_timestamp(${exp})) ON CONFLICT DO NOTHING`;
  },
};
