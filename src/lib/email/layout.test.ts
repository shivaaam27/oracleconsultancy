import { describe, it, expect } from "vitest";
import { renderEmail } from "./layout";

describe("renderEmail", () => {
  it("renders title, subtitle, masthead office + org and the signature marker", () => {
    const html = renderEmail({ title: "Director brief", subtitle: "Portfolio", blocks: [] });
    expect(html.startsWith("<!--cos-signature-->")).toBe(true); // stops double-signing
    expect(html).toContain("Oracle Consultancy Ltd"); // masthead org name
    expect(html).toContain("Director brief");
    expect(html).toContain("Portfolio");
  });

  it("names the sending office in the masthead", () => {
    const html = renderEmail({ title: "x", blocks: [], office: "director" });
    // office appears in the masthead next to the org name AND in the footer
    expect(html.split("Director's Office").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("signs off with the office, not a job title, defaulting to admin", () => {
    expect(renderEmail({ title: "x", blocks: [] })).toContain("Admin's Office");
    expect(renderEmail({ title: "x", blocks: [], office: "compliance" })).toContain("Admin Compliance Office");
    expect(renderEmail({ title: "x", blocks: [], office: "director" })).toContain("Director's Office");
    expect(renderEmail({ title: "x", blocks: [] })).toContain("Oracle Consultancy Limited");
    expect(renderEmail({ title: "x", blocks: [] })).not.toContain("Chief of Staff");
  });

  it("renders each block kind", () => {
    const html = renderEmail({
      title: "x",
      blocks: [
        { kind: "stats", tiles: [{ value: 5, label: "overdue", danger: true }] },
        { kind: "section", label: "By company", rows: [{ left: "Dar Spices", right: "1 open" }] },
        { kind: "items", label: "Needs attention", items: [{ pill: { label: "High", tone: "warn" }, title: "Task" }] },
        { kind: "list", bullets: ["one", "two"] },
        { kind: "text", text: "hello" },
      ],
      cta: { label: "Open", url: "https://example.com" },
    });
    expect(html).toContain("By company");
    expect(html).toContain("Dar Spices");
    expect(html).toContain("Needs attention");
    expect(html).toContain("High");
    expect(html).toContain("https://example.com");
    expect(html).toContain("#b91c1c"); // danger stat colour
  });

  it("escapes HTML in user content", () => {
    const html = renderEmail({ title: "<script>alert(1)</script>", blocks: [] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
