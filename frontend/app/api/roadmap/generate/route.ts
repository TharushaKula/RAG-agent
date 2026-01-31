/**
 * Proxy for POST /api/roadmap/generate with a long timeout (120s).
 * Next.js rewrites have a ~30s proxy timeout; roadmap generation can take 20–60s,
 * so we use this route to avoid 500 "Internal Server Error" when the backend succeeds.
 */
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const TIMEOUT_MS = 120_000; // 2 minutes

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const contentType = request.headers.get("content-type") || "application/json";
  let body: string | undefined;
  try {
    body = await request.text();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_URL}/api/roadmap/generate`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        ...(auth ? { Authorization: auth } : {}),
      },
      body: body || undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const resBody = await res.text();
    return new Response(resBody, {
      status: res.status,
      statusText: res.statusText,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : "Proxy request failed";
    const isTimeout = message.includes("abort") || message.includes("timeout");
    return new Response(
      JSON.stringify({
        error: "Failed to generate roadmap",
        message: isTimeout
          ? "Request timed out. The backend may still be generating; check your roadmaps in a moment."
          : message,
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
