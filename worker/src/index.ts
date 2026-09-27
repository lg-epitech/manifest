// manifest: stores self-contained HTML pages in KV and serves them at unguessable URLs.
//
// Public:   GET|HEAD /<slug>             the page, locked down by CSP (opaque origin, no network)
// API:      POST   /api/pages?ttl=<s>    create, returns { slug, url, ... }
//           PUT    /api/pages/<slug>     replace in place (same URL); ttl omitted keeps the current expiry, ttl=0 removes it
//           GET    /api/pages[?cursor=]  list with metadata
//           GET    /api/pages/<slug>     raw HTML
//           DELETE /api/pages/<slug>     404 if missing; edge caches may serve it for up to ~30-60 s
//           GET    /api/health           { ok, authorized }
// Every /api call except health needs `Authorization: Bearer <PUBLISH_TOKEN>`.

interface Env {
  PAGES: KVNamespace;
  PUBLISH_TOKEN: string;
}

// KV metadata is capped at 1024 bytes, so keys are short.
type Meta = {
  t: string; // title
  c: number; // created, epoch ms
  u: number; // updated, epoch ms
  s: number; // size, bytes
  e?: number; // expiry, epoch seconds; absent = never
};

const SLUG_RE = /^[A-Za-z0-9_-]{22}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_TTL = 60; // KV rejects expirations less than 60 s away
const MAX_TTL = 10 * 365 * 24 * 3600;
const MAX_META_BYTES = 1000;

const PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data: blob: https:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  // No allow-same-origin: the page gets an opaque origin, so its scripts can't touch
  // cookies or storage on the Worker's domain.
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
].join("; ");

const COMMON_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Cloudflare reports the visitor's scheme in cf-visitor; send plain http to https.
    if (req.headers.get("cf-visitor")?.includes('"http"')) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api" || path.startsWith("/api/")) return api(req, env, url, path);

    if (req.method !== "GET" && req.method !== "HEAD") return text(405, "Method not allowed", { Allow: "GET, HEAD" });

    const slug = path.slice(1);
    if (!SLUG_RE.test(slug)) return text(404, "Not found");

    // cacheTtl 30 s (the minimum) bounds how long a deleted page lingers in edge caches.
    const page = await env.PAGES.get(slug, { type: "stream", cacheTtl: 30 });
    if (!page) return text(404, "Not found");

    const headers = {
      ...COMMON_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PAGE_CSP,
    };
    if (req.method === "HEAD") {
      await page.cancel();
      return new Response(null, { headers });
    }
    return new Response(page, { headers });
  },
} satisfies ExportedHandler<Env>;

async function api(req: Request, env: Env, url: URL, path: string): Promise<Response> {
  const authed = await authorized(req, env);

  if (path === "/api/health" && req.method === "GET") return json(200, { ok: true, authorized: authed });
  if (!authed) return json(401, { error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });

  if (path === "/api/pages") {
    if (req.method === "GET") return list(env, url);
    if (req.method === "POST") return write(req, env, url, newSlug(), null);
    return json(405, { error: "method not allowed" }, { Allow: "GET, POST" });
  }

  const m = /^\/api\/pages\/([^/]+)$/.exec(path);
  if (!m || !SLUG_RE.test(m[1])) return json(404, { error: "not found" });
  const slug = m[1];

  switch (req.method) {
    case "GET": {
      const { value, metadata } = await env.PAGES.getWithMetadata<Meta>(slug, { type: "stream" });
      if (!value) return json(404, { error: "not found" });
      return new Response(value, {
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}.html"`,
          "X-Manifest-Title": encodeURIComponent(metadata?.t ?? ""),
        },
      });
    }
    case "PUT": {
      const existing = await env.PAGES.getWithMetadata<Meta>(slug, { type: "stream" });
      if (!existing.value) return json(404, { error: "not found" });
      await existing.value.cancel();
      return write(req, env, url, slug, existing.metadata);
    }
    case "DELETE": {
      const existing = await env.PAGES.get(slug, { type: "stream" });
      if (!existing) return json(404, { error: "not found" });
      await existing.cancel();
      await env.PAGES.delete(slug);
      return json(200, { deleted: slug });
    }
    default:
      return json(405, { error: "method not allowed" }, { Allow: "GET, PUT, DELETE" });
  }
}

