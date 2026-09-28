import { authService } from "./service.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { json, unauthorized } from "../../lib/http.ts";
import { validEmail, validPassword } from "../../lib/validate.ts";
import { safeJson, rateLimit } from "../../lib/security.ts";
import type { LogFn } from "../../lib/logger.ts";

const noop: LogFn = () => {};

export const authRoutes = {
  async signup(req: Request, ip: string, log: LogFn = noop) {
    if (!rateLimit(`signup:${ip}`, 10, 60_000)) {
      log("auth.signup.rate_limited", { ip });
      return json({ error: "too many requests" }, 429);
    }
    const body = await safeJson(req);
    if (!body.ok) return json({ error: "invalid json" }, 400);
    const { email, password } = body.value as { email?: unknown; password?: unknown };
    if (!validEmail(email)) {
      log("auth.signup.rejected", { reason: "bad_email", ip });
      return json({ error: "valid email required" }, 400);
    }
    if (!validPassword(password)) {
      log("auth.signup.rejected", { reason: "weak_password", ip });
      return json({ error: "password must be 8-72 chars with a letter and a digit" }, 400);
    }
    try {
      const u = (await authService.signup(String(email), String(password))) as { id: number; email: string };
      log("auth.signup", { userId: u.id, email: u.email, ip });
      return json(u, 201);
    } catch {
      log("auth.signup.conflict", { ip }); // no email in log: don't confirm existence
      return json({ error: "email taken" }, 409);
    }
  },

  async login(req: Request, ip: string, log: LogFn = noop) {
    if (!rateLimit(`login:${ip}`, 20, 60_000)) {
      log("auth.login.rate_limited", { ip });
      return json({ error: "too many requests" }, 429);
    }
    const body = await safeJson(req);
    if (!body.ok) return json({ error: "invalid json" }, 400);
    const { email, password } = body.value as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string") {
      log("auth.login.failed", { reason: "bad_shape", ip });
      return json({ error: "invalid credentials" }, 401);
    }
    const session = await authService.login(email, password);
    if (!session) {
      log("auth.login.failed", { ip }); // generic: no email — resists enumeration
      return json({ error: "invalid credentials" }, 401);
    }
    log("auth.login", { userId: session.userId, ip });
    return json({ token: session.token });
  },

  async logout(req: Request, log: LogFn = noop) {
    const p = await requireAuth(req);
    if (!p) {
      log("auth.logout.denied", {});
      return unauthorized();
    }
    await authService.logout(p.jti, p.exp);
    log("auth.logout", { userId: p.sub });
    return json({ ok: true });
  },
};
