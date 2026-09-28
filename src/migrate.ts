import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
const sql = new SQL({ url });
const text = await Bun.file("src/db/schema.sql").text();
await sql.file(text);
await sql.close();
console.log("migrated");