async function write(req: Request, env: Env, url: URL, slug: string, prev: Meta | null): Promise<Response> {
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BYTES) return json(413, { error: `page exceeds ${MAX_BYTES} bytes` });

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return json(400, { error: "empty body" });
  if (body.byteLength > MAX_BYTES) return json(413, { error: `page exceeds ${MAX_BYTES} bytes` });

  // The CLI validates UTF-8 before upload; here we only need the <title>, and the free
  // plan's 10 ms CPU budget rules out decoding multi-megabyte bodies.
  const head = new TextDecoder().decode(body.slice(0, 65536));

  const ttl = parseTtl(url.searchParams.get("ttl"));
  if (ttl === "invalid") return json(400, { error: `ttl must be 0 or ${MIN_TTL}..${MAX_TTL} seconds` });

  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  let expiration: number | undefined;
  if (typeof ttl === "number" && ttl > 0) expiration = nowSec + ttl;
  // On update, an omitted ttl keeps the current expiry (read from metadata: KV list() lags
  // writes by up to 60 s). A page about to expire stays expiring, clamped to KV's minimum,
  // rather than silently becoming permanent.
  if (ttl === null && prev?.e) expiration = Math.max(prev.e, nowSec + MIN_TTL);

  const meta = fitMeta({ t: extractTitle(head), c: prev?.c ?? now, u: now, s: body.byteLength, ...(expiration ? { e: expiration } : {}) });
  await env.PAGES.put(slug, body, expiration ? { metadata: meta, expiration } : { metadata: meta });

  return json(prev ? 200 : 201, {
    slug,
    url: publicUrl(url, slug),
    title: meta.t,
    size: meta.s,
    created: new Date(meta.c).toISOString(),
    updated: new Date(meta.u).toISOString(),
    expires: expiration ? new Date(expiration * 1000).toISOString() : null,
  });
}

async function list(env: Env, url: URL): Promise<Response> {
  const res = await env.PAGES.list<Meta>({ cursor: url.searchParams.get("cursor") ?? undefined, limit: 1000 });
  return json(200, {
    pages: res.keys.map((k) => ({
      slug: k.name,
      url: publicUrl(url, k.name),
      title: k.metadata?.t ?? "",
      size: k.metadata?.s ?? null,
      created: k.metadata ? new Date(k.metadata.c).toISOString() : null,
      updated: k.metadata ? new Date(k.metadata.u).toISOString() : null,
      expires: (k.expiration ?? k.metadata?.e) ? new Date((k.expiration ?? k.metadata!.e!) * 1000).toISOString() : null,
    })),
    cursor: res.list_complete ? null : res.cursor,
  });
}

async function authorized(req: Request, env: Env): Promise<boolean> {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get("Authorization") ?? "");
  if (!m || !env.PUBLISH_TOKEN) return false;
  const enc = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(m[1])),
    crypto.subtle.digest("SHA-256", enc.encode(env.PUBLISH_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(given, expected);
}

// Links always point at https, whatever scheme the request came in on.
function publicUrl(url: URL, slug: string): string {
  const origin = url.hostname === "localhost" ? url.origin : `https://${url.host}`;
  return `${origin}/${slug}`;
}

function newSlug(): string {
  // 16 random bytes -> 22 base64url characters (128 bits).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseTtl(raw: string | null): number | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const n = Number(raw);
  if (n === 0) return 0;
  return n >= MIN_TTL && n <= MAX_TTL ? n : "invalid";
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html.replace(/<!--[\s\S]*?-->/g, ""));
  if (!m) return "";
  return m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fitMeta(meta: Meta): Meta {
  const enc = new TextEncoder();
  // Cut by code point, not UTF-16 unit, so a title never ends in a lone surrogate.
  let chars = Array.from(meta.t).slice(0, 200);
  while (chars.length && enc.encode(JSON.stringify({ ...meta, t: chars.join("") })).length > MAX_META_BYTES) chars = chars.slice(0, -10);
  return { ...meta, t: chars.join("") };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      ...extra,
    },
  });
}

function text(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      ...extra,
    },
  });
}
