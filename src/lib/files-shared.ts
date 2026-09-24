/**
 * Files Management — client-safe types and helpers (no server imports).
 * The server half is `lib/files.ts`; the page is `app/files`.
 */

export type FolderColor = "black" | "white" | "blue";
export const FOLDER_COLORS: FolderColor[] = ["black", "white", "blue"];

export type FolderRow = {
  id: number;
  name: string;
  parentId: number | null;
  color: FolderColor;
  companyId: number | null;
  personId: number | null;
  createdAt: string;
  deletedAt: string | null;
};

export type FileStatus = "expired" | "soon" | "ok" | "none";

export type FileRow = {
  id: number;
  /** What the owner calls it — shown without the extension. */
  title: string;
  fileName: string | null;
  ext: string;
  size: number | null;
  folderId: number | null;
  companyId: number | null;
  companyName: string | null;
  personId: number | null;
  personName: string | null;
  category: string | null;
  docType: string | null;
  issuer: string | null;
  referenceNo: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  reminderLeadDays: number;
  notes: string | null;
  status: FileStatus;
  starred: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Deleted = archived. `deletedAt` is when (null for an older archive). */
  deleted: boolean;
  deletedAt: string | null;
  hasFile: boolean;
};

export type Library = { folders: FolderRow[]; files: FileRow[] };

/** Days a deleted file or folder is kept before it is removed for good. */
export const KEEP_DELETED_DAYS = 30;

/** The extension of a file name, lower case, without the dot ("" if none). */
export function extOf(name: string | null | undefined): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

export type FileKind = "pdf" | "image" | "word" | "sheet" | "slides" | "text" | "other";
export function kindOf(ext: string): FileKind {
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg"].includes(ext)) return "image";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "sheet";
  if (["ppt", "pptx", "odp"].includes(ext)) return "slides";
  if (["txt", "md"].includes(ext)) return "text";
  return "other";
}
/** The badge on a file icon: its label and colour. */
export const KIND_BADGE: Record<FileKind, { label: (ext: string) => string; color: string }> = {
  pdf: { label: () => "PDF", color: "#E0479E" },
  image: { label: (e) => (e === "jpeg" ? "JPG" : e.toUpperCase()), color: "#2490EF" },
  word: { label: () => "DOC", color: "#3B6FD8" },
  sheet: { label: () => "XLS", color: "#19A06A" },
  slides: { label: () => "PPT", color: "#F07A3A" },
  text: { label: () => "TXT", color: "#8E9197" },
  other: { label: (e) => (e ? e.slice(0, 4).toUpperCase() : "FILE"), color: "#8E9197" },
};

/** "412 KB", "3.4 MB" — the way Dropbox says it. */
export function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** The name as shown: the title plus its extension. */
export function displayName(f: Pick<FileRow, "title" | "ext">): string {
  return f.ext && !f.title.toLowerCase().endsWith(`.${f.ext}`) ? `${f.title}.${f.ext}` : f.title;
}

/** Every folder from the top down to `id`. */
export function pathOf(folders: FolderRow[], id: number | null): FolderRow[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: FolderRow[] = [];
  let f = id != null ? byId.get(id) : undefined;
  let guard = 0;
  while (f && guard++ < 50) { out.unshift(f); f = f.parentId != null ? byId.get(f.parentId) : undefined; }
  return out;
}

/** A folder and everything inside it, at any depth. */
export function descendantIds(folders: FolderRow[], id: number): Set<number> {
  const out = new Set<number>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parentId != null && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}
