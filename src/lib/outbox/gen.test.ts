import { describe, it, expect } from "vitest";
import { buildWhatsAppMessage, buildWhatsAppManualMessage } from "./gen";
import type { TaskRow } from "../queries";

// Minimal TaskRow factory — only the fields buildWhatsAppMessage reads.
function task(p: Partial<TaskRow>): TaskRow {
  return {
    actionItem: "Do thing",
    companyName: "Dar Spices",
    priority: "Medium",
    deadline: new Date("2026-06-28T00:00:00Z"),
    daysToDeadline: 11,
    assignees: ["Jane"],
    comments: null,
    latestUpdate: null,
    ...p,
  } as TaskRow;
}

describe("buildWhatsAppMessage", () => {
  it("renders header, stat line, grouped companies and the portal link last", () => {
    const msg = buildWhatsAppMessage("Jane Doe", [
      task({ actionItem: "Submit VAT return", companyName: "Dar Spices", priority: "High", daysToDeadline: -3 }),
      task({ actionItem: "Renew certificate", companyName: "Dar Spices", priority: "Medium" }),
      task({ actionItem: "Confirm supplier", companyName: "Cocozuri Chocolat", priority: "Critical", daysToDeadline: -5 }),
    ]);
    expect(msg).toContain("🔔 *Your tasks · Oracle Consultancy*");
    expect(msg).toContain("Hi Jane,");
    expect(msg).toContain("*Dar Spices*");
    expect(msg).toContain("*Cocozuri Chocolat*");
    expect(msg).toContain("📊 3 open · 2 overdue");
    // portal link is the final line so WhatsApp builds its preview card from it
    expect(msg.trim().split("\n").at(-1)).toMatch(/\/portal$/);
  });

  it("flags overdue and critical with a red dot, low with white", () => {
    const msg = buildWhatsAppMessage("Sam", [
      task({ actionItem: "Late one", daysToDeadline: -1, priority: "Low" }),
      task({ actionItem: "Low one", daysToDeadline: 30, priority: "Low" }),
    ]);
    expect(msg).toMatch(/🔴 Late one/);
    expect(msg).toMatch(/⚪ Low one/);
  });
});

describe("buildWhatsAppManualMessage", () => {
  it("is a short, clean-text envelope — no markdown — ending with the portal link", () => {
    const msg = buildWhatsAppManualMessage("Jane Doe", [
      task({ actionItem: "Submit VAT return", companyName: "Dar Spices", priority: "High", daysToDeadline: -3 }),
      task({ actionItem: "Renew certificate", companyName: "Dar Spices", priority: "Medium" }),
    ]);
    expect(msg).not.toMatch(/[*_]/); // no markdown symbols that show literally in compose
    expect(msg).toContain("Hi Jane,");
    expect(msg).toContain("2 open tasks, 1 overdue");
    expect(msg.trim().split("\n").at(-1)).toMatch(/\/portal$/);
  });

  it("uses the signed reminder link when one is supplied", () => {
    const msg = buildWhatsAppManualMessage("Jane", [task({})], "https://example.com/r/5/sig");
    expect(msg.trim().split("\n").at(-1)).toBe("https://example.com/r/5/sig");
  });

  it("stays short regardless of how many tasks — the card carries the detail", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      task({ actionItem: `Task ${i + 1}`, companyName: "Co", daysToDeadline: 5 }),
    );
    const msg = buildWhatsAppManualMessage("Sam", many);
    expect(msg.split("\n").length).toBeLessThanOrEqual(3); // envelope is at most 3 lines
    expect(msg).toContain("14 open tasks");
    expect(msg).not.toMatch(/Task \d/); // no per-task lines
  });
});
