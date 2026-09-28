import { redis } from "bun";
import { config } from "./config.ts";

const enabled = Boolean(config.redisUrl);

// All helpers fail-open: on Redis error/missing, return null so callers hit Postgres.
export const cache = {
  get enabled() { return enabled; },

  async get<T>(key: string): Promise<T | null> {
    if (!enabled) return null;
    try {
      const v = await redis.get(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch { return null; }
  },

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!enabled) return;
    try { await redis.set(key, JSON.stringify(value), "EX", ttlSec); } catch {}
  },

  async del(...keys: string[]): Promise<void> {
    if (!enabled || !keys.length) return;
    try { await redis.del(...keys); } catch {}
  },

  // exists check for blocklist / rate-limit style keys (plain string values)
  async exists(key: string): Promise<boolean> {
    if (!enabled) return false;
    try { return Boolean(await redis.exists(key)); } catch { return false; }
  },

  async setStr(key: string, ttlSec: number): Promise<void> {
    if (!enabled) return;
    try { await redis.set(key, "1", "EX", ttlSec); } catch {}
  },

  // Feed generation: bump on every write, readers include it in the cache key.
  // Avoids expensive KEYS/SCAN invalidation of all feed pages.
  async gen(): Promise<string> {
    if (!enabled) return "0";
    try { return (await redis.get("feed:gen")) ?? "0"; } catch { return "0"; }
  },

  async bumpGen(): Promise<void> {
    if (!enabled) return;
    try { await redis.incr("feed:gen"); } catch {}
  },

  async close(): Promise<void> {
    if (!enabled) return;
    try { await redis.close(); } catch {}
  },
};
