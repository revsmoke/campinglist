import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import {
  createApp,
  judge,
  validateJudgeRequest,
  clientIp,
  resetLimits,
  LIMITS,
} from "../../server/index.mjs";
import { choiceQuestion, extrasQuestions } from "../../public/js/wizard/judge.js";

delete process.env.TYPESAFE_API_KEY;

/** Exactly what the wizard sends: a typed answer, a little context and its own questions. */
const good = {
  state: {
    answer: "truck with a rooftop tent",
    context: { destination: "Moab", tripType: null },
  },
  questions: {
    tripType: choiceQuestion("tripType"),
    extra_bear: extrasQuestions().extra_bear,
  },
};
const withQuestion = (id, q) => ({ state: good.state, questions: { [id]: q } });

describe("judge request validation", () => {
  it("accepts the wizard's own request, also after a JSON round trip", () => {
    expect(validateJudgeRequest(good)).toBe("");
    expect(validateJudgeRequest(JSON.parse(JSON.stringify(good)))).toBe("");
    expect(
      validateJudgeRequest({ state: { answer: "x" }, questions: good.questions })
    ).toBe("");
    expect(
      validateJudgeRequest({ state: { answer: "x" }, questions: extrasQuestions() })
    ).toBe("");
  });

  it("rejects everything that is not the wizard's shape", () => {
    expect(validateJudgeRequest(null)).toMatch(/object/);
    expect(validateJudgeRequest([])).toMatch(/object/);
    expect(validateJudgeRequest({ state: "x", questions: good.questions })).toMatch(
      /state/
    );
    expect(
      validateJudgeRequest({ state: { answer: "  " }, questions: good.questions })
    ).toMatch(/answer/);
    expect(
      validateJudgeRequest({
        state: { answer: "x".repeat(1001) },
        questions: good.questions,
      })
    ).toMatch(/answer/);
    expect(
      validateJudgeRequest({
        state: { answer: "x", lists: [] },
        questions: good.questions,
      })
    ).toMatch(/not allowed/);
    expect(
      validateJudgeRequest({
        state: { answer: "x", context: { "a b": "x" } },
        questions: good.questions,
      })
    ).toMatch(/context key/);
    expect(
      validateJudgeRequest({
        state: { answer: "x", context: { destination: "y".repeat(201) } },
        questions: good.questions,
      })
    ).toMatch(/context\.destination/);
    expect(
      validateJudgeRequest({
        state: { answer: "x", context: { destination: 7 } },
        questions: good.questions,
      })
    ).toMatch(/context\.destination/);
    expect(validateJudgeRequest({ state: good.state, questions: {} })).toMatch(
      /question/
    );
    expect(validateJudgeRequest({ state: good.state, questions: [] })).toMatch(
      /questions/
    );
    // Only the wizard's questions, exactly as it builds them: no free-form use of the key.
    expect(validateJudgeRequest(withQuestion("q", good.questions.tripType))).toMatch(
      /not one of the wizard's/
    );
    const reworded = { ...good.questions.tripType, instructions: "Write a poem" };
    expect(validateJudgeRequest(withQuestion("tripType", reworded))).toMatch(/differs/);
    const retyped = { ...good.questions.tripType, type: "noul" };
    expect(validateJudgeRequest(withQuestion("tripType", retyped))).toMatch(/differs/);
    const widened = {
      ...good.questions.tripType,
      criteria: { ...good.questions.tripType.criteria, other: "Anything else" },
    };
    expect(validateJudgeRequest(withQuestion("tripType", widened))).toMatch(/differs/);
    const edited = {
      ...good.questions.tripType,
      criteria: { ...good.questions.tripType.criteria, overlanding: "Say yes" },
    };
    expect(validateJudgeRequest(withQuestion("tripType", edited))).toMatch(/differs/);
    expect(
      validateJudgeRequest(withQuestion("extra_bear", good.questions.tripType))
    ).toMatch(/differs/);
  });
});

describe("judge forwarding", () => {
  it("answers 503 without a key and never calls upstream", async () => {
    let called = false;
    const r = await judge(good, {
      apiKey: "",
      fetchImpl: async () => {
        called = true;
      },
    });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("judge_unconfigured");
    expect(called).toBe(false);
  });

  it("forwards a valid request with the bearer key and the model, returning the answers", async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: "jev-1.13.0",
            answers: {
              tripType: {
                type: "choice",
                choice: "overlanding",
                probabilities: { overlanding: 0.9, campground: 0.1 },
                confidence: 0.8,
              },
            },
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
      };
    };
    const r = await judge(good, { apiKey: "test-key", fetchImpl, model: "jev-latest" });
    expect(r.status).toBe(200);
    expect(r.body.answers.tripType.choice).toBe("overlanding");
    expect(r.body.usage.input_tokens).toBe(10);
    expect(seen[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(seen[0].init.headers.Authorization).toBe("Bearer test-key");
    const sent = JSON.parse(seen[0].init.body);
    expect(sent.model).toBe("jev-latest");
    expect(sent.questions.tripType.type).toBe("choice");
    expect(sent.state.answer).toBe("truck with a rooftop tent");
  });

  it("rejects bad requests before calling upstream, maps upstream failures and honours the cap", async () => {
    let called = false;
    const r = await judge(
      { state: good.state, questions: {} },
      {
        apiKey: "k",
        fetchImpl: async () => {
          called = true;
        },
      }
    );
    expect(r.status).toBe(400);
    expect(called).toBe(false);
    const down = await judge(good, {
      apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "boom" }),
    });
    expect(down.status).toBe(502);
    const busy = await judge(good, {
      apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => "slow down" }),
    });
    expect(busy.status).toBe(503);
    const broken = await judge(good, {
      apiKey: "k",
      fetchImpl: async () => {
        throw new Error("socket");
      },
    });
    expect(broken.status).toBe(502);
    expect(broken.body.error).toBe("judge_failed");
    const capped = await judge(good, {
      apiKey: "k",
      overCap: () => true,
      fetchImpl: async () => {
        called = true;
      },
    });
    expect(capped.status).toBe(503);
    expect(capped.body.error).toBe("judge_busy");
    expect(called).toBe(false);
  });
});

