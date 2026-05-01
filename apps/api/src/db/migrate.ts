import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env") });

const { closeDb, getDb } = await import("./index.js");

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
