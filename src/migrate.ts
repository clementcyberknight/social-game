import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
const sql = new SQL({ url });
await sql.file("src/db/schema.sql");
await sql.close();
console.log("migrated");
