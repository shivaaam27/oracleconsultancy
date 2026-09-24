import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/supabase", () => ({ sb: {} }));
import { splitParties } from "./relationships";

describe("splitParties", () => {
  it("never splits inside brackets", () => {
    expect(splitParties("Parin Manek 150; Dimpal Tanna 150 (of 1,000,000 authorised; Pulin Manek director/secretary, not shareholder)"))
      .toEqual(["Parin Manek 150", "Dimpal Tanna 150 (of 1,000,000 authorised; Pulin Manek director/secretary, not shareholder)"]);
  });
  it("splits on ; , newline and 'and' at the top level", () => {
    expect(splitParties("A; B (20%), C and D\nE")).toEqual(["A", "B (20%)", "C", "D", "E"]);
  });
});
