import { cents, columnMap, parseCsv, value } from "./csv";
import { corsHeaders, error, json, readJson } from "./http";
import { handleQueue } from "./jobs";
import { askRuntime, draftEstimate } from "./runtime";
import { secret } from "./secrets";

type CustomerInput = { name?: string; email?: string; phone?: string; address?: string; amount_cents?: number; billing_status?: string };
type AssistantInput = { message?: string };
type AssistantSettings = { personality: string; voice: string; has_avatar: boolean };
type ReceptionistSettings = { enabled: boolean };
type AppSettings = { assistant: AssistantSettings; receptionist: ReceptionistSettings };

const DEFAULT_SETTINGS: AppSettings = {
  assistant: { personality: "Friendly, patient and direct. Speak plainly and keep answers short.", voice: "vale", has_avatar: false },
  receptionist: { enabled: true }
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env.ALLOWED_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const response = await route(request, url, env, ctx);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (cause) {
      console.error(JSON.stringify({ event: "request_failed", method: request.method, path: url.pathname, cause: cause instanceof Error ? cause.message : String(cause) }));
      const response = error(cause instanceof Error ? cause.message : "Unexpected error", 500);
      Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    }
  },
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    return handleQueue(batch, env);
  }
} satisfies ExportedHandler<Env>;

async function route(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "cappys-api", tenant: env.TENANT_ID, time: new Date().toISOString() });
  }
  if (request.method === "GET" && url.pathname === "/api/dashboard") return dashboard(env);
  if (request.method === "GET" && url.pathname === "/api/customers") return listCustomers(env);
  if (request.method === "POST" && url.pathname === "/api/customers") return createCustomer(request, env);
  if (request.method === "GET" && url.pathname === "/api/settings") return getSettingsResponse(env);
  if (request.method === "POST" && url.pathname === "/api/settings") return saveSettings(request, env, ctx);
  if (request.method === "POST" && url.pathname === "/api/assistant/avatar") return uploadAvatar(request, env);
  if (request.method === "GET" && url.pathname === "/api/media/avatar") return serveAvatar(env);
  if (request.method === "POST" && url.pathname === "/api/imports/customers") return importCustomers(request, env);
  if (request.method === "POST" && url.pathname === "/api/estimates/draft") return createDraft(request, env);
  if (request.method === "POST" && url.pathname === "/api/estimates/transcribe") return transcribeEstimate(request, env);
  const approval = url.pathname.match(/^\/api\/estimates\/([^/]+)\/approve$/);
  if (request.method === "POST" && approval) return approveEstimate(approval[1], request, env, ctx);
  if (request.method === "POST" && url.pathname === "/api/billing/connect") return connectBilling(env);
  if (request.method === "POST" && url.pathname === "/api/assistant/message") return assistant(request, env);
  if (request.method === "POST" && url.pathname === "/api/video/session") return videoSession(request, env);
  if (request.method === "POST" && url.pathname === "/api/receptionist/config") return receptionistConfig(request, env);
  if (url.pathname.startsWith("/twilio/")) return proxyService(request, env.VOICE, url.pathname);
  return error("Not found", 404);
}

async function dashboard(env: Env): Promise<Response> {
  const [paid, due, estimates, calls] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) value FROM recurring_billing WHERE status = 'paid' AND strftime('%Y-%m', updated_at) = strftime('%Y-%m', 'now')").first<{ value: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) value FROM recurring_billing WHERE status IN ('pending','active') AND next_bill_at <= datetime('now', '+7 days')").first<{ value: number }>(),
    env.DB.prepare("SELECT COUNT(*) value FROM estimates WHERE status IN ('draft','approved')").first<{ value: number }>(),
    env.DB.prepare("SELECT COUNT(*) value FROM call_records WHERE status = 'answered' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')").first<{ value: number }>()
  ]);
  return json({ metrics: { paid_month_cents: paid?.value || 0, coming_due_cents: due?.value || 0, open_estimates: estimates?.value || 0, calls_answered: calls?.value || 0 } });
}

