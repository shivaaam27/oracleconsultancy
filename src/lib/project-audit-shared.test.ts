import { describe, it, expect } from "vitest";
import {
  displayValue, fieldLabel, actorLabel, summarise, describeAudit, isMoneyField,
  type AuditRow,
} from "@/lib/project-audit-shared";

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 1, entity: "budget_line", entityId: 7, label: "CEMENT-STRIP-FOUNDATION",
  action: "updated", field: "amount", oldValue: "500000", newValue: "750000",
  createdBy: "web-ui", createdAt: "2026-08-18T11:00:00+00:00", ...over,
});

describe("displayValue", () => {
  it("groups money so a figure can be read at a glance", () => {
    expect(displayValue("amount", "1500000")).toBe("1,500,000");
    expect(displayValue("amount_approved", "250")).toBe("250");
  });

  it("leaves a rate alone — 0.18 is not 0 shillings", () => {
    expect(isMoneyField("vat_rate")).toBe(false);
    expect(displayValue("vat_rate", "0.18")).toBe("0.18");
  });

  it("shows nothing as a dash, never as zero", () => {
    // The module rule: an unknown must not render as a number. A blank approval
    // means nobody has decided, which is not the same as approving nothing.
    expect(displayValue("amount_approved", null)).toBe("—");
  });

  it("reads a tick as Yes and No", () => {
    expect(displayValue("meal", "true")).toBe("Yes");
    expect(displayValue("active", "false")).toBe("No");
  });
});

describe("fieldLabel", () => {
  it("uses the owner's words, not the column names", () => {
    expect(fieldLabel("amount_approved")).toBe("Amount approved");
    expect(fieldLabel("route")).toBe("Who pays");
    expect(fieldLabel("payer")).toBe("Whose float");
  });

  it("falls back readably for a column nobody has labelled yet", () => {
    expect(fieldLabel("some_new_column")).toBe("some new column");
  });
});

describe("actorLabel", () => {
  it("separates you, staff, the assistant and the system", () => {
    expect(actorLabel("web-ui")).toBe("You");
    expect(actorLabel("portal:Kelvin Mushi")).toBe("Kelvin Mushi");
    expect(actorLabel("ai-command")).toBe("Assistant");
    expect(actorLabel("cron")).toBe("System");
  });
});

describe("summarise", () => {
  it("turns the stored key=value summary back into English", () => {
    expect(summarise("item_code=CEMENT, amount=500000"))
      .toBe("Item code CEMENT · Amount 500,000");
  });

  it("returns nothing for nothing", () => {
    expect(summarise(null)).toBe("");
  });
});

describe("describeAudit", () => {
  it("names the sheet, the record and the field that moved", () => {
    expect(describeAudit(row())).toBe("Budget CEMENT-STRIP-FOUNDATION — Amount changed");
  });

  it("words a creation as an addition", () => {
    expect(describeAudit(row({ action: "created", field: null, label: "TT-01", entity: "payment" })))
      .toBe("Added payment TT-01");
  });

  it("keeps a deletion visible in the trail", () => {
    expect(describeAudit(row({ action: "deleted", field: null })))
      .toBe("Deleted budget CEMENT-STRIP-FOUNDATION");
  });
});
