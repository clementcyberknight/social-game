export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  // Load-test window knobs. Defaults are production-safe; raise only for tests.
  rlSignupMax: Number(process.env.RATE_LIMIT_SIGNUP_MAX ?? 10),
  rlLoginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 20),
} as const;

if (!config.jwtSecret) throw new Error("JWT_SECRET required");
if (!config.databaseUrl) throw new Error("DATABASE_URL required");
// REDIS_URL optional: app fail-opens to Postgres when Redis is down/missing.
