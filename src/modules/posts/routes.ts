import { postService, likeService } from "./service.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { json, unauthorized } from "../../lib/http.ts";
import { validPostBody, parseId, parsePagination } from "../../lib/validate.ts";
import { safeJson } from "../../lib/security.ts";
import type { LogFn } from "../../lib/logger.ts";

const noop: LogFn = () => {};

export const postRoutes = {
  async create(req: Request, log: LogFn = noop) {
    const p = await requireAuth(req);
    if (!p) {
      log("posts.create.denied", {});
      return unauthorized();
    }
    const body = await safeJson(req);
    if (!body.ok) return json({ error: "invalid json" }, 400);
    const { body: text } = body.value as { body?: unknown };
    if (!validPostBody(text)) {
      log("posts.create.rejected", { userId: p.sub, reason: "bad_body" });
      return json({ error: "body must be 1-500 chars" }, 400);
    }
    const [post] = await postService.create(p.sub, (text as string).trim());
    log("posts.create", { userId: p.sub, postId: (post as { id: number }).id });
    return json(post, 201);
  },

  async list(req: Request, log: LogFn = noop) {
    const { cursor, limit } = parsePagination(new URL(req.url).searchParams);
    const rows = (await postService.list({ cursor, limit })) as unknown[];
    log("posts.list", { cursor, limit, count: rows.length });
    return json({ posts: rows, next_cursor: rows.length ? (rows[rows.length - 1] as { id: number }).id : null });
  },

  async getById(rawId: string, log: LogFn = noop) {
    const id = parseId(rawId);
    if (!id) {
      log("posts.get.rejected", { reason: "bad_id" });
      return json({ error: "invalid id" }, 400);
    }
    const rows = await postService.getById(id);
    if (!rows.length) {
      log("posts.get.miss", { postId: id });
      return json({ error: "not found" }, 404);
    }
    log("posts.get", { postId: id });
    return json(rows[0]);
  },

  async like(req: Request, rawId: string, log: LogFn = noop) {
    const id = parseId(rawId);
    if (!id) {
      log("posts.like.rejected", { reason: "bad_id" });
      return json({ error: "invalid id" }, 400);
    }
    const p = await requireAuth(req);
    if (!p) {
      log("posts.like.denied", { postId: id });
      return unauthorized();
    }
    const status = await likeService.like(p.sub, id);
    log("posts.like", { userId: p.sub, postId: id, status });
    return json({ status });
  },

  async unlike(req: Request, rawId: string, log: LogFn = noop) {
    const id = parseId(rawId);
    if (!id) {
      log("posts.unlike.rejected", { reason: "bad_id" });
      return json({ error: "invalid id" }, 400);
    }
    const p = await requireAuth(req);
    if (!p) {
      log("posts.unlike.denied", { postId: id });
      return unauthorized();
    }
    const status = await likeService.unlike(p.sub, id);
    log("posts.unlike", { userId: p.sub, postId: id, status });
    return json({ status });
  },
};
