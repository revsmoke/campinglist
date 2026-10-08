// server/index.mjs — CampList's server: the static site plus the trip wizard's judge.
//
// Production (Replit Autoscale, see .replit) runs `node server/index.mjs`. It serves public/
// and answers POST /api/judge, which forwards the wizard's questions about a typed answer to
// TypeSafe's Jev (System One) with the TYPESAFE_API_KEY secret from the environment. The key
// never reaches the browser (docs.typesafe.ai: "Keep API credentials server-side in web
// apps"). The endpoint forwards only the wizard's own questions, rate-limits per visitor and
// caps the calls per hour, so it cannot serve as a general proxy for the key.
//
//   TYPESAFE_API_KEY=… node server/index.mjs    http://localhost:3000, judge on
//   node server/index.mjs                        judge off: /api/judge answers 503, the wizard asks
//   PORT (default 3000), TYPESAFE_MODEL (default jev-latest), SERVE_STATIC=0 (API only),
//   TRUSTED_PROXIES (default 4: the X-Forwarded-For entries Replit's proxies and Google's
//   front ends append, as observed live; GET /api/health shows the count as "hops"),
//   ALLOW_ORIGIN (CORS, only for an API-only host that serves another origin)
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { CHOICES } from "../public/js/wizard/questions.js";
import { choiceQuestion, extrasQuestions } from "../public/js/wizard/judge.js";

const here = import.meta.url.startsWith("file:")
  ? fileURLToPath(import.meta.url)
  : resolve("server/index.mjs");
const root = resolve(here, "..", "..", "public");
const PORT = Number(process.env.PORT || 3000);
const TYPESAFE_URL = process.env.TYPESAFE_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
const SERVE_STATIC = process.env.SERVE_STATIC !== "0";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "";
const TRUSTED_PROXIES = Math.max(1, Number(process.env.TRUSTED_PROXIES) || 4);

export const LIMITS = {
  bodyBytes: 16_384,
  answerChars: 1_000,
  contextChars: 200,
  contextKeys: 8,
  perMinute: 30, // judge calls per visitor
  perHour: 1_200, // judge calls per server instance: bounds the TypeSafe bill
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".webmanifest",
]);
const LONG_CACHE = new Set([".png", ".jpg", ".jpeg", ".ico", ".webp", ".woff2"]);

