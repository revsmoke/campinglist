// server/index.mjs — optional Node server for CampList.
//
// The site is static and needs no server. This one exists for the trip wizard's judge:
// TypeSafe's Jev (System One) answers typed questions about free-text answers, and its API key
// must stay off the browser (docs.typesafe.ai: "Keep API credentials server-side in web apps").
//
//   TYPESAFE_API_KEY=… node server/index.mjs          serves public/ and POST /api/judge
//   PORT (default 3000), TYPESAFE_MODEL (default jev-latest), SERVE_STATIC=0 (API only),
//   ALLOW_ORIGIN (CORS for an API-only deployment, e.g. https://camplist.guide)
//
// Then set wizard.judgeUrl in public/js/config.js ("/api/judge", or the API host's URL).
// Without a key the endpoint answers 503 and the wizard keeps asking the person instead.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = import.meta.url.startsWith("file:")
  ? fileURLToPath(import.meta.url)
  : resolve("server/index.mjs");
const root = resolve(here, "..", "..", "public");
const PORT = Number(process.env.PORT || 3000);
const TYPESAFE_URL = process.env.TYPESAFE_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
const SERVE_STATIC = process.env.SERVE_STATIC !== "0";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "";
const LIMITS = {
  bodyBytes: 16_384,
  stateChars: 2_000,
  questions: 24,
  options: 40,
  perMinute: 30,
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()",
};

// ---------------------------------------------------------------- the judge
/** Keeps only the request shape the wizard sends: a small state and typed questions. */
export function validateJudgeRequest(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  const state = body.state;
  const stateText = typeof state === "string" ? state : JSON.stringify(state ?? "");
  if (!stateText || stateText.length > LIMITS.stateChars)
    return `state must be 1 to ${LIMITS.stateChars} characters`;
  const questions = body.questions;
  if (!questions || typeof questions !== "object" || Array.isArray(questions))
    return "questions must be an object";
  const entries = Object.entries(questions);
  if (entries.length === 0 || entries.length > LIMITS.questions)
    return `1 to ${LIMITS.questions} questions`;
  for (const [id, q] of entries) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(id)) return `question id "${id}" is not allowed`;
    if (!q || typeof q !== "object") return `question ${id} must be an object`;
    if (!["choice", "noul", "score"].includes(q.type))
      return `question ${id} has an unknown type`;
    if (
      typeof q.instructions !== "string" ||
      !q.instructions ||
      q.instructions.length > 500
    )
      return `question ${id} needs instructions (max 500 chars)`;
    if (q.type === "choice") {
      if (!q.criteria || typeof q.criteria !== "object")
        return `question ${id} needs criteria`;
      const n = Object.keys(q.criteria).length;
      if (n < 2 || n > LIMITS.options)
        return `question ${id} needs 2 to ${LIMITS.options} options`;
    }
    if (
      q.type === "score" &&
      (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10)
    )
      return `question ${id} needs 2 to 10 levels`;
  }
  return "";
}

const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const bucket = buckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < 60_000);
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) buckets.clear();
  return recent.length > LIMITS.perMinute;
}

/** Forwards a validated request to TypeSafe and returns { status, body }. */
export async function judge(
  body,
  { apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch, model = MODEL } = {}
) {
  if (!apiKey) return { status: 503, body: { error: "judge_unconfigured" } };
  const problem = validateJudgeRequest(body);
  if (problem) return { status: 400, body: { error: "bad_request", detail: problem } };
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
  return new Promise((resolve, reject) => {
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
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body, extra = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...extra,
  };
  if (ALLOW_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOW_ORIGIN;
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function handleJudge(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "?";
  if (rateLimited(ip)) return send(res, 429, { error: "rate_limited" });
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
  return send(res, result.status, result.body);
}

// ---------------------------------------------------------------- static files
function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root + sep) && file !== root)
    return send(res, 404, { error: "not_found" });
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return send(res, 404, { error: "not_found" });
  }
  if (stat.isDirectory()) {
    res.writeHead(301, { Location: pathname + "/" });
    return res.end();
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
    ...SECURITY_HEADERS,
  });
  createReadStream(file).pipe(res);
}

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/judge") return handleJudge(req, res);
    if (url.pathname === "/api/health")
      return send(res, 200, { ok: true, judge: Boolean(process.env.TYPESAFE_API_KEY) });
    if (!SERVE_STATIC) return send(res, 404, { error: "not_found" });
    return serveStatic(req, res);
  });
}

if (process.argv[1] && here === resolve(process.argv[1])) {
  createApp().listen(PORT, () => {
    console.log(
      `CampList server on http://localhost:${PORT} (judge ${process.env.TYPESAFE_API_KEY ? "on" : "off: no TYPESAFE_API_KEY"})`
    );
  });
}
