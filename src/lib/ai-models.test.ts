import { describe, it, expect } from "vitest";
import {
  AI_FAST,
  AI_SMART,
  AI_FAST_MODELS,
  AI_SMART_MODELS,
  AI_VISION_MODELS,
  AI_VISION,
  ladderFor,
  GEMINI_FAST_MODELS,
  GEMINI_SMART_MODELS,
  GEMINI_VISION_MODELS,
  tierOf,
  providerLadder,
  providerVisionModels,
} from "@/lib/ai-models";

// Model fallback ladders. A retired Groq model must self-heal to the next entry
// without a code change; the plain AI_FAST/AI_SMART/AI_VISION exports must
// stay valid (= the first ladder entry) so every existing import keeps working.
// ladderFor must be PURE, BOUNDED (no cycles) and never produce an empty list —
// the harness loops over it, so an empty/unbounded ladder would break AI calls.

describe("ladder exports", () => {
  it("keeps the primary exports equal to the first ladder entry", () => {
    expect(AI_FAST).toBe(AI_FAST_MODELS[0]);
    expect(AI_SMART).toBe(AI_SMART_MODELS[0]);
    expect(AI_VISION).toBe(AI_VISION_MODELS[0]);
  });

  it("never builds an empty ladder (defaults backstop an unset/empty env var)", () => {
    expect(AI_FAST_MODELS.length).toBeGreaterThan(0);
    expect(AI_SMART_MODELS.length).toBeGreaterThan(0);
    expect(AI_VISION_MODELS.length).toBeGreaterThan(0);
    for (const m of [...AI_FAST_MODELS, ...AI_SMART_MODELS, ...AI_VISION_MODELS]) {
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(0);
    }
  });
});

describe("ladderFor", () => {
  it("expands the fast primary to the whole fast ladder", () => {
    expect(ladderFor(AI_FAST)).toEqual(AI_FAST_MODELS);
  });

  it("expands the smart primary to the whole smart ladder", () => {
    expect(ladderFor(AI_SMART)).toEqual(AI_SMART_MODELS);
  });

  it("returns a single-entry ladder for any other model (vision id, one-off)", () => {
    expect(ladderFor(AI_VISION)).toEqual([AI_VISION]);
    expect(ladderFor("some-unknown-model")).toEqual(["some-unknown-model"]);
  });

  it("is bounded — a finite array the harness loops over once per entry", () => {
    const l = ladderFor(AI_FAST);
    expect(Array.isArray(l)).toBe(true);
    expect(l.length).toBeLessThan(10); // a sane upper bound; the harness loops over this
  });

  it("does not mutate the underlying ladder constants when called", () => {
    const before = [...AI_FAST_MODELS];
    const out = ladderFor(AI_FAST);
    out.slice(); // touch it
    expect(AI_FAST_MODELS).toEqual(before);
  });
});

describe("provider swap (Groq → Gemini)", () => {
  it("tierOf maps the fast/smart heads + a vision model to a tier", () => {
    expect(tierOf(AI_FAST)).toBe("fast");
    expect(tierOf(AI_SMART)).toBe("smart");
    expect(tierOf(AI_VISION_MODELS[0])).toBe("vision");
    expect(tierOf("something-unknown")).toBeNull();
  });

  it("a call site's AI_FAST/SMART follows the ACTIVE provider's ladder", () => {
    // Gemini active → the Gemini ladders; Groq active → the Groq ladders (unchanged).
    expect(providerLadder("gemini", AI_FAST)).toEqual(GEMINI_FAST_MODELS);
    expect(providerLadder("gemini", AI_SMART)).toEqual(GEMINI_SMART_MODELS);
    expect(providerLadder("groq", AI_FAST)).toEqual(AI_FAST_MODELS);
    expect(providerLadder("groq", AI_SMART)).toEqual(AI_SMART_MODELS);
  });

  it("an unknown model passes through unchanged on either provider", () => {
    expect(providerLadder("gemini", "one-off")).toEqual(["one-off"]);
    expect(providerLadder("groq", "one-off")).toEqual(["one-off"]);
  });

  it("providerVisionModels returns the active provider's vision ladder", () => {
    expect(providerVisionModels("gemini")).toEqual(GEMINI_VISION_MODELS);
    expect(providerVisionModels("groq")).toEqual(AI_VISION_MODELS);
  });
});
