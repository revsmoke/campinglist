// Runs sample typed answers through the trip wizard's judges and prints how each was read.
//
//   node scripts/wizard-eval.mjs                       keywords only (deterministic, offline)
//   TYPESAFE_API_KEY=… node scripts/wizard-eval.mjs    also asks TypeSafe's Jev directly
//
// Use it to tune keywords in public/js/wizard/questions.js and the thresholds in judge.js,
// and to check the model on the kind of answers people actually type (docs/WIZARD.md).
import { CHOICES, EXTRAS } from "../public/js/wizard/questions.js";
import { localChoice, localExtras, resolvePlace } from "../public/js/wizard/rules.js";
import {
  choiceQuestion,
  extrasQuestions,
  THRESHOLDS,
} from "../public/js/wizard/judge.js";

const SAMPLES = {
  tripType: [
    "taking the truck and sleeping in the rooftop tent, off grid for a few days",
    "canoe trip, portaging between lakes",
    "a weekend at a state park with the kids and the dog",
    "we'll be self-sufficient on the dirt roads for a few days",
    "carrying everything on our backs for a week on the JMT",
    "four days at a music festival",
    "renting a yurt by the lake",
    "the usual",
  ],
  shelter: [
    "rooftop tent on the truck",
    "hanging between two trees",
    "sleeping under the stars",
    "in the cabin",
  ],
  cooking: ["cooking on the fire", "jetboil and freeze-dried", "we'll eat in town"],
  water: [
    "filtering from the creek",
    "there's a spigot at the site",
    "bringing jugs, it's a dry camp",
  ],
  place: [
    "half dome in july",
    "somewhere on the coast near Big Sur",
    "the BWCA out of Ely",
    "my cousin's farm",
    "glasto",
  ],
  extras: [
    "we want to fish and maybe climb; there are bears and no signal",
    "first time camping, hoping to see the milky way",
  ],
};

const key = process.env.TYPESAFE_API_KEY || "";
const url = process.env.TYPESAFE_URL || "https://api.typesafe.ai/v1/systemone";

async function askJev(state, questions) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      state,
      model: process.env.TYPESAFE_MODEL || "jev-latest",
      questions,
    }),
  });
  if (!r.ok) throw new Error(`TypeSafe ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).answers;
}

const verdict = (c) =>
  c >= THRESHOLDS.accept ? "accept" : c >= THRESHOLDS.suggest ? "suggest" : "ask";

for (const choiceId of ["tripType", "shelter", "cooking", "water"]) {
  console.log(`\n== ${choiceId} ==`);
  for (const text of SAMPLES[choiceId]) {
    const local = localChoice(text, CHOICES[choiceId].options);
    let line = `"${text}"\n   keywords: ${local.choice ?? "-"} (${local.confidence}) → ${verdict(local.confidence)}`;
    if (key) {
      const answers = await askJev({ answer: text }, { q: choiceQuestion(choiceId) });
      const a = answers.q;
      line += `\n   jev:      ${a.choice} (${a.confidence.toFixed(2)}) → ${verdict(a.confidence)}`;
    }
    console.log(line);
  }
}

console.log("\n== place ==");
for (const text of SAMPLES.place) {
  const r = resolvePlace(text);
  console.log(`"${text}"\n   ${r.placeId ?? "-"} (${r.confidence})`);
}

console.log("\n== extras ==");
for (const text of SAMPLES.extras) {
  const local = localExtras(text);
  const picked = EXTRAS.filter((e) => local[e.id] >= THRESHOLDS.noulYes).map((e) => e.id);
  let line = `"${text}"\n   keywords: ${picked.join(", ") || "-"}`;
  if (key) {
    const answers = await askJev({ answer: text }, extrasQuestions());
    const yes = EXTRAS.filter(
      (e) => (answers[`extra_${e.id}`]?.noul ?? 0) >= THRESHOLDS.noulYes
    ).map((e) => `${e.id} ${answers[`extra_${e.id}`].noul.toFixed(2)}`);
    line += `\n   jev:      ${yes.join(", ") || "-"}`;
  }
  console.log(line);
}
if (!key) console.log("\n(no TYPESAFE_API_KEY: keyword readings only)");
