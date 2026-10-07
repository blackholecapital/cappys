import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deploy, parseArgs, resolveStoreId } from "../scripts/deploy-with-secrets-store.mjs";

const storeId = "00b34d29f2c94685b0f250dc5b1ee875";
const table = `│ ${storeId} │ default_secrets_store │`;

test("store lookup requires an exact table cell", () => {
  assert.equal(resolveStoreId(table, "default_secrets_store"), storeId);
  assert.throws(() => resolveStoreId(table.replace("default_secrets_store", "default_secrets_store_backup"), "default_secrets_store"));
});

test("binding arguments reject malformed and duplicate names", () => {
  const base = ["--config", "worker/wrangler.toml"];
  assert.throws(() => parseArgs([...base, "--bind", "KEY=name=value"]));
  assert.throws(() => parseArgs([...base, "--bind", "KEY=a", "--bind", "KEY=b"]));
});

for (const shouldFail of [false, true]) {
  test(`deployment preserves relative asset paths and cleans config on ${shouldFail ? "failure" : "success"}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cappys-deploy-"));
    const configPath = path.join(dir, "wrangler.toml");
    const source = 'name = "cappys-api"\n[assets]\ndirectory = "../web/dist"\n';
    writeFileSync(configPath, source);
    let generatedPath;
    const run = args => {
      if (args[0] === "secrets-store") return table;
      assert.equal(args[0], "deploy");
      generatedPath = args[2];
      assert.equal(path.dirname(generatedPath), dir);
      assert.equal(statSync(generatedPath).mode & 0o777, 0o600);
      const generated = readFileSync(generatedPath, "utf8");
      assert.ok(generated.startsWith(source));
      assert.ok(generated.includes(`store_id = "${storeId}"`));
      assert.ok(generated.includes('secret_name = "XYZ_DEMO_RESEND_API_KEY"'));
      if (shouldFail) throw new Error("upload failed");
      return "";
    };
    try {
      const invoke = () => deploy(["--config", configPath, "--bind", "RESEND_API_KEY=XYZ_DEMO_RESEND_API_KEY"], run);
      if (shouldFail) assert.throws(invoke, /upload failed/);
      else invoke();
      assert.equal(readFileSync(configPath, "utf8"), source);
      assert.equal(existsSync(generatedPath), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
