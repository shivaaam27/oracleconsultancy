import { describe, it, expect } from "vitest";
import { descendantIds, displayName, extOf, fmtSize, kindOf, pathOf, type FolderRow } from "./files-shared";

const F = (id: number, parentId: number | null, name = `F${id}`): FolderRow => ({ id, name, parentId, color: "black", companyId: null, personId: null, createdAt: "", deletedAt: null });
const tree = [F(1, null, "PES Ltd"), F(2, 1, "Licence"), F(3, 2, "2026"), F(4, null, "Staff papers"), F(5, 4)];

describe("files-shared", () => {
  it("walks a folder's path from the top", () => {
    expect(pathOf(tree, 3).map((f) => f.name)).toEqual(["PES Ltd", "Licence", "2026"]);
    expect(pathOf(tree, null)).toEqual([]);
  });
  it("finds everything inside a folder, and nothing beside it", () => {
    expect([...descendantIds(tree, 1)].sort()).toEqual([1, 2, 3]);
    expect([...descendantIds(tree, 4)].sort()).toEqual([4, 5]);
  });
  it("survives a loop in the data instead of hanging", () => {
    const loop = [F(1, 2), F(2, 1)];
    expect(pathOf(loop, 1).length).toBeLessThanOrEqual(50);
  });
  it("reads extensions and kinds", () => {
    expect(extOf("Licence 2026.PDF")).toBe("pdf");
    expect(extOf("no-extension")).toBe("");
    expect(kindOf("jpeg")).toBe("image");
    expect(kindOf("docx")).toBe("word");
    expect(kindOf("zip")).toBe("other");
  });
  it("shows the extension once", () => {
    expect(displayName({ title: "TIN Certificate", ext: "pdf" })).toBe("TIN Certificate.pdf");
    expect(displayName({ title: "TIN Certificate.pdf", ext: "pdf" })).toBe("TIN Certificate.pdf");
  });
  it("says sizes the way people read them", () => {
    expect(fmtSize(null)).toBe("—");
    expect(fmtSize(512)).toBe("512 B");
    expect(fmtSize(412 * 1024)).toBe("412 KB");
    expect(fmtSize(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });
});
