import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const databaseId = process.argv[2]?.trim();
const configPath = resolve(process.argv[3] || "worker/wrangler.toml");

if (!databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId)) {
  throw new Error("A valid D1 database UUID is required");
}

let source = readFileSync(configPath, "utf8");
const databasePattern = /(\[\[d1_databases\]\][\s\S]*?database_name = "cappys-db"[\s\S]*?database_id = ")[^"]+("\s)/;
if (!databasePattern.test(source)) throw new Error("Could not find the cappys-db binding in worker/wrangler.toml");
source = source.replace(databasePattern, `$1${databaseId}$2`);

const runtimeUrl = process.env.CAPPYS_EILA_RUNTIME_URL?.trim();
if (runtimeUrl) {
  const parsed = new URL(runtimeUrl);
  if (parsed.protocol !== "https:") throw new Error("CAPPYS_EILA_RUNTIME_URL must use HTTPS");
  source = source.replace(/EILA_RUNTIME_URL = "[^"]*"/, `EILA_RUNTIME_URL = "${runtimeUrl.replace(/"/g, "")}"`);
}

writeFileSync(configPath, source);
