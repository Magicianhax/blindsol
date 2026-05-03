import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Hard-stop the runner before any test loads if it would touch the
    // production DB. See test/_setup/db-isolation.ts for the contract.
    setupFiles: ["./test/_setup/db-isolation.ts"],
    // Integration tests share a Postgres connection — run them serially.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
