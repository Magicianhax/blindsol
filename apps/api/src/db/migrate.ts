import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./index.js";

async function main(): Promise<void> {
  const db = getDb();
  console.log("[migrate] running migrations from ./drizzle");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done");
  await closeDb();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
