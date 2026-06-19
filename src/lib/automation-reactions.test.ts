import { describe, it, expect } from "vitest";
import { inferPipelineStage } from "@/lib/pipeline-shared";

// The pipeline reaction can advance a real application stage, so the document →
// stage mapping must be precise: clear documents map to the right stage, and an
// ambiguous document maps to NOTHING (null) rather than guessing a move.

describe("inferPipelineStage", () => {
  it("maps a receipt to Receipt Received", () => {
    expect(inferPipelineStage({ title: "TRA payment receipt" })).toBe("Receipt Received");
  });
  it("maps a control-number document to Control No. Issued", () => {
    expect(inferPipelineStage({ title: "Control Number assessment", docType: "Control No." })).toBe("Control No. Issued");
  });
  it("maps a proof of payment to Paid", () => {
    expect(inferPipelineStage({ title: "Proof of payment", notes: "paid via bank" })).toBe("Paid");
  });
  it("maps the issued permit/licence itself to Issued", () => {
    expect(inferPipelineStage({ title: "Work Permit Class C", category: "Immigration" })).toBe("Issued");
    expect(inferPipelineStage({ title: "Business Licence", category: "Licence" })).toBe("Issued");
  });
  it("returns null when nothing clearly maps (no guess)", () => {
    expect(inferPipelineStage({ title: "Random memo", category: "Other" })).toBeNull();
    expect(inferPipelineStage({ title: "", category: "Tax" })).toBeNull();
    expect(inferPipelineStage({})).toBeNull();
  });
  it("prefers receipt over the issued-category fallback", () => {
    // A receipt for a permit is a Receipt, not the issued permit.
    expect(inferPipelineStage({ title: "Receipt for work permit", category: "Immigration" })).toBe("Receipt Received");
  });
});
