import { SQL } from "bun";
import { config } from "./config.ts";

// Single shared client for the whole process. Never `new SQL()` per request.
export const sql = new SQL({
  url: config.databaseUrl,
  max: 15,
  idleTimeout: 20,
  maxLifetime: 1800,
  connectionTimeout: 10,
  prepare: false,
});

export async function closeDb() {
  await sql.close({ timeout: 5 }).catch(() => {});
}
