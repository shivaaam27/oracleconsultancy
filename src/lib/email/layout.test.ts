import { describe, it, expect } from "vitest";
import { renderEmail } from "./layout";

describe("renderEmail", () => {
  it("renders title, subtitle, masthead office + org and the signature marker", () => {
    const html = renderEmail({ title: "Director brief", subtitle: "Portfolio", blocks: [] });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true); // a real document: Gmail keeps a <style> only in <head>
    expect(html).toContain("<!--cos-signature-->"); // stops double-signing
    expect(html).toMatch(/<head>[\s\S]*@media[\s\S]*<\/head>/); // the media query lives in the head
    expect(html).toContain("Oracle Consultancy Ltd"); // masthead org name
    expect(html).toContain("Director brief");
    expect(html).toContain("Portfolio");
  });

  it("names the sending office in the masthead", () => {
    const html = renderEmail({ title: "x", blocks: [], office: "director" });
    // office appears in the masthead next to the org name AND in the footer
    expect(html.split("Director&#39;s Office").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("signs off with the office, not a job title, defaulting to admin", () => {
    expect(renderEmail({ title: "x", blocks: [] })).toContain("Admin Office");
    expect(renderEmail({ title: "x", blocks: [], office: "compliance" })).toContain("Admin Compliance Office");
    expect(renderEmail({ title: "x", blocks: [], office: "director" })).toContain("Director&#39;s Office");
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
    expect(html).toContain("#C2267A"); // danger stat colour
  });

  it("renders the event blocks, keeping line breaks without pre-wrap", () => {
    const html = renderEmail({
      title: "Flight",
      greeting: "Hi Asha,",
      blocks: [
        { kind: "lead", text: "You're invited" },
        { kind: "hero", label: "When", big: "Monday, 7 September 2026", small: "10:45 – 12:15 (EAT)" },
        { kind: "facts", rows: [{ label: "Where", text: "JNIA" }] },
        { kind: "callout", label: "Details", lines: ["line one\nline two"], tone: "muted" },
        { kind: "links", label: "Attached", links: [{ label: "ticket.pdf", url: "https://x/e/t/doc/1" }] },
        { kind: "fine", text: "Times in EAT" },
      ],
    });
    for (const t of ["Hi Asha,", "Monday, 7 September 2026", "10:45 – 12:15 (EAT)", "JNIA", "line one<br>line two", "ticket.pdf", "Times in EAT"]) expect(html).toContain(t);
    expect(html).not.toContain("pre-wrap"); // Outlook ignores it
    expect(html).not.toMatch(/#[0-9a-fA-F]{8}/); // no 8-digit hex (Outlook, older Gmail)
  });

  it("leaves a slot for the signature only when asked", () => {
    expect(renderEmail({ title: "", blocks: [], signature: true })).toContain("<!--cos-signature-slot-->");
    expect(renderEmail({ title: "x", blocks: [] })).not.toContain("<!--cos-signature-slot-->");
  });

  it("escapes HTML in user content", () => {
    const html = renderEmail({ title: "<script>alert(1)</script>", blocks: [] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
