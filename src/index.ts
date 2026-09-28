import { serve } from "./app.ts";
import { closeDb } from "./db.ts";
import { cache } from "./cache.ts";

serve();

const shutdown = async () => { await cache.close(); await closeDb(); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
