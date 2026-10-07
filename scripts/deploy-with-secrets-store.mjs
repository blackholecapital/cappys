#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Tenant deployment belongs here. Only binding names and store metadata are read;
// secret values remain inside Cloudflare.
export function parseArgs(argv) {
  const out = { config: "", store: "default_secrets_store", bindings: [], passthrough: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") out.config = argv[++i] || "";
    else if (arg === "--store") out.store = argv[++i] || "";
    else if (arg === "--bind") out.bindings.push(argv[++i] || "");
    else if (arg === "--") { out.passthrough = argv.slice(i + 1); break; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.config || !out.store || !out.bindings.length) {
    throw new Error("--config, --store, and at least one --bind BINDING=SECRET_NAME are required");
  }
  const seen = new Set();
  out.bindings = out.bindings.map(pair => {
    const parts = pair.split("=");
    if (parts.length !== 2) throw new Error(`Invalid binding: ${pair}`);
    const [binding, secretName] = parts.map(part => part.trim());
    if (!/^[A-Z0-9_]+$/i.test(binding) || !/^[A-Z0-9_.-]+$/i.test(secretName)) {
      throw new Error(`Invalid binding: ${pair}`);
    }
    if (seen.has(binding)) throw new Error(`Duplicate binding: ${binding}`);
    seen.add(binding);
    return { binding, secretName };
  });
  return out;
}

export function resolveStoreId(output, storeName) {
  const clean = output.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, "");
  // Wrangler currently returns a table. Match a whole cell, not a substring.
  for (const line of clean.split(/\r?\n/)) {
    const cells = line.split(/[│|]/).map(cell => cell.trim());
    if (!cells.includes(storeName)) continue;
    const id = cells.find(cell => /^[0-9a-f]{32}$/i.test(cell));
    if (id) return id;
  }
  throw new Error(`Secrets Store '${storeName}' was not found; run npx wrangler secrets-store store list --remote`);
}

function runWrangler(args, capture = false) {
  const bin = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  if (!existsSync(bin)) throw new Error("Pinned Wrangler is missing; run npm ci first");
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(`${result.stdout || ""}${result.stderr || ""}`);
    throw new Error(`Wrangler exited with ${result.status}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

export function deploy(argv, run = runWrangler) {
  const args = parseArgs(argv);
  const configPath = path.resolve(args.config);
  const source = readFileSync(configPath, "utf8");
  if (/\[\[secrets_store_secrets\]\]/.test(source)) {
    throw new Error("Base config already contains Secrets Store bindings");
  }
  const storeId = resolveStoreId(run(["secrets-store", "store", "list", "--remote", "--config", configPath], true), args.store);
  const bindings = args.bindings.map(({ binding, secretName }) =>
    `\n[[secrets_store_secrets]]\nbinding = "${binding}"\nstore_id = "${storeId}"\nsecret_name = "${secretName}"\n`
  ).join("");
  // Keep the generated file beside the base config so assets, main, and
  // migration paths resolve exactly as they do for ordinary Wrangler commands.
  const generatedPath = path.join(path.dirname(configPath), `.wrangler.secrets-store.${process.pid}.toml`);
  try {
    writeFileSync(generatedPath, `${source.trimEnd()}\n${bindings}`, { mode: 0o600 });
    console.log(`Binding ${args.bindings.length} centralized secrets from ${args.store}; values stay in Cloudflare.`);
    run(["deploy", "--config", generatedPath, ...args.passthrough]);
  } finally {
    if (existsSync(generatedPath)) unlinkSync(generatedPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { deploy(process.argv.slice(2)); }
  catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}
