// Seeds the DB: users -> posts -> likes. Run INSIDE the app container:
//   bun run load/seed.ts
// Env: SEED_USERS=1000 SEED_POSTS=10000 SEED_LIKES=20000 (defaults)
import { SQL } from "bun";

const sql = new SQL({ url: process.env.DATABASE_URL! });
const USERS = Number(process.env.SEED_USERS ?? 1000);
const POSTS = Number(process.env.SEED_POSTS ?? 10_000);
const LIKES = Number(process.env.SEED_LIKES ?? 20_000);
const BATCH = 1000;
const TAG = Date.now().toString(36);

const t0 = Date.now();
// One hash for all seed users (fast; these are fake accounts).
const hash = await Bun.password.hash("Seedpass1", { algorithm: "argon2id" });

// 1. users
for (let i = 0; i < USERS; i += BATCH) {
  const n = Math.min(BATCH, USERS - i);
  const rows = Array.from({ length: n }, (_, k) => ({
    email: `seed-${TAG}-${i + k}@seed.test`,
    password_hash: hash,
  }));
  await sql`INSERT INTO users (email, password_hash) VALUES ${sql(rows)} ON CONFLICT DO NOTHING`;
  console.log(`users ${Math.min(i + n, USERS)}/${USERS}`);
}
const ids = (await sql`SELECT id FROM users WHERE email LIKE ${`seed-${TAG}-%`} ORDER BY id`)
  .map((r: { id: number }) => r.id);

// 2. posts (round-robin authors, varied bodies/timestamps for realistic feed)
const bodies = [
  "hello world", "shipping it", "bun is fast", "day in the life", "hot take",
  "just deployed", "weekend project", "thoughts?", "milestone reached", "good morning",
];
for (let i = 0; i < POSTS; i += BATCH) {
  const n = Math.min(BATCH, POSTS - i);
  const rows = Array.from({ length: n }, (_, k) => ({
    user_id: ids[(i + k) % ids.length]!,
    body: `${bodies[(i + k) % bodies.length]} #${i + k}`,
  }));
  await sql`INSERT INTO posts (user_id, body) VALUES ${sql(rows)}`;
  console.log(`posts ${Math.min(i + n, POSTS)}/${POSTS}`);
}
const postIds = (await sql`SELECT id FROM posts ORDER BY id DESC LIMIT ${POSTS}`)
  .map((r: { id: number }) => r.id);

// 3. likes (random pairs, deduped in JS to avoid conflict churn)
const seen = new Set<string>();
const pairs: { user_id: number; post_id: number }[] = [];
while (pairs.length < LIKES) {
  const u = ids[Math.floor(Math.random() * ids.length)]!;
  const p = postIds[Math.floor(Math.random() * postIds.length)]!;
  const k = `${u}:${p}`;
  if (seen.has(k)) continue;
  seen.add(k);
  pairs.push({ user_id: u, post_id: p });
}
for (let i = 0; i < pairs.length; i += BATCH) {
  await sql`INSERT INTO likes (user_id, post_id) VALUES ${sql(pairs.slice(i, i + BATCH))} ON CONFLICT DO NOTHING`;
  console.log(`likes ${Math.min(i + BATCH, pairs.length)}/${pairs.length}`);
}

// 4. reconcile counters (single pass, exact)
await sql`UPDATE posts p SET like_count = c.n FROM (SELECT post_id, COUNT(*)::int AS n FROM likes GROUP BY post_id) c WHERE c.post_id = p.id`;

console.log(`SEED DONE users=${USERS} posts=${POSTS} likes=${pairs.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.close();
