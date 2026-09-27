#!/usr/bin/env bun
// manifest: check, publish, list, fetch and delete HTML manifests on a manifest Worker.
//
//   bun manifest.ts check   <file.html>
//   bun manifest.ts publish <file.html> [--ttl 7d|30d|90d|<n>h|<n>d|none] [--update <slug-or-url>] [--force] [--allow-secret]
//   bun manifest.ts list    [--json]
//   bun manifest.ts get     <slug-or-url> [-o out.html]
//   bun manifest.ts delete  <slug-or-url>
//   bun manifest.ts login   <url>   (reads the publish token from stdin and stores it with the URL)
//   bun manifest.ts doctor
//
// Endpoint lookup order: $MANIFEST_URL, ~/.config/manifest/url. Token lookup order: $MANIFEST_TOKEN,
// ~/.config/manifest/token (mode 600), macOS Keychain item "manifest-publish-token".

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const KEYCHAIN_SERVICE = "manifest-publish-token";
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "manifest");
const TOKEN_FILE = join(CONFIG_DIR, "token");
const URL_FILE = join(CONFIG_DIR, "url");
const MAX_BYTES = 10 * 1024 * 1024;
const WARN_BYTES = 500 * 1024;
const WARN_DATA_URI_BYTES = 150 * 1024;
const SLUG_RE = /^[A-Za-z0-9_-]{22}$/;

type Level = "error" | "warn";
// Secret findings are kept apart: --force never overrides them, only --allow-secret does.
type Issue = { level: Level; message: string; secret?: boolean };

// ---------- check ----------

