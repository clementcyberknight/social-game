import { authService } from "./service.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { json, unauthorized } from "../../lib/http.ts";
import { validEmail, validPassword } from "../../lib/validate.ts";
import { safeJson, rateLimit } from "../../lib/security.ts";

export const authRoutes = {
  async signup(req: Request, ip: string) {
    if (!rateLimit(`signup:${ip}`, 10, 60_000)) return json({ error: "too many requests" }, 429);
    const body = await safeJson(req);
    if (!body.ok) return json({ error: "invalid json" }, 400);
    const { email, password } = body.value as { email?: unknown; password?: unknown };
    if (!validEmail(email)) return json({ error: "valid email required" }, 400);
    if (!validPassword(password))
      return json({ error: "password must be 8-72 chars with a letter and a digit" }, 400);
    try {
      return json(await authService.signup(String(email), String(password)), 201);
    } catch {
      // generic: don't leak whether email exists vs other constraint
      return json({ error: "email taken" }, 409);
    }
  },

  async login(req: Request, ip: string) {
    if (!rateLimit(`login:${ip}`, 20, 60_000)) return json({ error: "too many requests" }, 429);
    const body = await safeJson(req);
    if (!body.ok) return json({ error: "invalid json" }, 400);
    const { email, password } = body.value as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string")
      return json({ error: "invalid credentials" }, 401);
    const token = await authService.login(email, password);
    if (!token) return json({ error: "invalid credentials" }, 401);
    return json({ token });
  },

  async logout(req: Request) {
    const p = await requireAuth(req);
    if (!p) return unauthorized();
    await authService.logout(p.jti, p.exp);
    return json({ ok: true });
  },
};