// The same headers the static deployment sent (CSP stays a <meta> tag in each page).
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()",
};

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}a{color:#2f855a}</style></head><body><h1>Not found</h1><p>That page does not exist. <a href="/">Open CampList</a> or see the <a href="/guide/">guide</a>.</p></body></html>`;

// ---------------------------------------------------------------- the judge
// The only questions the endpoint forwards: the wizard's own, rebuilt here from the same data
// the browser uses (public/js/wizard/). Anything else is a 400.
const ALLOWED_QUESTIONS = extrasQuestions();
for (const id of Object.keys(CHOICES)) ALLOWED_QUESTIONS[id] = choiceQuestion(id);

const isPlainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function sameJson(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

/** Accepts only what the wizard sends: a typed answer with a little context, and its own questions. */
export function validateJudgeRequest(body) {
  if (!isPlainObject(body)) return "body must be a JSON object";
  const { state, questions } = body;
  if (!isPlainObject(state)) return "state must be an object";
  for (const key of Object.keys(state))
    if (key !== "answer" && key !== "context") return `state.${key} is not allowed`;
  if (
    typeof state.answer !== "string" ||
    !state.answer.trim() ||
    state.answer.length > LIMITS.answerChars
  )
    return `state.answer must be 1 to ${LIMITS.answerChars} characters`;
  const context = state.context ?? {};
  if (!isPlainObject(context)) return "state.context must be an object";
  const contextKeys = Object.keys(context);
  if (contextKeys.length > LIMITS.contextKeys)
    return `at most ${LIMITS.contextKeys} context values`;
  for (const key of contextKeys) {
    if (!/^[a-zA-Z]{1,30}$/.test(key)) return `context key "${key}" is not allowed`;
    const value = context[key];
    if (
      value !== null &&
      (typeof value !== "string" || value.length > LIMITS.contextChars)
    )
      return `context.${key} must be a string of up to ${LIMITS.contextChars} characters`;
  }
  if (!isPlainObject(questions)) return "questions must be an object";
  const ids = Object.keys(questions);
  if (ids.length === 0) return "at least one question";
  for (const id of ids) {
    const allowed = ALLOWED_QUESTIONS[id];
    if (!allowed) return `question "${id}" is not one of the wizard's`;
    if (!sameJson(questions[id], allowed))
      return `question "${id}" differs from the wizard's`;
  }
  return "";
}

const visitors = new Map(); // address -> times of recent judge calls
let hour = { start: Date.now(), calls: 0 };

/** Forgets the rate-limit state (tests). */
export function resetLimits() {
  visitors.clear();
  hour = { start: Date.now(), calls: 0 };
}

function overVisitorLimit(address) {
  const now = Date.now();
  const recent = (visitors.get(address) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  visitors.set(address, recent);
  if (visitors.size > 5_000) visitors.clear();
  return recent.length > LIMITS.perMinute;
}

function overHourlyCap() {
  const now = Date.now();
  if (now - hour.start >= 3_600_000) hour = { start: now, calls: 0 };
  hour.calls += 1;
  if (hour.calls === LIMITS.perHour + 1)
    console.warn(
      `judge: hourly cap of ${LIMITS.perHour} calls reached; answering 503 until it resets`
    );
  return hour.calls > LIMITS.perHour;
}

/** The X-Forwarded-For chain: what the client sent first, then one entry per proxy. */
function forwardedHops(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (!forwarded) return [];
  return String(forwarded)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The visitor's address behind the hosting proxies: counted from the end of X-Forwarded-For,
 * because each proxy appends the address it saw and anything before that is client-supplied.
 */
export function clientIp(req) {
  const hops = forwardedHops(req);
  if (hops.length) return hops[Math.max(0, hops.length - TRUSTED_PROXIES)];
  return req.socket?.remoteAddress || "?";
}

/** Forwards a validated request to TypeSafe and returns { status, body }. */
export async function judge(
  body,
  {
    apiKey = process.env.TYPESAFE_API_KEY,
    fetchImpl = fetch,
    model = MODEL,
    overCap = overHourlyCap,
  } = {}
) {
  if (!apiKey) return { status: 503, body: { error: "judge_unconfigured" } };
  const problem = validateJudgeRequest(body);
  if (problem) return { status: 400, body: { error: "bad_request", detail: problem } };
  if (overCap()) return { status: 503, body: { error: "judge_busy" } };
  try {
    const upstream = await fetchImpl(TYPESAFE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state: body.state, model, questions: body.questions }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error(`TypeSafe ${upstream.status}: ${text.slice(0, 300)}`);
      return {
        status: upstream.status === 429 || upstream.status === 529 ? 503 : 502,
        body: { error: "judge_failed" },
      };
    }
    const data = JSON.parse(text);
    return {
      status: 200,
      body: { model: data.model, answers: data.answers, usage: data.usage },
    };
  } catch (error) {
    console.error("TypeSafe request failed:", error.message);
    return { status: 502, body: { error: "judge_failed" } };
  }
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > LIMITS.bodyBytes) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body, extra = {}) {
  const payload = status === 204 ? "" : JSON.stringify(body);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...extra,
  };
  if (status !== 204) headers["Content-Length"] = Buffer.byteLength(payload);
  if (ALLOW_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOW_ORIGIN;
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  res.writeHead(status, headers);
  res.end(payload);
}

async function handleJudge(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST")
    return send(res, 405, { error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
  if (overVisitorLimit(clientIp(req)))
    return send(res, 429, { error: "rate_limited" }, { "Retry-After": "60" });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, {
      error: "bad_request",
      detail: "invalid JSON or body too large",
    });
  }
  const result = await judge(body);
  const extra = result.body.error === "judge_busy" ? { "Retry-After": "600" } : {};
  return send(res, result.status, result.body, extra);
}

// ---------------------------------------------------------------- static files
function notFound(req, res) {
  if (/text\/html/.test(req.headers.accept || "")) {
    res.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(NOT_FOUND_HTML),
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    });
    return res.end(NOT_FOUND_HTML);
  }
  return send(res, 404, { error: "not_found" });
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET, HEAD" });
  const url = new URL(req.url, "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(req, res);
  }
  // No dotfiles, no NUL bytes, nothing outside public/.
  if (pathname.includes("\0") || pathname.split("/").some((part) => part.startsWith(".")))
    return notFound(req, res);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root + sep)) return notFound(req, res);
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return notFound(req, res);
  }
  if (stat.isDirectory()) {
    res.writeHead(301, {
      Location: encodeURI(pathname) + "/" + url.search,
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    });
    return res.end();
  }
  const ext = extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    // Pages, scripts and data revalidate on every visit (no cache busting in the URLs) and
    // come back as 304 when unchanged; pictures may be a day old. The MSAL bridge is never
    // cached, which the static deployment could not express.
    "Cache-Control":
      pathname === "/auth/redirect.html"
        ? "no-store"
        : LONG_CACHE.has(ext)
          ? "public, max-age=86400"
          : "no-cache",
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
    ...SECURITY_HEADERS,
  };
  if (COMPRESSIBLE.has(ext)) headers.Vary = "Accept-Encoding";
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const gzip =
    COMPRESSIBLE.has(ext) &&
    stat.size > 1024 &&
    /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (gzip) headers["Content-Encoding"] = "gzip";
  else headers["Content-Length"] = stat.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(file);
  stream.on("error", () => res.destroy());
  if (gzip) stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}

export function createApp() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname === "/api/judge") return await handleJudge(req, res);
      if (url.pathname === "/api/health")
        return send(res, 200, {
          ok: true,
          judge: Boolean(process.env.TYPESAFE_API_KEY),
          visitor: clientIp(req),
          hops: forwardedHops(req).length,
        });
      if (url.pathname.startsWith("/api/") || !SERVE_STATIC)
        return send(res, 404, { error: "not_found" });
      return serveStatic(req, res);
    } catch (error) {
      console.error("request failed:", error.message);
      if (res.headersSent) res.destroy();
      else send(res, 500, { error: "server_error" });
    }
  });
  // Longer than the hosting proxy's idle timeout, so it never reuses a connection we closed.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  return server;
}

if (process.argv[1] && here === resolve(process.argv[1])) {
  const server = createApp();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `CampList server on port ${PORT} (static ${SERVE_STATIC ? "on" : "off"}, judge ${process.env.TYPESAFE_API_KEY ? "on" : "off: no TYPESAFE_API_KEY"})`
    );
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }
}
