import { sql } from "./db.ts";
import { config } from "./config.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { postRoutes } from "./modules/posts/routes.ts";
import { json } from "./lib/http.ts";
import { withSec } from "./lib/security.ts";
import { logger } from "./lib/logger.ts";

export function createApp() {
  return {
    async fetch(req: Request, server: { requestIP: (r: Request) => { address: string } | null }): Promise<Response> {
      const start = performance.now();
      const reqId = crypto.randomUUID().slice(0, 8);
      const log = (msg: string, fields: Record<string, unknown> = {}) =>
        logger.info(msg, { reqId, ...fields });
      try {
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;
        const ip = server?.requestIP?.(req)?.address ?? "unknown";

        let res: Response;
        let route = "not_found";
        if (path === "/health" && method === "GET") { res = json({ ok: true }); route = "health"; }
        else if (path === "/signup" && method === "POST") { res = await authRoutes.signup(req, ip, log); route = "signup"; }
        else if (path === "/login" && method === "POST") { res = await authRoutes.login(req, ip, log); route = "login"; }
        else if (path === "/logout" && method === "POST") { res = await authRoutes.logout(req, log); route = "logout"; }
        else if (path === "/posts" && method === "POST") { res = await postRoutes.create(req, log); route = "posts.create"; }
        else if (path === "/posts" && method === "GET") { res = await postRoutes.list(req, log); route = "posts.list"; }
        else if (/^\/posts\/[^/]+$/.test(path) && method === "GET") {
          res = await postRoutes.getById(path.split("/")[2]!, log); route = "posts.get";
        } else if (/^\/posts\/[^/]+\/like$/.test(path) && (method === "POST" || method === "DELETE")) {
          const id = path.split("/")[2]!;
          res = method === "POST" ? await postRoutes.like(req, id, log) : await postRoutes.unlike(req, id, log);
          route = method === "POST" ? "posts.like" : "posts.unlike";
        } else res = json({ error: "not found" }, 404);

        // Access log: every request, with route/status/latency. Skip OK health to reduce noise.
        if (route !== "health" || res.status !== 200) {
          log("http", { route, method, path, status: res.status, ms: Math.round(performance.now() - start), ip });
        }
        return withSec(res);
      } catch (e) {
        logger.error("unhandled", { reqId, err: e instanceof Error ? e.message : "unknown" });
        return withSec(json({ error: "internal error" }, 500)); // never leak stacks/SQL
      }
    },
  };
}

// Hourly prune of expired revoked tokens. unref'd so it never keeps the process alive.
setInterval(async () => {
  try { await sql`DELETE FROM revoked_tokens WHERE exp<=now()`; } catch {}
}, 3_600_000).unref?.();

export function serve() {
  const server = Bun.serve({ port: config.port, idleTimeout: 30, fetch: createApp().fetch });
  logger.info("server started", { port: server.port, env: process.env.NODE_ENV ?? "production" });
  return server;
}
