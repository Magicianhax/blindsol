/**
 * Vitest setup file — runs before any test loads.
 *
 * Hard-stops the test runner if it would touch production data. Concretely:
 *   - If `DATABASE_URL_TEST` is set and != `DATABASE_URL`, swap it in so
 *     `getDb()` connects to the dedicated test DB.
 *   - If only `DATABASE_URL` is set (no test DB), null it out so all
 *     `describeIfDb` blocks skip — never wipe prod tables by accident.
 *   - If both are set and equal, refuse to start the suite.
 *
 * Set `DATABASE_URL_TEST` in `.env` to a separate Neon (or local) DB
 * before running `pnpm test` against schema-mutating tests.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env") });

const PROD = process.env.DATABASE_URL;
const TEST = process.env.DATABASE_URL_TEST;

if (PROD && TEST && PROD === TEST) {
  throw new Error(
    "REFUSE TO RUN: DATABASE_URL_TEST is identical to DATABASE_URL.\n" +
      "Integration tests truncate tables. Configure a separate test database\n" +
      "(another Neon project or a local Postgres) and set DATABASE_URL_TEST.",
  );
}

if (TEST) {
  // eslint-disable-next-line no-console
  console.log("[test] using DATABASE_URL_TEST (isolated from prod)");
  process.env.DATABASE_URL = TEST;
} else {
  // No dedicated test DB — disable integration tests entirely so a wipe()
  // can't fire against prod. The unit tests (no DB) still run.
  if (PROD) {
    // eslint-disable-next-line no-console
    console.warn(
      "[test] DATABASE_URL_TEST not set — skipping all describeIfDb blocks " +
        "to avoid wiping the prod database referenced by DATABASE_URL.",
    );
  }
  delete process.env.DATABASE_URL;
}
