import { describe, it, expect } from "vitest";
import { judge, validateJudgeRequest } from "../../server/index.mjs";

const good = {
  state: { answer: "truck with a rooftop tent" },
  questions: {
    tripType: {
      type: "choice",
      instructions: "Which kind of trip?",
      criteria: { overlanding: null, campground: null },
    },
    extra_bear: { type: "noul", instructions: "Bear country?" },
  },
};

describe("judge request validation", () => {
  it("accepts the wizard's shape and rejects everything else", () => {
    expect(validateJudgeRequest(good)).toBe("");
    expect(validateJudgeRequest(null)).toMatch(/object/);
    expect(validateJudgeRequest({ state: "", questions: good.questions })).toMatch(
      /state/
    );
    expect(
      validateJudgeRequest({ state: "x".repeat(3000), questions: good.questions })
    ).toMatch(/state/);
    expect(validateJudgeRequest({ state: "x", questions: {} })).toMatch(/questions/);
    expect(
      validateJudgeRequest({
        state: "x",
        questions: { "bad id!": good.questions.tripType },
      })
    ).toMatch(/id/);
    expect(
      validateJudgeRequest({
        state: "x",
        questions: { q: { type: "essay", instructions: "write" } },
      })
    ).toMatch(/type/);
    expect(
      validateJudgeRequest({
        state: "x",
        questions: {
          q: { type: "choice", instructions: "pick", criteria: { one: null } },
        },
      })
    ).toMatch(/options/);
    expect(
      validateJudgeRequest({
        state: "x",
        questions: { q: { type: "score", instructions: "rate", criteria: ["a"] } },
      })
    ).toMatch(/levels/);
    const many = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`q${i}`, good.questions.extra_bear])
    );
    expect(validateJudgeRequest({ state: "x", questions: many })).toMatch(/questions/);
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
    expect(seen[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(seen[0].init.headers.Authorization).toBe("Bearer test-key");
    const sent = JSON.parse(seen[0].init.body);
    expect(sent.model).toBe("jev-latest");
    expect(sent.questions.tripType.type).toBe("choice");
    expect(sent.state.answer).toBe("truck with a rooftop tent");
  });

  it("rejects bad requests before calling upstream and maps upstream failures", async () => {
    const r = await judge(
      { state: "x", questions: {} },
      {
        apiKey: "k",
        fetchImpl: async () => {
          throw new Error("no");
        },
      }
    );
    expect(r.status).toBe(400);
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
  });
});
