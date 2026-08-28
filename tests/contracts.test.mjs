import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("estimate delivery remains behind explicit approval", async () => {
  const source = await readFile(new URL("worker/src/index.ts", root), "utf8");
  assert.match(source, /status = 'approved'/);
  assert.match(source, /estimate\.approved/);
  assert.doesNotMatch(source, /createDraft[\s\S]{0,500}RESEND_API_KEY/);
});

test("centralized secrets are bound by name and never committed", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const deploy = packageJson.scripts["deploy:api"];
  assert.match(deploy, /default_secrets_store/);
  assert.match(deploy, /XYZ_DEMO_DEEPGRAM_API_KEY/);
  const config = await readFile(new URL("worker/wrangler.toml", root), "utf8");
  assert.doesNotMatch(config, /secrets_store_secrets/);
  assert.doesNotMatch(config, /XYZ_DEMO_[A-Z_]+\s*=/);
});

test("D1 is authoritative for core business records", async () => {
  const migration = await readFile(new URL("worker/migrations/0001_cappys_core.sql", root), "utf8");
  for (const table of ["customers", "estimates", "recurring_billing", "call_records", "audit_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("CSV import creates recurring schedules, not customer records alone", async () => {
  const source = await readFile(new URL("worker/src/index.ts", root), "utf8");
  assert.match(source, /INSERT INTO recurring_billing/);
  assert.match(source, /nextBillAt/);
  assert.match(source, /interval/);
});
