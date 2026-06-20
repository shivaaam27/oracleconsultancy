import { describe, it, expect } from "vitest";
import {
  GROQ_FAST,
  GROQ_SMART,
  GROQ_FAST_MODELS,
  GROQ_SMART_MODELS,
  GROQ_VISION_MODELS,
  GROQ_VISION,
  ladderFor,
} from "@/lib/ai-models";

// Model fallback ladders. A retired Groq model must self-heal to the next entry
// without a code change; the plain GROQ_FAST/GROQ_SMART/GROQ_VISION exports must
// stay valid (= the first ladder entry) so every existing import keeps working.
// ladderFor must be PURE, BOUNDED (no cycles) and never produce an empty list —
// the harness loops over it, so an empty/unbounded ladder would break AI calls.

describe("ladder exports", () => {
  it("keeps the primary exports equal to the first ladder entry", () => {
    expect(GROQ_FAST).toBe(GROQ_FAST_MODELS[0]);
    expect(GROQ_SMART).toBe(GROQ_SMART_MODELS[0]);
    expect(GROQ_VISION).toBe(GROQ_VISION_MODELS[0]);
  });

  it("never builds an empty ladder (defaults backstop an unset/empty env var)", () => {
    expect(GROQ_FAST_MODELS.length).toBeGreaterThan(0);
    expect(GROQ_SMART_MODELS.length).toBeGreaterThan(0);
    expect(GROQ_VISION_MODELS.length).toBeGreaterThan(0);
    for (const m of [...GROQ_FAST_MODELS, ...GROQ_SMART_MODELS, ...GROQ_VISION_MODELS]) {
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(0);
    }
  });
});

describe("ladderFor", () => {
  it("expands the fast primary to the whole fast ladder", () => {
    expect(ladderFor(GROQ_FAST)).toEqual(GROQ_FAST_MODELS);
  });

  it("expands the smart primary to the whole smart ladder", () => {
    expect(ladderFor(GROQ_SMART)).toEqual(GROQ_SMART_MODELS);
  });

  it("returns a single-entry ladder for any other model (vision id, one-off)", () => {
    expect(ladderFor(GROQ_VISION)).toEqual([GROQ_VISION]);
    expect(ladderFor("some-unknown-model")).toEqual(["some-unknown-model"]);
  });

  it("is bounded — a finite array the harness loops over once per entry", () => {
    const l = ladderFor(GROQ_FAST);
    expect(Array.isArray(l)).toBe(true);
    expect(l.length).toBeLessThan(10); // a sane upper bound; the harness loops over this
  });

  it("does not mutate the underlying ladder constants when called", () => {
    const before = [...GROQ_FAST_MODELS];
    const out = ladderFor(GROQ_FAST);
    out.slice(); // touch it
    expect(GROQ_FAST_MODELS).toEqual(before);
  });
});
