import { postService, likeService } from "./service.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { json, unauthorized } from "../../lib/http.ts";
import { validPostBody, parseId, parsePagination } from "../../lib/validate.ts";
import { safeJson } from "../../lib/security.ts";

export const postRoutes = {
  async create(req: Request) {
    const p = await requireAuth(req);
    if (!p) return unauthorized();
    const body = await safeJson(req);
    if (!body.ok) return json({ error: "invalid json" }, 400);
    const { body: text } = body.value as { body?: unknown };
    if (!validPostBody(text)) return json({ error: "body must be 1-500 chars" }, 400);
    const [post] = await postService.create(p.sub, (text as string).trim());
    return json(post, 201);
  },

  async list(req: Request) {
    const { cursor, limit } = parsePagination(new URL(req.url).searchParams);
    const rows = (await postService.list({ cursor, limit })) as unknown[];
    return json({ posts: rows, next_cursor: rows.length ? (rows[rows.length - 1] as { id: number }).id : null });
  },

  async getById(rawId: string) {
    const id = parseId(rawId);
    if (!id) return json({ error: "invalid id" }, 400);
    const rows = await postService.getById(id);
    if (!rows.length) return json({ error: "not found" }, 404);
    return json(rows[0]);
  },

  async like(req: Request, rawId: string) {
    const id = parseId(rawId);
    if (!id) return json({ error: "invalid id" }, 400);
    const p = await requireAuth(req);
    if (!p) return unauthorized();
    return json({ status: await likeService.like(p.sub, id) });
  },

  async unlike(req: Request, rawId: string) {
    const id = parseId(rawId);
    if (!id) return json({ error: "invalid id" }, 400);
    const p = await requireAuth(req);
    if (!p) return unauthorized();
    return json({ status: await likeService.unlike(p.sub, id) });
  },
};
