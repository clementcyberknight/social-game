// Minimal structured JSON logger. Pure Bun, zero deps, stdout only.
// Coolify/Docker captures stdout — no files, no rotation, no leak.
type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN = (process.env.LOG_LEVEL ?? "info") as Level;

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < (ORDER[MIN] ?? 1)) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

export type LogFn = (msg: string, fields?: Record<string, unknown>) => void;
