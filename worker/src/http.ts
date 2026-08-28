export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function corsHeaders(request: Request, allowedOrigin: string): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = origin === allowedOrigin || origin?.endsWith(".pages.dev");
  return {
    "access-control-allow-origin": allowed && origin ? origin : allowedOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

export async function readJson<T>(request: Request, maxBytes = 128_000): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Request is too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("Request is too large");
  return JSON.parse(text) as T;
}

