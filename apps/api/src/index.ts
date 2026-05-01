import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const { createApp } = await import("./app.js");
const { getDb } = await import("./db/index.js");

const port = Number(process.env.API_PORT ?? 3001);
const app = createApp({ db: getDb() });

app.listen(port, () => {
  console.log(`[api] BlindSol API listening on :${port}`);
});
