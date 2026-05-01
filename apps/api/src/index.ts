import "dotenv/config";
import { createApp } from "./app.js";
import { getDb } from "./db/index.js";

const port = Number(process.env.API_PORT ?? 3001);
const app = createApp({ db: getDb() });

app.listen(port, () => {
  console.log(`[api] BlindSol API listening on :${port}`);
});
