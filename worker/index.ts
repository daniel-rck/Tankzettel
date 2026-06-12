export interface Env {
  ASSETS: Fetcher;
}

const BASE_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

// The app makes no requests except to the Gemini API (spec §13); the theme
// snippet lives in /theme-init.js so script-src needs no inline allowance.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const HTML_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if ((headers.get("content-type") ?? "").includes("text/html")) {
    for (const [name, value] of Object.entries(HTML_SECURITY_HEADERS)) {
      headers.set(name, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return Response.json({ ok: true });
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, ctx);
    }

    // Fall through to Workers Assets (static SPA bundle).
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;

async function handleApi(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
  return Response.json({ error: "not_found" }, { status: 404 });
}
