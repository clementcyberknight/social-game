# social-game — how many users can 4GB RAM / 2vCPU / 50GB SSD handle?

A social game: push a tiny box to its limit and find out which architecture serves the most
users. Pure-Bun backend (zero npm deps) — email+password auth with Bearer JWT + logout,
posts, idempotent likes, keyset-paginated feed. Postgres 16 is the source of truth, Redis
absorbs the hot path.

## The experiment
One box, fixed resources, one question: **max users at p99 < 500ms?**
Rules: total across all services must stay inside 4GB RAM / 2vCPU / 50GB SSD. Any number of
services allowed — Postgres, Redis, replicas, PgBouncer — as long as the budget holds.
Each iteration changes the architecture, load-tests, and records the ceiling here.

| Round | Architecture | Result |
|---|---|---|
| 1 | Bun + Postgres, no cache | _not yet measured_ |
| 2 (current) | + Redis feed/post cache, Redis logout blocklist | _not yet measured_ |

## How the current round tries to win
- Keyset pagination (no OFFSET), denormalized `like_count` (no COUNT(*) on read)
- Feed pages cached 15s, single posts 30s, O(1) invalidation via `feed:gen` counter
- Pooled `bun:sql` (max 15), private-network Postgres + Redis, stateless app (replica-ready)
- Fail-open: Redis down → straight to Postgres, no crash

## Stack
- Runtime: Bun only — `Bun.serve`, `bun:sql`, `Bun.password` (argon2id), `bun:redis`, WebCrypto HS256 JWT
- DBs: Postgres 16 (`src/db/schema.sql`), Redis 7 (`social-redis`)
- Deploy: Coolify (Agentic), project `6zk7alm7chcdldpcuanzuhi0`, private networking

## Resource budget (must not exceed 4GB / 2vCPU / 50GB)
| Component | Limit | Reserve | Notes |
|---|---|---|---|
| `social-postgres` | 1200m / 0.75 CPU | 800m | private, no public port |
| `social-redis` | 384m / 0.25 CPU | 192m | private, feed + blocklist cache |
| Bun app x1 | 1500m / 1.0 CPU (set at Coolify app create) | 800m | single pool, stateless |
| OS/proxy/headroom | ~900m | — | do not allocate |

## Security model
- Validation: strict email regex, password 8–72 chars w/ letter+digit, post body 1–500 chars,
  numeric id guard, clamped pagination, 8KB JSON cap — every route returns 400, never throws.
- Auth: argon2id hash, 7-day HS256 JWT (`sub/jti/exp`), Redis `bl:{jti}` blocklist checked
  first with Postgres `revoked_tokens` as fallback. Generic error messages.
  No app-level rate limiting (removed for the load experiment; abuse protection
  belongs at the proxy / WAF layer).
- Hardening: security headers (nosniff/DENY/no-referrer), no stack/SQL leaks (500 is generic),
  tagged-template SQL only (injection-safe), private DBs, secrets via env only.

## Layout
```
src/index.ts  entry + graceful shutdown
src/app.ts    router (Bun.serve fetch) + error boundary
src/config.ts env fail-fast | src/db.ts single SQL client | src/cache.ts Redis (fail-open)
src/db/schema.sql  DDL
src/lib/      jwt.ts password.ts http.ts validate.ts security.ts (rate-limit/headers/safeJson)
src/modules/auth/   service.ts (db) + routes.ts (handlers)
src/modules/posts/  service.ts (db+cache) + routes.ts (handlers)
src/middleware/auth.ts  requireAuth
```

## Run
```bash
bun install
export DATABASE_URL=postgres://social:pass@localhost:5432/social REDIS_URL=redis://localhost:6379 JWT_SECRET=$(bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())")
bun run src/migrate.ts   # applies src/db/schema.sql
bun run src/index.ts     # :3000
```

## API
- `POST /signup {email,password}` → 201 | `POST /login` → `{token}` | `POST /logout` (Bearer)
- `POST /posts {body}` (Bearer) | `GET /posts?cursor=&limit=` | `GET /posts/:id`
- `POST /posts/:id/like` + `DELETE /posts/:id/like` (Bearer, idempotent)
- `GET /health`
