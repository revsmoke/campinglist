// judge.js — turns a typed answer into one of a question's options.
//
// Order of business, as the TypeSafe guidance puts it: code owns the workflow, the model
// supplies judgment only where plain rules run out.
//   1. localChoice: keyword matching, deterministic and offline (rules.js).
//   2. remote: TypeSafe's Jev (System One) through this site's own endpoint
//      (CONFIG.wizard.judgeUrl; the API key stays on the server, see server/index.mjs). The
//      endpoint is probed once per page (GET …/health) and skipped when absent or keyless.
//   3. ask: below the thresholds the wizard shows the candidates and the person picks.
// Thresholds follow docs.typesafe.ai/confidence: high = act, medium = act but show the reading
// and offer the alternatives, low = ask.
import { CONFIG } from "../config.js";
import { EXTRAS, CHOICES } from "./questions.js";
import { localChoice, localExtras } from "./rules.js";

export const THRESHOLDS = { accept: 0.6, suggest: 0.3, noulYes: 0.6 };

/** The TypeSafe question for one of the wizard's Choices. */
export function choiceQuestion(choiceId) {
  const q = CHOICES[choiceId];
  const criteria = {};
  for (const o of q.options) criteria[o.id] = o.criteria || null;
  return { type: "choice", instructions: q.instructions, criteria };
}

/** One Noul per extra, asked together over the same typed answer (speculative fan-out). */
export function extrasQuestions(extras = EXTRAS) {
  const questions = {};
  for (const e of extras) {
    questions[`extra_${e.id}`] = {
      type: "noul",
      instructions: `Does the person's plan include: ${e.criteria}?`,
      criteria: {
        true: `They mention or clearly imply ${e.criteria.toLowerCase()}`,
        false: "Not mentioned or ruled out",
      },
    };
  }
  return questions;
}

let availability = null;

/**
 * Whether the site's judge endpoint is deployed with its key: one GET of its /health per page
 * (cached), so an absent endpoint costs a single request and never a wait.
 */
export function judgeAvailable({ fetchImpl = globalThis.fetch, force = false } = {}) {
  const url = CONFIG.wizard?.judgeUrl;
  if (!url || typeof fetchImpl !== "function") return Promise.resolve(false);
  if (availability && !force) return availability;
  availability = (async () => {
    try {
      const response = await fetchImpl(url.replace(/\/judge\/?$/, "/health"), {
        cache: "no-store",
      });
      if (!response.ok) return false;
      const body = await response.json();
      return Boolean(body && body.judge);
    } catch {
      return false;
    }
  })();
  return availability;
}

/** Forgets the cached probe (tests). */
export function resetJudgeAvailability() {
  availability = null;
}

/**
 * Calls the site's judge endpoint. Resolves to the TypeSafe answers map, or null when the
 * endpoint is not configured, absent, unreachable, slow or returns an error: the wizard then
 * asks the person.
 */
export async function remoteJudge(
  state,
  questions,
  { fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {}
) {
  const url = CONFIG.wizard?.judgeUrl;
  if (!url || typeof fetchImpl !== "function") return null;
  if (!(await judgeAvailable({ fetchImpl }))) return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, questions }),
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body && typeof body.answers === "object" ? body.answers : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Ranks the options of a Choice answer, best first. */
export function rankedOptions(answer, options) {
  return [...options]
    .map((o) => ({ ...o, p: answer?.probabilities?.[o.id] ?? 0 }))
    .sort((a, b) => b.p - a.p);
}

/**
 * Resolves typed text into one option of `choiceId`.
 * Returns { status: "accepted" | "suggested" | "unresolved", choice, confidence, source,
 *           candidates } where candidates are the options, best first.
 */
export async function judgeChoice(choiceId, text, context = {}, deps = {}) {
  const options = CHOICES[choiceId].options;
  const local = localChoice(text, options);
  const decide = (answer, source) => {
    const candidates = rankedOptions(answer, options);
    // "Not sure yet" as a verdict means the text did not say: ask, with every option.
    const choice = answer.choice === "unsure" ? null : answer.choice;
    if (choice && answer.confidence >= THRESHOLDS.accept)
      return {
        status: "accepted",
        choice,
        confidence: answer.confidence,
        source,
        candidates,
      };
    if (choice && answer.confidence >= THRESHOLDS.suggest)
      return {
        status: "suggested",
        choice,
        confidence: answer.confidence,
        source,
        candidates,
      };
    return {
      status: "unresolved",
      choice: null,
      confidence: answer.confidence,
      source,
      candidates,
    };
  };
  const localResult = decide(local, "local");
  if (localResult.status === "accepted") return localResult;
  const answers = await remoteJudge(
    { answer: text, context },
    { [choiceId]: choiceQuestion(choiceId) },
    deps
  );
  const remote = answers?.[choiceId];
  if (remote && remote.type === "choice" && typeof remote.confidence === "number") {
    const remoteResult = decide(remote, "typesafe");
    if (remoteResult.status !== "unresolved" || localResult.status === "unresolved")
      return remoteResult;
  }
  return localResult;
}

/**
 * Which extras a typed answer mentions. Local keywords first; the remote Nouls refine the
 * ones the keywords did not catch. Returns { picked: [ids], source }.
 */
export async function judgeExtras(text, context = {}, deps = {}) {
  const local = localExtras(text);
  const picked = new Set(
    EXTRAS.filter((e) => local[e.id] >= THRESHOLDS.noulYes).map((e) => e.id)
  );
  let source = "local";
  const answers = await remoteJudge({ answer: text, context }, extrasQuestions(), deps);
  if (answers) {
    source = "typesafe";
    for (const e of EXTRAS) {
      const a = answers[`extra_${e.id}`];
      if (
        a &&
        a.type === "noul" &&
        typeof a.noul === "number" &&
        a.noul >= THRESHOLDS.noulYes
      )
        picked.add(e.id);
    }
  }
  return { picked: [...picked], source };
}
