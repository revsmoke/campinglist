import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assembleSections,
  buildPlan,
  destinationName,
  listName,
  localChoice,
  localExtras,
  modulesFor,
  nightsBetween,
  normalizeText,
  pickBaseTemplate,
  rebuildWithout,
  resolvePlace,
  seasonForMonth,
  whenFacts,
} from "../../public/js/wizard/rules.js";
import { CHOICES, EXTRAS, PLACES, STEPS } from "../../public/js/wizard/questions.js";
import {
  choiceQuestion,
  extrasQuestions,
  judgeAvailable,
  judgeChoice,
  judgeExtras,
  remoteJudge,
  resetJudgeAvailability,
} from "../../public/js/wizard/judge.js";

const tplDir = join(process.cwd(), "public", "templates");
const templates = readdirSync(tplDir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(join(tplDir, f), "utf8")));
const library = JSON.parse(
  readFileSync(join(process.cwd(), "public", "wizard", "modules.json"), "utf8")
).modules;
const ctx = { templates, library };

describe("wizard page", () => {
  it("carries the app's Content-Security-Policy and exactly one placement", () => {
    const app = readFileSync(join(process.cwd(), "public", "index.html"), "utf8");
    const plan = readFileSync(
      join(process.cwd(), "public", "plan", "index.html"),
      "utf8"
    );
    const csp = (html) =>
      html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
    expect(csp(plan)).toBe(csp(app));
    expect(plan.match(/data-slot="/g)).toHaveLength(1);
    expect(plan).toContain('src="../js/wizard/wizard.js"');
  });
});

describe("wizard data", () => {
  it("every place and module id is consistent with the library", () => {
    const ids = new Set(templates.map((t) => t.id));
    for (const p of PLACES) expect(ids.has(p.id), p.id).toBe(true);
    for (const e of EXTRAS)
      expect(
        library.some((m) => m.id === e.module),
        e.module
      ).toBe(true);
    for (const m of library) {
      expect(m.items.length).toBeGreaterThan(0);
      for (const r of m.removeItems || []) expect(() => new RegExp(r, "i")).not.toThrow();
    }
    expect(STEPS.map((s) => s.id)).toEqual([
      "where",
      "tripType",
      "when",
      "group",
      "shelter",
      "food",
      "extras",
      "review",
    ]);
  });
});

describe("text matching", () => {
  it("normalizes and matches whole words only", () => {
    expect(normalizeText("  Half Dome, in JULY!  ")).toBe("half dome in july");
    const r = localChoice(
      "we are going backpacking on the JMT",
      CHOICES.tripType.options
    );
    expect(r.choice).toBe("backpacking");
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    const car = localChoice("renting a car to get there", CHOICES.tripType.options);
    expect(car.matched).toBe(false); // "car" alone is not "car camping"
    expect(car.choice).toBeNull();
    expect(car.confidence).toBe(0);
  });

  it("spreads probability when answers are ambiguous", () => {
    const r = localChoice("backpacking then a festival", CHOICES.tripType.options);
    expect(r.matched).toBe(true);
    expect(r.confidence).toBeLessThan(0.6);
    expect(Object.values(r.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("reads overlanding from a rooftop-tent description", () => {
    const r = localChoice(
      "taking the truck and sleeping in the rooftop tent, off grid",
      CHOICES.tripType.options
    );
    expect(r.choice).toBe("overlanding");
    const shelter = localChoice("rooftop tent on the truck", CHOICES.shelter.options);
    expect(shelter.choice).toBe("vehicle");
  });

  it("reads the sample answers people actually type", () => {
    const read = (choiceId, text) => localChoice(text, CHOICES[choiceId].options);
    expect(read("shelter", "hanging between two trees").choice).toBe("hammock");
    expect(read("shelter", "rooftop tent on the truck")).toMatchObject({
      choice: "vehicle",
    });
    expect(
      read("shelter", "rooftop tent on the truck").confidence
    ).toBeGreaterThanOrEqual(0.6);
    expect(read("cooking", "cooking on the fire")).toMatchObject({ choice: "campfire" });
    expect(read("cooking", "cooking on the fire").confidence).toBeGreaterThanOrEqual(0.6);
    expect(read("cooking", "we'll eat in town").choice).toBe("none");
    expect(read("cooking", "jetboil and freeze-dried").choice).toBe("stove");
    expect(read("water", "there's a spigot at the site").choice).toBe("tap");
    expect(read("tripType", "renting a yurt by the lake").choice).toBe("cabin");
  });

  it("finds extras in free text", () => {
    const yes = localExtras(
      "we want to fish and maybe climb; there are bears and no signal"
    );
    expect(yes.fishing).toBeGreaterThan(0.6);
    expect(yes.climbing).toBeGreaterThan(0.6);
    expect(yes.bear).toBeGreaterThan(0.6);
    expect(yes.remote).toBeGreaterThan(0.6);
    expect(yes.swimming).toBeLessThan(0.5);
  });
});

describe("places", () => {
  it("resolves destinations, events and styles, longest alias first", () => {
    expect(resolvePlace("half dome in july").placeId).toBe(
      "yosemite-wilderness-backpacking"
    );
    expect(resolvePlace("Zion Narrows top down").placeId).toBe("zion-narrows");
    expect(resolvePlace("the BWCA out of Ely").placeId).toBe("boundary-waters-canoe");
    expect(resolvePlace("burning man").kind).toBe("event");
    const beach = resolvePlace("somewhere on the coast near Big Sur");
    expect(beach.placeId).toBe("beach-coastal-camping");
    expect(beach.kind).toBe("style");
    expect(resolvePlace("my cousin's farm").placeId).toBeNull();
    expect(resolvePlace("").confidence).toBe(0);
  });

  it("prefers a named destination over a style hint", () => {
    const r = resolvePlace("beach camping near Joshua Tree");
    expect(r.placeId).toBe("joshua-tree-desert-camping");
    expect(r.candidates.map((c) => c.id)).toContain("beach-coastal-camping");
  });

  it("makes a readable destination name", () => {
    expect(destinationName("half dome in july", "yosemite-wilderness-backpacking")).toBe(
      "Yosemite"
    );
    expect(destinationName("we're going to Lake Powell, with the boat", null)).toBe(
      "Lake Powell"
    );
    expect(destinationName("beach near big sur", "beach-coastal-camping")).toBe(
      "beach near big sur"
    );
  });
});

describe("dates", () => {
  it("derives season and nights", () => {
    expect(seasonForMonth(1)).toBe("winter");
    expect(seasonForMonth(4)).toBe("spring");
    expect(seasonForMonth(7)).toBe("summer");
    expect(seasonForMonth(10)).toBe("fall");
    expect(nightsBetween("2027-04-10", "2027-04-13")).toBe(3);
    expect(nightsBetween("2027-04-13", "2027-04-10")).toBeNull();
    expect(whenFacts({ startDate: "2027-07-10", endDate: "2027-07-16" })).toEqual({
      season: "summer",
      nights: 6,
    });
    expect(whenFacts({ season: "fall", nightsId: "2-3" })).toEqual({
      season: "fall",
      nights: 3,
    });
    expect(whenFacts({})).toEqual({ season: null, nights: null });
  });
});

describe("base template", () => {
  const facts = (a) => whenFacts(a);
  it("follows destination, then trip type, then season, shelter and group", () => {
    expect(
      pickBaseTemplate({
        placeId: "yosemite-wilderness-backpacking",
        tripType: "backpacking",
      })
    ).toBe("yosemite-wilderness-backpacking");
    expect(
      pickBaseTemplate({
        placeId: "yosemite-wilderness-backpacking",
        tripType: "festival",
      })
    ).toBe("camplist-classic");
    expect(pickBaseTemplate({ placeId: "bonnaroo", tripType: "campground" })).toBe(
      "bonnaroo"
    );
    expect(pickBaseTemplate({ tripType: "backpacking", season: "winter" })).toBe(
      "winter-cold-weather-camping"
    );
    expect(pickBaseTemplate({ tripType: "backpacking", season: "summer" })).toBe(
      "backpacking-three-season"
    );
    expect(pickBaseTemplate({ tripType: "paddling" })).toBe("canoe-kayak-camping");
    expect(pickBaseTemplate({ tripType: "bikepacking" })).toBe("bikepacking");
    expect(pickBaseTemplate({ tripType: "overlanding" })).toBe(
      "overlanding-vehicle-remote"
    );
    expect(pickBaseTemplate({ tripType: "cabin", kids: true })).toBe(
      "family-car-camping"
    );
    expect(
      pickBaseTemplate({ tripType: "campground", placeId: "desert-camping-hot-dry" })
    ).toBe("desert-camping-hot-dry");
    expect(
      pickBaseTemplate(
        { tripType: "unsure", startDate: "2027-01-10" },
        facts({ startDate: "2027-01-10" })
      )
    ).toBe("winter-cold-weather-camping");
    expect(pickBaseTemplate({ tripType: "campground", shelter: "hammock" })).toBe(
      "hammock-camping-forest"
    );
    expect(pickBaseTemplate({ tripType: "campground", kids: true })).toBe(
      "family-car-camping"
    );
    expect(pickBaseTemplate({})).toBe("camplist-classic");
  });
});

describe("modules", () => {
  const base = (id) => templates.find((t) => t.id === id);
  it("adds what the answers call for and skips what the template already covers", () => {
    const a = {
      tripType: "campground",
      kids: true,
      dog: true,
      groupSize: "6+",
      shelter: "hammock",
      cooking: "campfire",
      water: "carry",
      extras: ["fishing", "bear"],
      startDate: "2027-07-02",
      endDate: "2027-07-09",
    };
    const ids = modulesFor(a, base("camplist-classic"));
    for (const id of [
      "kids",
      "dog",
      "bigGroup",
      "hammock",
      "campfire",
      "fishing",
      "bear",
      "bugs",
      "longTrip",
    ])
      expect(ids, id).toContain(id);
    expect(ids).not.toContain("stove"); // the classic list has a camp kitchen already
    expect(ids).not.toContain("solo");
  });

  it("does not double up a template's own strengths", () => {
    expect(
      modulesFor({ shelter: "hammock" }, base("hammock-camping-forest"))
    ).not.toContain("hammock");
    expect(
      modulesFor({ shelter: "vehicle" }, base("overlanding-vehicle-remote"))
    ).not.toContain("vehicleSleep");
    expect(modulesFor({ tripType: "festival" }, base("burning-man"))).not.toContain(
      "festival"
    );
    expect(modulesFor({ tripType: "festival" }, base("camplist-classic"))).toContain(
      "festival"
    );
    expect(
      modulesFor({ water: "filter" }, base("backpacking-three-season"))
    ).not.toContain("waterFilter");
    expect(modulesFor({ water: "filter" }, base("family-car-camping"))).toContain(
      "waterFilter"
    );
    expect(
      modulesFor({ season: "winter" }, base("winter-cold-weather-camping"))
    ).not.toContain("cold");
    expect(modulesFor({ season: "winter" }, base("camplist-classic"))).toContain("cold");
    expect(modulesFor({ groupSize: "1" }, base("camplist-classic"))).toContain("solo");
    expect(modulesFor({ tripType: "cabin" }, base("camplist-classic"))).toContain(
      "cabin"
    );
  });

  it("merges module items into matching sections, removes swapped gear, never duplicates", () => {
    const tpl = {
      sections: [
        {
          title: "Shelter & Sleep",
          items: [
            { text: "Tent with rainfly", required: true },
            { text: "Sleeping bag", required: true },
          ],
        },
        { title: "Dog", items: [{ text: "Waste bags", required: true }] },
      ],
    };
    const sections = assembleSections(tpl, ["hammock", "dog"], library);
    const shelter = sections.find((s) => s.title === "Shelter & Sleep");
    expect(shelter.items.map((i) => i.text)).toEqual(["Sleeping bag"]);
    const hammock = sections.find((s) => s.title === "Hammock");
    expect(hammock.items.length).toBeGreaterThan(3);
    const dog = sections.find((s) => s.title === "Dog");
    expect(dog.items.filter((i) => i.text === "Waste bags")).toHaveLength(1);
    expect(dog.items.length).toBeGreaterThan(5);
    const permit = sections.flatMap((s) => s.items).find((i) => i.permitRequired);
    expect(permit).toBeUndefined();
  });
});

describe("plan", () => {
  const answers = {
    placeText: "half dome in july with the kids",
    placeId: "yosemite-wilderness-backpacking",
    tripType: "backpacking",
    startDate: "2027-07-10",
    endDate: "2027-07-13",
    groupSize: "3-5",
    kids: true,
    dog: false,
    shelter: "tent",
    cooking: "stove",
    water: "filter",
    extras: ["hiking", "photography"],
  };
  it("builds a complete, deterministic plan", () => {
    const plan = buildPlan(answers, ctx);
    expect(plan.templateId).toBe("yosemite-wilderness-backpacking");
    expect(plan.name).toBe("Yosemite, Jul 2027");
    expect(plan.facts).toEqual({ season: "summer", nights: 3 });
    expect(plan.modules.map((m) => m.id)).toEqual(["kids", "hiking", "photography"]);
    expect(plan.itemCount).toBeGreaterThan(plan.templateItems);
    expect(plan.meta.destination).toBe("Yosemite");
    expect(plan.meta.startDate).toBe("2027-07-10");
    expect(plan.meta.notes).toMatch(
      /trip wizard: backpacking, 3 nights, group of 3-5 with kids/
    );
    expect(plan.meta.notes).toContain('Started from "Yosemite Wilderness Backpacking"');
    expect(buildPlan(answers, ctx)).toEqual(plan);
  });

  it("drops skipped modules on rebuild", () => {
    const plan = buildPlan(answers, ctx);
    const smaller = rebuildWithout(plan, answers, ["kids", "photography"], ctx);
    expect(smaller.itemCount).toBeLessThan(plan.itemCount);
    expect(smaller.sections.some((s) => s.title === "Kids")).toBe(false);
    expect(smaller.sections.some((s) => s.title === "Day hikes")).toBe(true);
    expect(smaller.meta.notes).not.toContain("Kids");
  });

  it("names lists sensibly without a known place or dates", () => {
    expect(listName({ tripType: "paddling", season: "summer" })).toBe(
      "Paddling trip, summer"
    );
    expect(listName({})).toBe("Camping trip");
    expect(listName({ placeText: "Lake Powell", startDate: "2027-05-01" })).toBe(
      "Lake Powell, May 2027"
    );
  });

  it("every trip type and place produces a valid plan", () => {
    for (const type of CHOICES.tripType.options.map((o) => o.id)) {
      for (const place of [null, ...PLACES.map((p) => p.id)]) {
        const plan = buildPlan(
          { tripType: type, placeId: place, placeText: place || "", extras: [] },
          ctx
        );
        expect(plan.sections.length).toBeGreaterThan(0);
        expect(plan.itemCount).toBeGreaterThan(4);
      }
    }
  });
});

describe("judge", () => {
  beforeEach(() => resetJudgeAvailability());

  const health = (judge) => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, judge }),
  });
  const answering = (answers) => ({
    ok: true,
    status: 200,
    json: async () => ({ answers }),
  });
  /** A fetch mock that answers the health probe and records the judge calls. */
  const mockFetch = (judgeResponse, { judge = true } = {}) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      if (url.endsWith("/health")) return health(judge);
      calls.push({ url, body: JSON.parse(init.body) });
      return judgeResponse;
    };
    fetchImpl.calls = calls;
    return fetchImpl;
  };

  it("builds TypeSafe questions from the option data", () => {
    const q = choiceQuestion("tripType");
    expect(q.type).toBe("choice");
    expect(Object.keys(q.criteria)).toContain("overlanding");
    expect(q.criteria.unsure).toMatch(/Not enough/);
    const nouls = extrasQuestions();
    expect(nouls.extra_fishing.type).toBe("noul");
    expect(Object.keys(nouls)).toHaveLength(EXTRAS.length);
  });

  it("accepts a clear local match without the network", async () => {
    let called = false;
    const r = await judgeChoice(
      "tripType",
      "canoe trip in the boundary waters",
      {},
      {
        fetchImpl: () => {
          called = true;
        },
      }
    );
    expect(r.status).toBe("accepted");
    expect(r.choice).toBe("paddling");
    expect(r.source).toBe("local");
    expect(called).toBe(false);
  });

  it("probes the endpoint once per page and asks the person when it is absent or keyless", async () => {
    let probes = 0;
    const absent = async (url) => {
      probes++;
      expect(url).toBe("/api/health");
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const r = await judgeChoice("tripType", "the usual", {}, { fetchImpl: absent });
    expect(r.status).toBe("unresolved");
    expect(r.candidates).toHaveLength(CHOICES.tripType.options.length);
    await judgeChoice("shelter", "the usual", {}, { fetchImpl: absent });
    await judgeExtras("the usual", {}, { fetchImpl: absent });
    expect(probes).toBe(1);
    resetJudgeAvailability();
    expect(await judgeAvailable({ fetchImpl: mockFetch(null, { judge: false }) })).toBe(
      false
    );
    resetJudgeAvailability();
    expect(await judgeAvailable({ fetchImpl: mockFetch(null) })).toBe(true);
    // Nothing configured: nothing is fetched at all.
    const { CONFIG } = await import("../../public/js/config.js");
    const configured = CONFIG.wizard.judgeUrl;
    expect(configured).toBe("/api/judge");
    CONFIG.wizard.judgeUrl = "";
    resetJudgeAvailability();
    const silent = mockFetch(answering({}));
    expect(await remoteJudge({ answer: "x" }, {}, { fetchImpl: silent })).toBeNull();
    expect(silent.calls).toHaveLength(0);
    CONFIG.wizard.judgeUrl = configured;
  });

  it("uses the TypeSafe answer when the keywords give up", async () => {
    const fetchImpl = mockFetch(
      answering({
        tripType: {
          type: "choice",
          choice: "backpacking",
          probabilities: { backpacking: 0.8, campground: 0.2 },
          confidence: 0.77,
        },
      })
    );
    const r = await judgeChoice(
      "tripType",
      "we'll be carrying everything on our backs for a week",
      {},
      { fetchImpl }
    );
    expect(r.status).toBe("accepted");
    expect(r.choice).toBe("backpacking");
    expect(r.source).toBe("typesafe");
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0].url).toBe("/api/judge");
    expect(fetchImpl.calls[0].body.questions.tripType.type).toBe("choice");
    expect(fetchImpl.calls[0].body.state.answer).toMatch(/carrying everything/);
    // A weak remote answer only suggests; a failed call falls back to asking.
    const weak = mockFetch(
      answering({
        tripType: {
          type: "choice",
          choice: "campground",
          probabilities: { campground: 0.4 },
          confidence: 0.35,
        },
      })
    );
    expect(
      (await judgeChoice("tripType", "the usual", {}, { fetchImpl: weak })).status
    ).toBe("suggested");
    const down = mockFetch({ ok: false, status: 503, json: async () => ({}) });
    expect(
      (await judgeChoice("tripType", "the usual", {}, { fetchImpl: down })).status
    ).toBe("unresolved");
    const extras = await judgeExtras(
      "bring the rods",
      {},
      {
        fetchImpl: mockFetch(
          answering({
            extra_fishing: { type: "noul", noul: 0.91 },
            extra_bear: { type: "noul", noul: 0.2 },
          })
        ),
      }
    );
    expect(extras.picked).toEqual(["fishing"]);
    expect(extras.source).toBe("typesafe");
  });
});