async function listCustomers(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT id, name, email, phone, address, amount_cents, billing_status FROM customers ORDER BY name LIMIT 500").all();
  return json({ customers: result.results });
}

async function createCustomer(request: Request, env: Env): Promise<Response> {
  const input = await readJson<CustomerInput>(request);
  if (!input.name?.trim()) return error("Customer name is required");
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO customers (id, name, email, phone, address, amount_cents, billing_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, input.name.trim(), input.email?.trim() || null, input.phone?.trim() || null, input.address?.trim() || "", Math.max(0, input.amount_cents || 0), input.billing_status || "not_configured").run();
  await audit(env, "cappy", "customer.created", "customer", id, {});
  return json({ customer: { id, ...input } }, 201);
}

async function importCustomers(request: Request, env: Env): Promise<Response> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > 2_000_000) return error("CSV must be smaller than 2 MB", 413);
  const input = await request.text();
  if (input.length > 2_000_000) return error("CSV must be smaller than 2 MB", 413);
  const rows = parseCsv(input);
  if (rows.length < 2) return error("CSV needs a header row and at least one customer");
  const headers = columnMap(rows[0]);
  let imported = 0;
  let rejected = 0;
  const statements: D1PreparedStatement[] = [];
  for (const row of rows.slice(1)) {
    const name = value(row, headers, "name", "customer", "customername");
    const address = value(row, headers, "address", "serviceaddress", "billingaddress");
    if (!name) { rejected += 1; continue; }
    const id = crypto.randomUUID();
    const amountCents = cents(value(row, headers, "amount", "monthlyamount", "balance"));
    const interval = value(row, headers, "interval", "frequency") || "monthly";
    const nextBillAt = value(row, headers, "nextbilldate", "nextbillingdate", "nextdue") || null;
    statements.push(env.DB.prepare(`
      INSERT INTO customers (id, name, email, phone, address, amount_cents, billing_status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'csv')
    `).bind(id, name, value(row, headers, "email") || null, value(row, headers, "phone", "telephone") || null, address, amountCents, value(row, headers, "status", "billingstatus") || "not_configured"));
    if (amountCents > 0) {
      statements.push(env.DB.prepare(`
        INSERT INTO recurring_billing (id, customer_id, amount_cents, interval, next_bill_at, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).bind(crypto.randomUUID(), id, amountCents, interval, nextBillAt));
    }
    imported += 1;
  }
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  const importId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO imports (id, imported_count, rejected_count) VALUES (?, ?, ?)").bind(importId, imported, rejected).run();
  await audit(env, "cappy", "customers.imported", "import", importId, { imported, rejected });
  return json({ import_id: importId, imported, rejected });
}

async function createDraft(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ transcript?: string; customer_id?: string }>(request);
  if (!input.transcript?.trim()) return error("Estimate details are required");
  const drafted = await draftEstimate(env, input.transcript);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO estimates (id, customer_id, transcript, summary, total_cents) VALUES (?, ?, ?, ?, ?)")
    .bind(id, input.customer_id || null, input.transcript.trim(), drafted.summary, drafted.total_cents).run();
  await audit(env, "cappy", "estimate.drafted", "estimate", id, {});
  return json({ estimate: { id, ...drafted, status: "draft" } }, 201);
}

async function transcribeEstimate(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const audio = form.get("audio");
  const customerId = String(form.get("customer_id") || "").trim() || null;
  if (!(audio instanceof File)) return error("Audio file is required");
  if (audio.size > 12_000_000) return error("Recording is too large", 413);
  const key = await secret(env, "DEEPGRAM_API_KEY");
  const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true", {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": audio.type || "audio/webm" },
    body: audio.stream()
  });
  if (!response.ok) return error(`Transcription service returned ${response.status}`, 502);
  const payload = await response.json() as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
  const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (!transcript) return error("I could not hear enough to create an estimate");
  const drafted = await draftEstimate(env, transcript);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO estimates (id, customer_id, transcript, summary, total_cents) VALUES (?, ?, ?, ?, ?)").bind(id, customerId, transcript, drafted.summary, drafted.total_cents).run();
  await audit(env, "cappy", "estimate.voice_drafted", "estimate", id, {});
  return json({ transcript, estimate: { id, ...drafted, status: "draft" } }, 201);
}

async function approveEstimate(id: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const input = await readJson<{ send_email?: boolean }>(request).catch(() => ({ send_email: true }));
  const result = await env.DB.prepare("UPDATE estimates SET status = 'approved', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'").bind(id).run();
  if (!result.meta.changes) return error("Draft estimate not found", 404);
  if (input.send_email !== false) ctx.waitUntil(env.JOBS.send({ type: "estimate.approved", estimate_id: id }));
  await audit(env, "cappy", "estimate.approved", "estimate", id, { queued_email: input.send_email !== false });
  return json({ estimate_id: id, status: "approved", queued_email: input.send_email !== false });
}

async function connectBilling(env: Env): Promise<Response> {
  const response = await env.PAYME.fetch("https://payme.internal/api/stripe/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: env.TENANT_ID, return_url: `${env.APP_ORIGIN}/?stripe=connected` })
  });
  if (!response.ok) return error("PayMe could not start Stripe setup", 502);
  return new Response(response.body, response);
}

async function assistant(request: Request, env: Env): Promise<Response> {
  const input = await readJson<AssistantInput>(request);
  if (!input.message?.trim()) return error("Message is required");
  const customers = await env.DB.prepare("SELECT id, name, address, amount_cents, billing_status FROM customers ORDER BY updated_at DESC LIMIT 25").all();
  const estimates = await env.DB.prepare("SELECT id, summary, total_cents, status, created_at FROM estimates ORDER BY created_at DESC LIMIT 15").all();
  const settings = await loadSettings(env);
  const reply = await askRuntime(env, [
    { role: "system", content: `You are Cappy's Electrical office assistant. Personality: ${settings.assistant.personality} Use the supplied business data. Never claim an action was completed unless the tool data proves it. Estimates require Cappy's visible approval before email.` },
    { role: "system", content: JSON.stringify({ customers: customers.results, estimates: estimates.results }) },
    { role: "user", content: input.message.trim() }
  ], 350);
  return json({ reply: reply || "The assistant runtime is not configured yet. Your customer and estimate records are safe in Cappy's database." });
}

async function videoSession(request: Request, env: Env): Promise<Response> {
  const input = await readJson<Record<string, unknown>>(request);
  const settings = await loadSettings(env);
  const response = await env.VIDEO.fetch("https://video.internal/api/video/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_id: env.TENANT_ID,
      agent_name: "cappys-assistant",
      personality: settings.assistant.personality,
      voice: settings.assistant.voice,
      avatar_url: settings.assistant.has_avatar ? `${env.APP_ORIGIN}/api/media/avatar` : null,
      ...input
    })
  });
  if (!response.ok) return error("Video assistant could not start", 502);
  return new Response(response.body, response);
}

async function receptionistConfig(request: Request, env: Env): Promise<Response> {
  const input = await readJson<Record<string, unknown>>(request);
  const settings = await loadSettings(env);
  const response = await env.VOICE.fetch("https://voice.internal/api/receptionist/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: env.TENANT_ID, business_name: "Cappy's Electrical", capabilities: ["bill_lookup", "customer_lookup", "estimate_request", "human_handoff"], ...settings.receptionist, personality: settings.assistant.personality, voice: settings.assistant.voice, ...input })
  });
  if (!response.ok) return error("Receptionist configuration failed", 502);
  return new Response(response.body, response);
}

async function loadSettings(env: Env): Promise<AppSettings> {
  const result = await env.DB.prepare("SELECT key, value_json FROM settings WHERE key IN ('assistant','receptionist')").all<{ key: string; value_json: string }>();
  const settings = structuredClone(DEFAULT_SETTINGS);
  for (const row of result.results) {
    try {
      const stored = JSON.parse(row.value_json) as Record<string, unknown>;
      if (row.key === "assistant") settings.assistant = { ...settings.assistant, ...stored } as AssistantSettings;
      if (row.key === "receptionist") settings.receptionist = { ...settings.receptionist, ...stored } as ReceptionistSettings;
    } catch { console.warn(JSON.stringify({ event: "invalid_setting", key: row.key })); }
  }
  return settings;
}

async function getSettingsResponse(env: Env): Promise<Response> {
  return json({ settings: await loadSettings(env) });
}

async function saveSettings(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const input = await readJson<Partial<AppSettings>>(request);
  const current = await loadSettings(env);
  const personality = input.assistant?.personality?.trim();
  if (personality && personality.length > 600) return error("Personality must be 600 characters or less");
  const settings: AppSettings = {
    assistant: {
      ...current.assistant,
      ...(input.assistant || {}),
      personality: personality || current.assistant.personality,
      voice: input.assistant?.voice?.trim() || current.assistant.voice
    },
    receptionist: { ...current.receptionist, ...(input.receptionist || {}) }
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key, value_json, updated_at) VALUES ('assistant', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP").bind(JSON.stringify(settings.assistant)),
    env.DB.prepare("INSERT INTO settings (key, value_json, updated_at) VALUES ('receptionist', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP").bind(JSON.stringify(settings.receptionist))
  ]);
  await audit(env, "cappy", "settings.updated", "settings", "assistant", { receptionist_enabled: settings.receptionist.enabled, voice: settings.assistant.voice });
  ctx.waitUntil(syncReceptionist(env, settings).catch((cause) => console.error(JSON.stringify({ event: "receptionist_sync_failed", cause: cause instanceof Error ? cause.message : String(cause) }))));
  return json({ settings });
}

async function syncReceptionist(env: Env, settings: AppSettings): Promise<void> {
  const response = await env.VOICE.fetch("https://voice.internal/api/receptionist/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: env.TENANT_ID, business_name: "Cappy's Electrical", capabilities: ["bill_lookup", "customer_lookup", "estimate_request", "human_handoff"], enabled: settings.receptionist.enabled, personality: settings.assistant.personality, voice: settings.assistant.voice })
  });
  if (!response.ok) throw new Error(`Voice service returned ${response.status}`);
}

async function uploadAvatar(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const avatar = form.get("avatar");
  if (!(avatar instanceof File)) return error("Avatar image is required");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(avatar.type)) return error("Avatar must be a JPEG, PNG or WebP image");
  if (avatar.size > 5_000_000) return error("Avatar must be smaller than 5 MB", 413);
  await env.MEDIA.put("assistant/avatar", avatar.stream(), { httpMetadata: { contentType: avatar.type, cacheControl: "public, max-age=300" } });
  const settings = await loadSettings(env);
  settings.assistant.has_avatar = true;
  await env.DB.prepare("INSERT INTO settings (key, value_json, updated_at) VALUES ('assistant', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP").bind(JSON.stringify(settings.assistant)).run();
  await audit(env, "cappy", "assistant.avatar_updated", "settings", "assistant", { content_type: avatar.type, size: avatar.size });
  return json({ avatar_url: "/api/media/avatar", has_avatar: true });
}

async function serveAvatar(env: Env): Promise<Response> {
  const avatar = await env.MEDIA.get("assistant/avatar");
  if (!avatar) return error("Avatar not found", 404);
  const headers = new Headers();
  avatar.writeHttpMetadata(headers);
  headers.set("etag", avatar.httpEtag);
  headers.set("cache-control", "public, max-age=300");
  return new Response(avatar.body, { headers });
}

async function proxyService(request: Request, service: Fetcher, path: string): Promise<Response> {
  const target = new URL(request.url);
  target.protocol = "https:";
  target.hostname = "voice.internal";
  target.pathname = path;
  return service.fetch(new Request(target, request));
}

async function audit(env: Env, actor: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_events (id, actor, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, entityType, entityId, JSON.stringify(details)).run();
  env.ANALYTICS.writeDataPoint({ blobs: [env.TENANT_ID, action, entityType], doubles: [1], indexes: [entityId] });
}