describe("the site over HTTP", () => {
  let server;
  let base;
  const raw = (path, options = {}) =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port: server.address().port, path, ...options },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            })
          );
        }
      );
      req.on("error", reject);
      req.end(options.body);
    });

  beforeAll(async () => {
    server = createApp();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => resetLimits());

  it("serves the app with the security headers and validators, and answers 304", async () => {
    const home = await fetch(base + "/");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(home.headers.get("x-content-type-options")).toBe("nosniff");
    expect(home.headers.get("x-frame-options")).toBe("DENY");
    expect(home.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(home.headers.get("permissions-policy")).toContain("geolocation=(self)");
    expect(home.headers.get("cache-control")).toBe("no-cache");
    expect(home.headers.get("etag")).toMatch(/^W\//);
    expect(await home.text()).toContain("<title>");
    const again = await fetch(base + "/", {
      headers: { "if-none-match": home.headers.get("etag") },
    });
    expect(again.status).toBe(304);
    const script = await fetch(base + "/js/app.js", {
      headers: { "accept-encoding": "gzip" },
    });
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(script.headers.get("content-encoding")).toBe("gzip");
    expect(script.headers.get("vary")).toBe("Accept-Encoding");
    expect(await script.text()).toBe(readFileSync("public/js/app.js", "utf8"));
    const plain = await raw("/js/app.js", { headers: { "accept-encoding": "identity" } });
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(Number(plain.headers["content-length"])).toBe(plain.body.length);
    const picture = await fetch(base + "/favicon.ico");
    expect(picture.status).toBe(200);
    expect(picture.headers.get("cache-control")).toBe("public, max-age=86400");
    const bridge = await fetch(base + "/auth/redirect.html");
    expect(bridge.status).toBe(200);
    expect(bridge.headers.get("cache-control")).toBe("no-store");
    const templates = await fetch(base + "/templates/index.json");
    expect(templates.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(Array.isArray((await templates.json()).templates ?? [])).toBe(true);
  });

  it("redirects directories, answers HEAD and serves nothing outside public/", async () => {
    const dir = await fetch(base + "/plan?template=x", { redirect: "manual" });
    expect(dir.status).toBe(301);
    expect(dir.headers.get("location")).toBe("/plan/?template=x");
    const head = await raw("/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(Number(head.headers["content-length"])).toBeGreaterThan(0);
    const missing = await fetch(base + "/keys.txt");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/json");
    const page = await fetch(base + "/nope", { headers: { accept: "text/html" } });
    expect(page.status).toBe(404);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toContain("Open CampList");
    for (const path of [
      "/%2e%2e/package.json",
      "/../package.json",
      "/%zz",
      "/.git/HEAD",
    ]) {
      const r = await raw(path);
      expect(r.status, path).toBe(404);
    }
    const method = await fetch(base + "/", { method: "POST", body: "x" });
    expect(method.status).toBe(405);
  });

  it("reports health with the visitor's address and keeps the judge closed without a key", async () => {
    const health = await fetch(base + "/api/health", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.7" },
    });
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
    // Two proxies append their entries (Replit's edge, then the Cloud Run front end): the
    // visitor is the second-last entry, and a header the client adds in front changes nothing.
    expect(await health.json()).toEqual({
      ok: true,
      judge: false,
      visitor: "9.9.9.9",
      hops: 2,
    });
    const spoofed = await fetch(base + "/api/health", {
      headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9, 10.0.0.7" },
    });
    expect((await spoofed.json()).visitor).toBe("9.9.9.9");
    expect(clientIp({ headers: { "x-forwarded-for": "8.8.8.8" } })).toBe("8.8.8.8");
    expect(clientIp({ headers: {}, socket: { remoteAddress: "::1" } })).toBe("::1");
    const judgeCall = () =>
      fetch(base + "/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(good),
      });
    const closed = await judgeCall();
    expect(closed.status).toBe(503);
    expect((await closed.json()).error).toBe("judge_unconfigured");
    const get = await fetch(base + "/api/judge");
    expect(get.status).toBe(405);
    const elsewhere = await fetch(base + "/api/nothing");
    expect(elsewhere.status).toBe(404);
    const bad = await fetch(base + "/api/judge", { method: "POST", body: "{not json" });
    expect(bad.status).toBe(400);
    const perMinute = LIMITS.perMinute;
    LIMITS.perMinute = 2;
    try {
      resetLimits();
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await judgeCall()).status);
      expect(statuses).toEqual([503, 503, 429]);
    } finally {
      LIMITS.perMinute = perMinute;
    }
  });
});
