import { describe, expect, it } from "vitest";
import { extractMentions, linkHref, mentionText } from "./note-links-shared";

/* The derive step is the whole link mechanism (Phase 3 of the notes plan): links
   are pulled out of the document on save, exactly the way `#tags` come out of the
   text. If this drifts, the Backlinks panel and every record's Notes tab quietly
   go wrong — so it is worth more tests than its size suggests. */

const mention = (attrs: Record<string, unknown>) => ({ type: "mention", attrs });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("extractMentions", () => {
  it("finds a mention nested inside paragraphs", () => {
    const d = doc(para({ type: "text", text: "chase " }, mention({ entity: "task", id: 12, code: "DS-001", label: "Renew licence" })));
    expect(extractMentions(d)).toEqual([{ entity: "task", id: 12, code: "DS-001", label: "Renew licence" }]);
  });

  it("finds mentions buried deep — list items, table cells", () => {
    const d = doc({
      type: "table",
      content: [{ type: "tableRow", content: [{ type: "tableCell", content: [para(mention({ entity: "person", id: 7, label: "Kishan Suchak" }))] }] }],
    });
    expect(extractMentions(d).map((m) => m.id)).toEqual([7]);
  });

  it("de-duplicates the same target mentioned twice, keeping the first", () => {
    const d = doc(
      para(mention({ entity: "company", id: 3, label: "Terra Green Ltd" })),
      para(mention({ entity: "company", id: 3, label: "Terra Green" })),
    );
    const out = extractMentions(d);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("Terra Green Ltd");
  });

  it("keeps the same id under different types apart", () => {
    const d = doc(para(mention({ entity: "person", id: 5, label: "A" }), mention({ entity: "company", id: 5, label: "B" })));
    expect(extractMentions(d)).toHaveLength(2);
  });

  it("ignores a mention with an unknown entity or a junk id", () => {
    const d = doc(para(
      mention({ entity: "spaceship", id: 1, label: "no" }),
      mention({ entity: "task", id: "abc", label: "no" }),
      mention({ entity: "task", id: 0, label: "no" }),
      mention({ entity: "task", id: -4, label: "no" }),
      mention({ entity: "person", id: 9, label: "yes" }),
    ));
    expect(extractMentions(d).map((m) => m.id)).toEqual([9]);
  });

  it("survives the shapes a body_json can actually be", () => {
    expect(extractMentions(null)).toEqual([]);
    expect(extractMentions(undefined)).toEqual([]);
    expect(extractMentions("")).toEqual([]);
    expect(extractMentions(42)).toEqual([]);
    expect(extractMentions({ type: "doc" })).toEqual([]);
    expect(extractMentions({ type: "doc", content: null })).toEqual([]);
  });

  it("does not recurse for ever on a pathological document", () => {
    // A save must never be taken down by a document, however odd its shape.
    let node: Record<string, unknown> = { type: "paragraph" };
    for (let i = 0; i < 400; i++) node = { type: "blockquote", content: [node] };
    expect(() => extractMentions({ type: "doc", content: [node] })).not.toThrow();
  });

  it("normalises a missing code to null rather than undefined", () => {
    const d = doc(para(mention({ entity: "person", id: 2, label: "X" })));
    expect(extractMentions(d)[0]!.code).toBeNull();
  });

  /* A pasted picture carries a `documents` row just like an `@` document mention,
     so it has to land in `note_links` too — otherwise the Documents library cannot
     tell where a file is used. */
  it("counts a pasted image as a document link", () => {
    const d = doc({ type: "noteImage", attrs: { documentId: 501, alt: "scan" } });
    expect(extractMentions(d)).toEqual([{ entity: "document", id: 501, code: null, label: "scan" }]);
  });

  it("ignores an image with no document behind it", () => {
    const d = doc({ type: "noteImage", attrs: { documentId: null } }, { type: "noteImage", attrs: {} });
    expect(extractMentions(d)).toEqual([]);
  });

  it("does not list the same document twice when it is both pasted and mentioned", () => {
    const d = doc(
      { type: "noteImage", attrs: { documentId: 77, alt: "" } },
      para(mention({ entity: "document", id: 77, label: "Scan.pdf" })),
    );
    expect(extractMentions(d)).toHaveLength(1);
  });
});

describe("linkHref", () => {
  it("sends a task to its code, never its id", () => {
    expect(linkHref({ entity: "task", id: 12, code: "DS-001" })).toBe("/task/DS-001");
  });
  it("encodes a code that needs it", () => {
    expect(linkHref({ entity: "task", id: 12, code: "DS 1/2" })).toBe("/task/DS%201%2F2");
  });
  it("falls back to the task list when a code is missing", () => {
    expect(linkHref({ entity: "task", id: 12, code: null })).toBe("/?tab=tasks");
  });
  it("routes the other types to their record pages", () => {
    expect(linkHref({ entity: "person", id: 4, code: null })).toBe("/people/4");
    expect(linkHref({ entity: "company", id: 4, code: null })).toBe("/companies/4");
    expect(linkHref({ entity: "document", id: 4, code: null })).toBe("/documents?doc=4");
    expect(linkHref({ entity: "note", id: 4, code: null })).toBe("/notes/4");
  });
});

describe("mentionText", () => {
  /* This is what lands in `body_text`, so it is what the shelf's plain search can
     find. An opaque token here would make every mentioned name unsearchable. */
  it("writes a task as its code", () => {
    expect(mentionText({ entity: "task", code: "DS-001", label: "Renew licence" })).toBe("@DS-001");
  });
  it("writes a task with no code by its name", () => {
    expect(mentionText({ entity: "task", code: null, label: "Renew licence" })).toBe("@Renew licence");
  });
  it("writes people and companies by name", () => {
    expect(mentionText({ entity: "person", code: null, label: "Kishan Suchak" })).toBe("@Kishan Suchak");
    expect(mentionText({ entity: "company", code: null, label: "Terra Green Ltd" })).toBe("@Terra Green Ltd");
  });
  it("writes a note in the wiki-link idiom", () => {
    expect(mentionText({ entity: "note", code: null, label: "Q3 planning" })).toBe("[[Q3 planning]]");
  });
});
