import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desc } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const { getDb, schema, closeDb } = await import("../src/db/index.js");

const db = getDb();

const now = new Date();
console.log("=== current time on this machine ===");
console.log("local      :", now.toString());
console.log("ISO (UTC)  :", now.toISOString());
console.log("epoch ms   :", now.getTime());

console.log("");
console.log("=== last 10 posts in DB (newest first) ===");
const rows = await db
  .select()
  .from(schema.posts)
  .orderBy(desc(schema.posts.createdAt))
  .limit(10);

if (rows.length === 0) {
  console.log("(empty)");
} else {
  for (const r of rows) {
    const ageMs = now.getTime() - r.createdAt.getTime();
    const ageMin = Math.round(ageMs / 60_000);
    const ageHr = Math.round(ageMs / 3_600_000);
    console.log(
      `  ${r.id.slice(0, 8)} · ${r.createdAt.toISOString()} · age=${ageMin}m (${ageHr}h) · "${r.content.slice(0, 40)}"`,
    );
  }
}

console.log("");
console.log("=== Postgres NOW() vs our clock ===");
const pgNow = await db.execute({ sql: "SELECT NOW() as now, EXTRACT(EPOCH FROM NOW()) * 1000 as ms", params: [] } as any).catch(async () => {
  // raw query fallback
  const res = await (db as any).$client?.query?.("SELECT NOW() as now, EXTRACT(EPOCH FROM NOW()) * 1000 as ms");
  return res?.rows?.[0];
});
console.log(pgNow);

await closeDb();
