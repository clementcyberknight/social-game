import { sql } from "./db.ts";
import { config } from "./config.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { postRoutes } from "./modules/posts/routes.ts";
import { json } from "./lib/http.ts";
import { withSec } from "./lib/security.ts";

export function createApp() {
  return {
    async fetch(req: Request, server: { requestIP: (r: Request) => { address: string } | null }): Promise<Response> {
      try {
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;
        const ip = server?.requestIP?.(req)?.address ?? "unknown";

        let res: Response;
        if (path === "/health" && method === "GET") res = json({ ok: true });
        else if (path === "/signup" && method === "POST") res = await authRoutes.signup(req, ip);
        else if (path === "/login" && method === "POST") res = await authRoutes.login(req, ip);
        else if (path === "/logout" && method === "POST") res = await authRoutes.logout(req);
        else if (path === "/posts" && method === "POST") res = await postRoutes.create(req);
        else if (path === "/posts" && method === "GET") res = await postRoutes.list(req);
        else if (/^\/posts\/[^/]+$/.test(path) && method === "GET")
          res = await postRoutes.getById(path.split("/")[2]!);
        else if (/^\/posts\/[^/]+\/like$/.test(path) && (method === "POST" || method === "DELETE")) {
          const id = path.split("/")[2]!;
          res = method === "POST" ? await postRoutes.like(req, id) : await postRoutes.unlike(req, id);
        } else res = json({ error: "not found" }, 404);

        return withSec(res);
      } catch (e) {
        console.error("unhandled:", e instanceof Error ? e.message : "unknown");
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
  console.log(`social-app (pure bun, zero deps) on :${server.port}`);
  return server;
}
