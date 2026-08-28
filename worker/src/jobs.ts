type ApprovedEstimateJob = { type: "estimate.approved"; estimate_id: string };
type Job = ApprovedEstimateJob;
import { secret } from "./secrets";

export async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      if (!isJob(message.body)) throw new Error("Unknown job payload");
      if (message.body.type === "estimate.approved") await sendEstimate(message.body.estimate_id, env);
      message.ack();
    } catch (cause) {
      console.error(JSON.stringify({ event: "job_failed", cause: cause instanceof Error ? cause.message : String(cause) }));
      message.retry();
    }
  }
}

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  return Reflect.get(value, "type") === "estimate.approved" && typeof Reflect.get(value, "estimate_id") === "string";
}

async function sendEstimate(estimateId: string, env: Env): Promise<void> {
  const record = await env.DB.prepare(`
    SELECT e.id, e.summary, e.total_cents, c.name, c.email
    FROM estimates e LEFT JOIN customers c ON c.id = e.customer_id
    WHERE e.id = ?
  `).bind(estimateId).first<{ id: string; summary: string; total_cents: number; name: string | null; email: string | null }>();
  if (!record) throw new Error("Estimate not found");
  if (!record.email) return;
  const key = await secret(env, "RESEND_API_KEY");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "Cappy's Electrical <estimates@blackholecapital.xyz>",
      to: [record.email],
      subject: `Estimate from Cappy's Electrical`,
      text: `Hello ${record.name || ""},\n\n${record.summary}\n\nEstimated total: $${(record.total_cents / 100).toFixed(2)}\n\nCappy's Electrical\nWe Repair Everything Electrical`
    })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  await env.DB.prepare("UPDATE estimates SET emailed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(estimateId).run();
}
