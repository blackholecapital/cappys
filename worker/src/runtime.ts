type RuntimeMessage = { role: "system" | "user"; content: string };
import { secret } from "./secrets";

export async function askRuntime(env: Env, messages: RuntimeMessage[], maxTokens = 450): Promise<string> {
  const runtimeUrl = String(env.EILA_RUNTIME_URL || "");
  if (!runtimeUrl) return "";
  const token = await secret(env, "EILA_RUNTIME_TOKEN");
  const response = await fetch(`${runtimeUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: "cappys-assistant", messages, temperature: 0.2, max_tokens: maxTokens })
  });
  if (!response.ok) throw new Error(`Assistant runtime returned ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || "";
}

export async function draftEstimate(env: Env, transcript: string): Promise<{ summary: string; total_cents: number }> {
  const fallback = { summary: transcript.trim(), total_cents: extractTotal(transcript) };
  if (!env.EILA_RUNTIME_URL) return fallback;
  try {
    const response = await askRuntime(env, [
      { role: "system", content: "Convert an electrician's dictated job notes into a concise customer-facing estimate. Return strict JSON with summary and total_cents. Do not invent a price. Preserve stated materials, labor, exclusions and validity." },
      { role: "user", content: transcript }
    ]);
    const parsed = JSON.parse(response) as { summary?: string; total_cents?: number };
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      total_cents: Number.isInteger(parsed.total_cents) ? Math.max(0, parsed.total_cents || 0) : fallback.total_cents
    };
  } catch {
    return fallback;
  }
}

function extractTotal(transcript: string): number {
  const match = transcript.match(/(?:total|price|estimate(?:d)?(?:\s+total)?)\D{0,12}\$?([\d,]+(?:\.\d{1,2})?)/i);
  return match ? Math.round(Number(match[1].replace(/,/g, "")) * 100) : 0;
}
