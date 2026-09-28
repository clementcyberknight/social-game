import { sql } from "../../db.ts";
import { cache } from "../../cache.ts";

export interface ListPostsOpts { cursor: number; limit: number; }

const FEED_TTL = 15; // seconds: hot path absorbs 100k readers, still fresh
const POST_TTL = 30;

export const postService = {
  async create(userId: number, body: string) {
    const [post] = await sql`INSERT INTO posts (user_id,body) VALUES (${userId},${body}) RETURNING id,body,like_count,created_at`;
    await cache.bumpGen(); // invalidate all cached feed pages via generation
    return [post];
  },

  async list({ cursor, limit }: ListPostsOpts) {
    const gen = await cache.gen();
    const key = `feed:g${gen}:c${cursor}:l${limit}`;
    const hit = await cache.get<unknown[]>(key);
    if (hit) return hit;
    const rows = cursor > 0
      ? await sql`SELECT p.id,p.body,p.like_count,p.created_at,u.email AS author FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id<${cursor} ORDER BY p.id DESC LIMIT ${limit}`
      : await sql`SELECT p.id,p.body,p.like_count,p.created_at,u.email AS author FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT ${limit}`;
    await cache.set(key, rows, FEED_TTL);
    return rows;
  },

  async getById(id: number) {
    const key = `post:${id}`;
    const hit = await cache.get<Record<string, unknown>>(key);
    if (hit) return [hit];
    const rows = await sql`SELECT p.id,p.body,p.like_count,p.created_at,u.email AS author FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=${id} LIMIT 1`;
    if (rows.length) await cache.set(key, rows[0], POST_TTL);
    return rows;
  },
};

export const likeService = {
  async like(userId: number, postId: number) {
    const status = await sql.begin(async tx => {
      const ins = await tx`INSERT INTO likes (user_id,post_id) VALUES (${userId},${postId}) ON CONFLICT DO NOTHING RETURNING post_id`;
      if (ins.length) await tx`UPDATE posts SET like_count=like_count+1 WHERE id=${postId}`;
      return ins.length ? "liked" : "already_liked";
    });
    if (status === "liked") {
      // Only the single post cache is dropped. Feed pages stay cached for
      // their TTL — like counts there are eventually consistent (≤15s stale).
      await cache.del(`post:${postId}`);
    }
    return status;
  },

  async unlike(userId: number, postId: number) {
    const status = await sql.begin(async tx => {
      const del = await tx`DELETE FROM likes WHERE user_id=${userId} AND post_id=${postId} RETURNING post_id`;
      if (del.length) await tx`UPDATE posts SET like_count=GREATEST(like_count-1,0) WHERE id=${postId}`;
      return del.length ? "unliked" : "not_liked";
    });
    if (status === "unliked") {
      await cache.del(`post:${postId}`);
    }
    return status;
  },
};