// Rules on the markup itself (comments removed; escaped samples in <pre>/<code> contain
// &lt; rather than <, so they never match).
const MARKUP_RULES: Array<{ level: Level; re: RegExp; message: string }> = [
  { level: "error", re: /<script\b[^>]*\bsrc\s*=/i, message: "external <script src>: inline the script, the CSP blocks every script URL" },
  { level: "error", re: /<link\b[^>]*\brel\s*=\s*["']?stylesheet/i, message: "<link rel=stylesheet>: inline the CSS in <style>" },
  { level: "error", re: /<link\b[^>]*\brel\s*=\s*["']?(preload|preconnect|prefetch|dns-prefetch|modulepreload)/i, message: "<link rel=preload/preconnect>: remove it, nothing external loads" },
  { level: "error", re: /<(iframe|object|embed|frame)\b/i, message: "<iframe>/<object>/<embed>: embedded documents are blocked" },
  { level: "error", re: /<base\b/i, message: "<base>: blocked by base-uri 'none'" },
  { level: "error", re: /<(img|source|input)\b[^>]*\bsrc\s*=\s*["']?http:/i, message: "plain http:// image: only data:, blob: and https: images load" },
  { level: "error", re: /\bsrcset\s*=\s*["'][^"']*http:/i, message: "plain http:// in srcset: only data:, blob: and https: images load" },
  { level: "error", re: /<(video|audio|track)\b[^>]*\bsrc\s*=\s*["']?https?:/i, message: "remote audio/video: media only loads from data: or blob:" },
  { level: "warn", re: /<source\b[^>]*\bsrc\s*=\s*["']?https:/i, message: "remote <source>: blocked inside <video>/<audio> (media is data:/blob: only); inside <picture> it loads but prefer data:" },
  { level: "warn", re: /<img\b[^>]*\bsrc\s*=\s*["']?https:/i, message: "remote https image: it loads, but prefer an inline data: URI so the page stays self-contained" },
  { level: "warn", re: /<form\b[^>]*\baction\s*=/i, message: "<form action>: forms can't submit (form-action 'none')" },
  { level: "warn", re: /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, message: "<meta http-equiv=refresh>: remove auto-redirects" },
];

// Rules on code only: <style> contents, <script> contents and on*= attribute values.
const STYLE_RULES: Array<{ level: Level; re: RegExp; message: string }> = [
  { level: "error", re: /@import\b/i, message: "CSS @import: inline the imported CSS" },
  { level: "error", re: /@font-face[^}]*url\(\s*["']?(?!data:)/i, message: "@font-face with a non-data: URL: use system fonts or a data: URI" },
  { level: "error", re: /url\(\s*["']?http:/i, message: "plain http:// in CSS url(): only data:, blob: and https: images load" },
];
const SCRIPT_RULES: Array<{ level: Level; re: RegExp; message: string }> = [
  { level: "error", re: /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b|\bsendBeacon\s*\(/, message: "network calls (fetch/XHR/WebSocket/EventSource/beacon): connect-src is 'none'" },
  { level: "error", re: /\bimport\s*\(\s*["'`]|\bimport\b[^;\n]*\bfrom\s*["'`]https?:/, message: "module imports: nothing external loads, inline the code" },
  { level: "error", re: /\beval\s*\(|\bnew\s+Function\s*\(/, message: "eval / new Function: blocked, the CSP has no 'unsafe-eval'" },
  { level: "warn", re: /\bset(Timeout|Interval)\s*\(\s*["'`]/, message: "setTimeout/setInterval with a string: blocked like eval, pass a function" },
  { level: "warn", re: /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/, message: "storage/cookie access throws in the sandboxed page: wrap it in try/catch or drop it" },
];

const SECRET_RULES: Array<{ re: RegExp; what: string }> = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: "private key" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, what: "AWS access key id" },
  { re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/, what: "GitHub token" },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/, what: "GitLab token" },
  { re: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{24,}/, what: "API secret key (sk-...)" },
  { re: /\b[rs]k_(live|test)_[A-Za-z0-9]{16,}/, what: "Stripe key" },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, what: "Slack token" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, what: "Google API key" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, what: "JWT" },
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/, what: "bearer token" },
  { re: /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/, what: "connection string with a password" },
];

function check(path: string): { issues: Issue[]; bytes: Uint8Array; html: string } {
  if (!existsSync(path)) die(`no such file: ${path}`);
  const bytes = new Uint8Array(readFileSync(path));
  const issues: Issue[] = [];

  if (bytes.byteLength === 0) issues.push({ level: "error", message: "file is empty" });
  if (bytes.byteLength > MAX_BYTES) issues.push({ level: "error", message: `${fmtSize(bytes.byteLength)} is over the 10 MB limit` });
  else if (bytes.byteLength > WARN_BYTES) issues.push({ level: "warn", message: `${fmtSize(bytes.byteLength)} is over the 500 KB budget: compress or shrink inline images` });

  let html = "";
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    issues.push({ level: "error", message: "file is not valid UTF-8" });
    return { issues, bytes, html };
  }

  const markup = html.replace(/<!--[\s\S]*?-->/g, "");
  const styles = [...markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const scripts = [
    ...[...markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]),
    ...[...markup.matchAll(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi)].map((m) => m[1]),
  ].join("\n");
  const prose = markup.replace(/<(pre|code|script|style)\b[\s\S]*?<\/\1>/gi, "");

  if (!/^\s*<!doctype html>/i.test(html)) issues.push({ level: "warn", message: "missing <!doctype html> at the top" });
  if (!/<meta\b[^>]*charset\s*=\s*["']?utf-8/i.test(markup)) issues.push({ level: "warn", message: 'missing <meta charset="utf-8">' });
  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(markup)) issues.push({ level: "warn", message: "missing viewport meta: the page won't scale on phones" });
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(markup)?.[1]?.trim();
  if (!title) issues.push({ level: "error", message: "missing or empty <title>: it names the page in `list` and in link previews" });

  const placeholder = /\[\[[^\]\n]{1,80}\]\]/.exec(prose);
  if (placeholder) issues.push({ level: "error", message: `unfilled template placeholder ${placeholder[0]} (line ${lineOf(html, html.indexOf(placeholder[0]))})` });
  if (/<!--\s*PLACEHOLDER:/.test(html)) issues.push({ level: "error", message: "leftover PLACEHOLDER: comments from the template: delete them" });

  for (const rule of MARKUP_RULES) if (rule.re.test(markup)) issues.push({ level: rule.level, message: rule.message });
  for (const rule of STYLE_RULES) if (rule.re.test(styles)) issues.push({ level: rule.level, message: rule.message });
  for (const rule of SCRIPT_RULES) if (rule.re.test(scripts)) issues.push({ level: rule.level, message: rule.message });

  for (const m of html.matchAll(/data:[a-z]+\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*,[^"')\s]*/gi)) {
    if (m[0].length > WARN_DATA_URI_BYTES) {
      issues.push({ level: "warn", message: `inline data: URI of ${fmtSize(m[0].length)} (line ${lineOf(html, m.index!)}) is over the 150 KB image budget` });
    }
  }

  for (const rule of SECRET_RULES) {
    const m = rule.re.exec(html);
    if (m) issues.push({ level: "error", secret: true, message: `looks like a ${rule.what} (line ${lineOf(html, m.index)}): never publish secrets` });
  }
  return { issues, bytes, html };
}

function report(path: string, bytes: Uint8Array, issues: Issue[]): { pageErrors: number; secrets: number } {
  for (const i of issues) console.error(`${i.level === "error" ? "error" : "warn "}  ${i.message}`);
  const pageErrors = issues.filter((i) => i.level === "error" && !i.secret).length;
  const secrets = issues.filter((i) => i.secret).length;
  if (pageErrors + secrets === 0) console.error(`ok     ${path} (${fmtSize(bytes.byteLength)})`);
  return { pageErrors, secrets };
}

// ---------- API ----------

function endpoint(): string {
  const raw = process.env.MANIFEST_URL?.trim() || (existsSync(URL_FILE) ? readFileSync(URL_FILE, "utf8").trim() : "");
  if (!raw) die(`no endpoint. Set MANIFEST_URL, or store it with: printf %s "$TOKEN" | bun ${process.argv[1]} login https://<your-worker>`);
  return raw.replace(/\/+$/, "");
}

function token(): string {
  const env = process.env.MANIFEST_TOKEN?.trim();
  if (env) return env;
  if (existsSync(TOKEN_FILE)) {
    const mode = statSync(TOKEN_FILE).mode & 0o077;
    if (mode) die(`${TOKEN_FILE} is readable by other users; run: chmod 600 ${TOKEN_FILE}`);
    const t = readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) return t;
  }
  if (platform() === "darwin") {
    const r = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  die(`no publish token. Set MANIFEST_TOKEN, or store it with: printf %s "$TOKEN" | bun ${process.argv[1]} login https://<your-worker>`);
}

async function call(method: string, path: string, init: { body?: Uint8Array; query?: Record<string, string>; allow404?: boolean } = {}): Promise<Response> {
  const url = new URL(endpoint() + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(init.body ? { "Content-Type": "text/html; charset=utf-8" } : {}),
      },
      body: init.body,
    });
  } catch (e) {
    die(`could not reach ${endpoint()} (${(e as Error).message}). In a sandboxed agent session, rerun this command with network access.`);
  }
  if (res.status === 404 && init.allow404) return res;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let msg = detail;
    try {
      msg = JSON.parse(detail).error ?? detail;
    } catch {}
    die(`${method} ${url.pathname} failed: HTTP ${res.status} ${msg}`.trim());
  }
  return res;
}

// ---------- commands ----------

async function publish(path: string, opts: { ttl?: string; update?: string; force: boolean; allowSecret: boolean }) {
  const { issues, bytes, html } = check(path);
  const { pageErrors, secrets } = report(path, bytes, issues);
  if (html.includes(token())) die("the page contains the publish token itself; remove it (no flag overrides this)");
  if (secrets && !opts.allowSecret) {
    die("the page looks like it contains a secret; remove it. Pass --allow-secret only if the user confirmed the match is a false positive");
  }
  if (pageErrors && !opts.force) die("fix the errors above, or pass --force if you're sure");

  const query: Record<string, string> = {};
  if (opts.ttl !== undefined) query.ttl = String(parseTtl(opts.ttl));

  const res = opts.update
    ? await call("PUT", `/api/pages/${slugOf(opts.update)}`, { body: bytes, query })
    : await call("POST", "/api/pages", { body: bytes, query });
  const page = (await res.json()) as { url: string; title: string; size: number; expires: string | null };

  console.error(`${opts.update ? "updated" : "published"}  "${page.title}"  ${fmtSize(page.size)}  ${page.expires ? `expires ${page.expires.slice(0, 10)}` : "no expiry"}`);
  console.log(page.url);
}

async function list(asJson: boolean) {
  type Page = { slug: string; url: string; title: string; size: number | null; updated: string | null; expires: string | null };
  const pages: Page[] = [];
  let cursor: string | null = null;
  do {
    const res = await call("GET", "/api/pages", { query: cursor ? { cursor } : {} });
    const body = (await res.json()) as { pages: Page[]; cursor: string | null };
    pages.push(...body.pages);
    cursor = body.cursor;
  } while (cursor);
  pages.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));

  if (asJson) return console.log(JSON.stringify(pages, null, 2));
  if (pages.length === 0) return console.error("no manifests yet");
  for (const p of pages) {
    const cols = [(p.updated ?? "").slice(0, 10), p.expires ? `exp ${p.expires.slice(0, 10)}` : "          ", fmtSize(p.size ?? 0).padStart(8), p.title || "(untitled)"];
    console.log(`${cols.join("  ")}\n    ${p.url}`);
  }
}

async function get(ref: string, out?: string) {
  const res = await call("GET", `/api/pages/${slugOf(ref)}`, { allow404: true });
  if (res.status === 404) die(`no manifest with slug ${slugOf(ref)}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (out) {
    writeFileSync(out, bytes);
    console.error(`wrote ${out} (${fmtSize(bytes.byteLength)})`);
  } else process.stdout.write(bytes);
}

async function remove(ref: string) {
  const slug = slugOf(ref);
  const res = await call("DELETE", `/api/pages/${slug}`, { allow404: true });
  if (res.status === 404) die(`no manifest with slug ${slug}`);
  console.error(`deleted  ${endpoint()}/${slug}  (edge caches can keep serving it for up to a minute)`);
}

async function login(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    die(`not a URL: ${rawUrl}`);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") die("the endpoint must be https (or http://localhost for wrangler dev)");
  const t = (await new Response(Bun.stdin.stream()).text()).trim();
  if (!t) die("pipe the token on stdin: printf %s \"$TOKEN\" | bun manifest.ts login <url>");
  if (!/^[A-Za-z0-9._~+\/=-]+$/.test(t)) die("the token has unexpected characters; expected base64/base64url");
  if (platform() === "darwin") {
    // Feed the command to `security -i` on stdin so the token never appears in argv.
    const account = (process.env.USER ?? "manifest").replace(/[^A-Za-z0-9._-]/g, "");
    const r = spawnSync("security", ["-i"], {
      input: `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -w "${t}"\n`,
      encoding: "utf8",
    });
    if (r.status !== 0 || /error|usage/i.test(r.stderr)) die(`keychain write failed: ${r.stderr.trim()}`);
    console.error(`stored in the macOS Keychain as "${KEYCHAIN_SERVICE}"`);
  } else {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
    writeFileSync(TOKEN_FILE, t + "\n", { mode: 0o600 });
    chmodSync(TOKEN_FILE, 0o600);
    console.error(`stored in ${TOKEN_FILE}`);
  }
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(URL_FILE, url.origin + "\n");
  console.error(`endpoint ${url.origin} stored in ${URL_FILE}`);
}

async function doctor() {
  const base = endpoint();
  console.error(`endpoint  ${base}`);
  const t = token();
  console.error(`token     found (${t.length} chars)`);
  const res = await fetch(`${base}/api/health`, { headers: { Authorization: `Bearer ${t}` } }).catch((e) => die(`unreachable: ${(e as Error).message}`));
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; authorized?: boolean };
  if (!body.ok) die(`health check failed: HTTP ${res.status}`);
  if (!body.authorized) die("the server rejected the token");
  console.error("status    ok, token accepted");
}

// ---------- helpers ----------

function parseTtl(raw: string): number {
  if (raw === "none" || raw === "0") return 0;
  const m = /^(\d+)\s*([mhdw]?)$/.exec(raw.trim());
  if (!m) die(`bad --ttl "${raw}": use e.g. 12h, 7d, 30d, 90d, 2w or none`);
  const n = Number(m[1]) * ({ "": 1, m: 60, h: 3600, d: 86400, w: 604800 } as Record<string, number>)[m[2]];
  if (n < 3600) die("--ttl must be at least 1h");
  return n;
}

function slugOf(ref: string): string {
  const s = ref.trim().replace(/\/+$/, "").split("/").pop() ?? "";
  if (!SLUG_RE.test(s)) die(`not a manifest slug or URL: ${ref}`);
  return s;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function lineOf(s: string, index: number): number {
  return s.slice(0, index).split("\n").length;
}

function die(msg: string): never {
  console.error(`manifest: ${msg}`);
  process.exit(1);
}

function usage(): never {
  console.error(`usage:
  manifest check   <file.html>
  manifest publish <file.html> [--ttl 7d|30d|90d|<n>h|<n>d|none] [--update <slug-or-url>] [--force] [--allow-secret]
  manifest list    [--json]
  manifest get     <slug-or-url> [-o out.html]
  manifest delete  <slug-or-url>
  manifest login   <url> < token
  manifest doctor`);
  process.exit(2);
}

// ---------- main ----------

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Map<string, string | true>();
const args: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--force" || a === "--json" || a === "--allow-secret") flags.set(a, true);
  else if (a === "--ttl" || a === "--update" || a === "-o") {
    if (rest[i + 1] === undefined) die(`${a} needs a value`);
    flags.set(a, rest[++i]);
  } else if (a.startsWith("-")) die(`unknown flag ${a}`);
  else args.push(a);
}

switch (cmd) {
  case "check": {
    if (!args[0]) usage();
    const { issues, bytes } = check(args[0]);
    const { pageErrors, secrets } = report(args[0], bytes, issues);
    process.exit(pageErrors + secrets === 0 ? 0 : 1);
  }
  case "publish":
    if (!args[0]) usage();
    await publish(args[0], {
      ttl: flags.get("--ttl") as string | undefined,
      update: flags.get("--update") as string | undefined,
      force: flags.has("--force"),
      allowSecret: flags.has("--allow-secret"),
    });
    break;
  case "list":
    await list(flags.has("--json"));
    break;
  case "get":
    if (!args[0]) usage();
    await get(args[0], flags.get("-o") as string | undefined);
    break;
  case "delete":
    if (!args[0]) usage();
    await remove(args[0]);
    break;
  case "login":
    if (!args[0]) usage();
    await login(args[0]);
    break;
  case "doctor":
    await doctor();
    break;
  default:
    usage();
}
