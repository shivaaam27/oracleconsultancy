"use client";
/**
 * Files Management — the page (mockup: design/studio-mockup/files/files.html).
 *
 * Dropbox's shape in the Studio look: a rail (All files · Recent · Starred ·
 * Needs renewal · Deleted, then the companies), a path across the top, folders
 * first, files under them in a list or a grid. Everything is in memory — the
 * library is a few hundred rows — so changing folder is instant; every change
 * is shown at once and saved behind it, and put back if the save fails.
 *
 * Moving about writes the address (?f=12, ?view=starred) with pushState, so
 * the browser's Back goes back a folder, and a link lands on the same place.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Search, List as ListIcon, LayoutGrid, FolderPlus, Upload, Folder, Clock, Star, CalendarClock, Trash2, Eye, Download, MoreHorizontal,
  PenLine, FolderInput, Link2, RotateCcw, Check, X, Loader2, ChevronUp, ChevronDown, Users,
  Sparkles,
} from "lucide-react";
import { StudioScope, StudioCardRow, StudioCard, CardHead, BigNumber } from "@/components/studio/kit";
import { useStudioFootNote } from "@/components/studio/foot-note";
import { useToast } from "@/components/toast";
import { FolderIcon, type FolderBadge } from "./folder-icon";
import { FileIcon, ExpiryPill, PopMenu, addedBy, when, type MenuItem } from "./file-bits";
import { FilePreview } from "./file-preview";
import {
  createFolderAction, updateFolderAction, moveFolderAction, deleteFolderAction, restoreFolderAction, purgeFolderAction,
  moveFilesAction, renameFileAction, starFilesAction, deleteFilesAction, restoreFilesAction, purgeFilesAction,
  uploadTicketAction, fileUploadAction,
} from "@/app/files/actions";
import { descendantIds, displayName, fmtSize, kindOf, pathOf, KEEP_DELETED_DAYS, FOLDER_COLORS, type FileRow, type FolderColor, type FolderRow, type Library } from "@/lib/files-shared";
import { StudioChoiceMenu } from "@/components/studio/tasks/cells";
import { MAX_UPLOAD_BYTES } from "@/lib/documents-shared";
import { cn } from "@/lib/cn";

export type FilesCompany = { id: number; name: string; prefix: string; tile: string; ink: string };
type View = "all" | "recent" | "starred" | "renew" | "deleted";
type Nav = { view: View; folder: number | null };
type SortKey = "name" | "place" | "who" | "expiry" | "size" | "modified";
type Upload = { key: string; name: string; pct: number; state: "up" | "done" | "error"; error?: string; id?: number };

const MAX_BYTES = MAX_UPLOAD_BYTES;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "image/gif", "image/tiff", "image/bmp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "text/csv", "application/zip"]);
const VIEW_TITLE: Record<View, string> = { all: "All files", recent: "Recent", starred: "Starred", renew: "Needs renewal", deleted: "Deleted" };
const BTN = "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 text-[13px] transition-colors hover:bg-[var(--st-page)]";
const BTN_DARK = "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[11px] bg-[var(--st-ink)] px-4 text-[13px] font-medium text-[var(--st-page)] transition-opacity hover:opacity-90";
const IB = "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--st-sub)] transition-colors hover:bg-[var(--st-line-soft)] hover:text-[var(--st-ink)]";

function readNav(): Nav & { q: string } {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("view") as View | null;
  return { view: v && v in VIEW_TITLE ? v : "all", folder: p.get("f") ? Number(p.get("f")) : null, q: p.get("q") ?? "" };
}

/** `readOnly`: a director (portal unification, Sept 2026) — browse, preview
 *  and download their companies' files; change nothing. Every write here is
 *  owner-only on the server too (guardOwner), so this is the courtesy of not
 *  offering what would be refused. */
export function FilesApp({ library, companies, initialOpen, initialCompany, initialPerson, readOnly = false }: {
  readOnly?: boolean;
  library: Library;
  companies: FilesCompany[];
  initialOpen?: number | null;
  initialCompany?: number | null;
  initialPerson?: number | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [folders, setFolders] = useState(library.folders);
  const [files, setFiles] = useState(library.files);
  useEffect(() => { setFolders(library.folders); setFiles(library.files); }, [library]);

  // Where we are. A company/person link (?company=4) lands in its folder.
  const [nav, setNavState] = useState<Nav>(() => {
    const startFolder = initialCompany != null ? library.folders.find((f) => f.companyId === initialCompany && f.parentId == null && !f.deletedAt)?.id
      : initialPerson != null ? library.folders.find((f) => f.personId === initialPerson && !f.deletedAt)?.id : undefined;
    return { view: "all", folder: startFolder ?? null };
  });
  const [q, setQ] = useState("");
  useEffect(() => {
    const n = readNav();
    if (initialCompany == null && initialPerson == null) { setNavState({ view: n.view, folder: n.folder }); setQ(n.q); }
    const pop = () => { const m = readNav(); setNavState({ view: m.view, folder: m.folder }); setQ(m.q); setSel(new Set()); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = useCallback((next: Nav, replace = false) => {
    setNavState(next); setSel(new Set()); setQ(""); setRenaming(null);
    const p = new URLSearchParams();
    if (next.view !== "all") p.set("view", next.view);
    if (next.view === "all" && next.folder != null) p.set("f", String(next.folder));
    const url = `/files${p.toString() ? `?${p}` : ""}`;
    if (replace) window.history.replaceState(window.history.state, "", url); else window.history.pushState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  const [mode, setMode] = useState<"list" | "grid">("list");
  useEffect(() => { try { const m = localStorage.getItem("files.mode"); if (m === "grid" || m === "list") setMode(m); } catch { /* fine */ } }, []);
  const setModeSaved = (m: "list" | "grid") => { setMode(m); try { localStorage.setItem("files.mode", m); } catch { /* fine */ } };
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const anchor = useRef<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ id: number; list: FileRow[]; review?: boolean } | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[]; extra?: ReactNode } | null>(null);
  const [dialog, setDialog] = useState<ReactNode>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [veil, setVeil] = useState(false);
  const dragIds = useRef<number[] | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);

  /* ── derived ─────────────────────────────────────────────────────────── */
  const live = useMemo(() => files.filter((f) => !f.deleted), [files]);
  const liveFolders = useMemo(() => folders.filter((f) => !f.deletedAt), [folders]);
  const coById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const countIn = useMemo(() => {
    const m = new Map<number, number>();
    for (const fo of liveFolders) {
      const ids = descendantIds(liveFolders, fo.id);
      m.set(fo.id, live.filter((f) => f.folderId != null && ids.has(f.folderId)).length);
    }
    return m;
  }, [liveFolders, live]);
  const renewN = live.filter((f) => f.status === "expired" || f.status === "soon").length;
  const expiredN = live.filter((f) => f.status === "expired").length;
  const deletedFiles = files.filter((f) => f.deleted);
  const deletedFolders = folders.filter((f) => f.deletedAt && !folders.find((p) => p.id === f.parentId && p.deletedAt === f.deletedAt));
  const looseDeleted = deletedFiles.filter((f) => !(f.folderId != null && deletedFolders.some((d) => d.deletedAt === f.deletedAt && descendantIds(folders, d.id).has(f.folderId!))));
  const hereFolder = nav.folder != null ? folders.find((f) => f.id === nav.folder) ?? null : null;

  // A folder id that no longer exists (deleted elsewhere) drops back to the top.
  useEffect(() => { if (nav.view === "all" && nav.folder != null && (!hereFolder || hereFolder.deletedAt)) go({ view: "all", folder: null }, true); }, [hereFolder, nav, go]);

  const needle = q.trim().toLowerCase();
  const subFolders = nav.view !== "all" ? [] : needle
    ? liveFolders.filter((f) => f.name.toLowerCase().includes(needle))
    : liveFolders.filter((f) => f.parentId === nav.folder);
  const listFiles = useMemo(() => {
    let l: FileRow[];
    if (needle) l = live.filter((f) => [displayName(f), f.companyName, f.personName, f.category, f.referenceNo, f.docType, f.issuer].some((v) => v?.toLowerCase().includes(needle)));
    else if (nav.view === "deleted") l = looseDeleted;
    else if (nav.view === "starred") l = live.filter((f) => f.starred);
    else if (nav.view === "renew") l = live.filter((f) => f.status === "expired" || f.status === "soon").sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
    else if (nav.view === "recent") return [...live].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
    else if (nav.folder == null) l = live.filter((f) => f.folderId == null);
    else l = live.filter((f) => f.folderId === nav.folder);
    if (nav.view === "renew" && !needle) return l;
    const val = (f: FileRow): string | number => {
      switch (sort.key) {
        case "place": return (f.companyName ?? f.personName ?? "~").toLowerCase();
        case "who": return addedBy(f.createdBy).toLowerCase();
        case "expiry": return f.expiryDate ?? "9999";
        case "size": return f.size ?? -1;
        case "modified": return f.updatedAt;
        default: return displayName(f).toLowerCase();
      }
    };
    return [...l].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [needle, nav, live, looseDeleted, sort]);

  // The footer line: what most needs you in here.
  const worst = live.filter((f) => f.status === "expired").sort((a, b) => (b.expiryDate ?? "").localeCompare(a.expiryDate ?? ""))[0];
  useStudioFootNote(worst
    ? { label: "Needs renewal", text: `${worst.companyName ?? worst.personName ?? "—"} · ${displayName(worst)} has expired`, href: `/files?open=${worst.id}` }
    : { label: "Files", text: `${live.length} files · all in date` });

  /* ── saving, with the change shown first ────────────────────────────── */
  const save = useCallback(async (run: () => Promise<{ ok: boolean; error?: string }>, undo: () => void, done?: string) => {
    const r = await run().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (!r.ok) { undo(); toast(r.error || "That didn't save.", { tone: "danger" }); return false; }
    if (done) toast(done, { tone: "success" });
    router.refresh();
    return true;
  }, [router, toast]);

  const patchFiles = (ids: number[], p: Partial<FileRow>) => { const before = files; setFiles((all) => all.map((f) => (ids.includes(f.id) ? { ...f, ...p } : f))); return () => setFiles(before); };

  const moveFiles = (ids: number[], to: number | null) => {
    const undo = patchFiles(ids, { folderId: to });
    const name = to == null ? "All files" : folders.find((f) => f.id === to)?.name ?? "the folder";
    setSel(new Set());
    void save(() => moveFilesAction(ids, to), undo, `Moved ${ids.length === 1 ? "1 file" : `${ids.length} files`} to ${name}`);
  };
  const starFiles = (ids: number[], on: boolean) => { const undo = patchFiles(ids, { starred: on }); void save(() => starFilesAction(ids, on), undo); };
  const deleteFiles = (ids: number[]) => {
    const at = new Date().toISOString();
    const undo = patchFiles(ids, { deleted: true, deletedAt: at });
    setSel(new Set());
    void save(() => deleteFilesAction(ids), undo).then((ok) => {
      if (ok) toast(`${ids.length === 1 ? "1 file" : `${ids.length} files`} moved to Deleted — kept ${KEEP_DELETED_DAYS} days`, { tone: "success", action: { label: "Undo", onClick: () => { patchFiles(ids, { deleted: false, deletedAt: null }); void save(() => restoreFilesAction(ids), () => {}); } } });
    });
  };
  const restoreFiles = (ids: number[]) => { const undo = patchFiles(ids, { deleted: false, deletedAt: null }); void save(() => restoreFilesAction(ids), undo, "Restored to where it was"); };
  const commitRename = (f: FileRow, name: string) => {
    setRenaming(null);
    const clean = name.trim();
    if (!clean || clean === displayName(f)) return;
    const title = f.ext && clean.toLowerCase().endsWith(`.${f.ext}`) ? clean.slice(0, -(f.ext.length + 1)) : clean;
    const undo = patchFiles([f.id], { title });
    void save(() => renameFileAction(f.id, clean), undo, "Renamed");
  };
  const download = async (ids: number[], folderIds: number[] = []) => {
    if (ids.length === 1 && !folderIds.length) { window.location.href = `/api/files/${ids[0]}?dl=1`; return; }
    toast(`Putting ${folderIds.length ? "the folder" : `${ids.length} files`} into one .zip…`);
    const res = await fetch("/api/files/zip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: ids, folders: folderIds }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || "Couldn't make the .zip.", { tone: "danger" }); return; }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "COS files.zip";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  /* ── folders ─────────────────────────────────────────────────────────── */
  const openFolderDialog = (existing: FolderRow | null) => setDialog(
    <FolderDialog existing={existing} companies={companies} defaultCompany={existing?.companyId ?? (hereFolder?.companyId ?? null)}
      onClose={() => setDialog(null)}
      onSubmit={async (v) => {
        if (existing) {
          const before = folders;
          setFolders((all) => all.map((f) => (f.id === existing.id ? { ...f, name: v.name, color: v.color, companyId: v.companyId } : f)));
          const ok = await save(() => updateFolderAction(existing.id, { name: v.name, color: v.color, companyId: v.companyId }), () => setFolders(before), "Folder saved");
          if (ok) setDialog(null);
          return;
        }
        const r = await createFolderAction({ name: v.name, parentId: nav.view === "all" ? nav.folder : null, color: v.color, companyId: v.companyId });
        if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
        setFolders((all) => [...all, { id: r.id, name: v.name, parentId: nav.view === "all" ? nav.folder : null, color: v.color, companyId: v.companyId, personId: null, createdAt: new Date().toISOString(), deletedAt: null }]);
        setDialog(null); setPopped(r.id);
        if (nav.view !== "all") go({ view: "all", folder: null });
        toast(`Folder “${v.name}” created`, { tone: "success" });
        router.refresh();
      }} />,
  );
  const [popped, setPopped] = useState<number | null>(null);
  const deleteFolder = (fo: FolderRow) => {
    const n = countIn.get(fo.id) ?? 0;
    setDialog(<Confirm title={`Delete “${fo.name}”?`} body={n ? `It holds ${n} ${n === 1 ? "file" : "files"}. The folder and everything in it goes to Deleted for ${KEEP_DELETED_DAYS} days — you can restore it from there.` : `It goes to Deleted for ${KEEP_DELETED_DAYS} days.`}
      yes="Delete folder" onClose={() => setDialog(null)} onYes={() => {
        setDialog(null);
        const before = { folders, files };
        const ids = descendantIds(folders, fo.id);
        const at = new Date().toISOString();
        setFolders((all) => all.map((f) => (ids.has(f.id) && !f.deletedAt ? { ...f, deletedAt: at } : f)));
        setFiles((all) => all.map((f) => (f.folderId != null && ids.has(f.folderId) && !f.deleted ? { ...f, deleted: true, deletedAt: at } : f)));
        void save(() => deleteFolderAction(fo.id), () => { setFolders(before.folders); setFiles(before.files); }, `“${fo.name}” moved to Deleted`);
      }} />);
  };
  const moveDialog = (fileIds: number[], folderId?: number) => setDialog(
    <MoveDialog folders={liveFolders} exclude={folderId != null ? descendantIds(liveFolders, folderId) : undefined}
      title={folderId != null ? `Move “${folders.find((f) => f.id === folderId)?.name}” to…` : `Move ${fileIds.length === 1 ? "1 file" : `${fileIds.length} files`} to…`}
      onClose={() => setDialog(null)}
      onPick={(to) => {
        setDialog(null);
        if (folderId != null) {
          const before = folders;
          setFolders((all) => all.map((f) => (f.id === folderId ? { ...f, parentId: to } : f)));
          void save(() => moveFolderAction(folderId, to), () => setFolders(before), "Folder moved");
        } else moveFiles(fileIds, to);
      }} />,
  );

  /* ── upload ──────────────────────────────────────────────────────────── */
  const upload = useCallback(async (list: File[]) => {
    const target = nav.view === "all" ? nav.folder : null;
    const items = list.map((f, i) => ({ file: f, key: `${Date.now()}-${i}` }));
    setUploads((u) => [...u.filter((x) => x.state === "up"), ...items.map((it) => ({ key: it.key, name: it.file.name, pct: 0, state: "up" as const }))]);
    const set = (key: string, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
    let done = 0;
    for (const it of items) {
      const f = it.file;
      if (f.size > MAX_BYTES) { set(it.key, { state: "error", error: "Larger than 50 MB" }); continue; }
      if (f.size === 0) { set(it.key, { state: "error", error: "Empty file" }); continue; }
      const t = await uploadTicketAction(f.name);
      if (!t.ok) { set(it.key, { state: "error", error: t.error }); continue; }
      const ok = await new Promise<boolean>((resolve) => {
        const x = new XMLHttpRequest();
        x.open("PUT", t.signedUrl);
        x.setRequestHeader("content-type", ALLOWED.has(f.type) ? f.type : "application/octet-stream");
        x.upload.onprogress = (e) => { if (e.lengthComputable) set(it.key, { pct: Math.round((e.loaded / e.total) * 96) }); };
        x.onload = () => resolve(x.status >= 200 && x.status < 300);
        x.onerror = () => resolve(false);
        x.send(f);
      });
      if (!ok) { set(it.key, { state: "error", error: "Upload failed — check the connection" }); continue; }
      const r = await fileUploadAction({ path: t.path, name: f.name, size: f.size, folderId: target });
      if (!r.ok) { set(it.key, { state: "error", error: r.error }); continue; }
      set(it.key, { pct: 100, state: "done", id: r.id }); done++;
    }
    if (done) router.refresh();
  }, [nav, router]);

  /* ── keyboard (Dropbox's own keys, plus Space, F2 and Delete) ─────────── */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (preview || dialog || menu) return;
      const t = e.target as HTMLElement;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "/") { e.preventDefault(); search.current?.focus(); return; }
      if (e.key === "Escape" && sel.size) { setSel(new Set()); return; }
      const ids = listFiles.map((f) => f.id);
      const cur = anchor.current;
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && ids.length) {
        e.preventDefault();
        const at = cur != null ? ids.indexOf(cur) : -1;
        const next = ids[Math.max(0, Math.min(ids.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))];
        anchor.current = next;
        setSel(e.shiftKey ? new Set([...sel, next]) : new Set([next]));
        document.querySelector<HTMLElement>(`[data-file="${next}"]`)?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(new Set(ids)); return; }
      if (cur == null || nav.view === "deleted") return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setPreview({ id: cur, list: listFiles }); }
      if (!readOnly && e.key === "F2") { e.preventDefault(); setRenaming(cur); }
      if (!readOnly && (e.key === "Delete" || e.key === "Backspace") && sel.size) { e.preventDefault(); deleteFiles([...sel]); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  /* ── drag from the desktop (upload) and onto folders (move) ──────────── */
  useEffect(() => {
    let depth = 0;
    if (readOnly) return;
    const isFiles = (e: DragEvent) => !dragIds.current && [...(e.dataTransfer?.types ?? [])].includes("Files");
    const enter = (e: DragEvent) => { if (isFiles(e) && nav.view !== "deleted") { depth++; setVeil(true); } };
    const leave = (e: DragEvent) => { if (isFiles(e) && --depth <= 0) { depth = 0; setVeil(false); } };
    const over = (e: DragEvent) => { if (isFiles(e) || dragIds.current) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault(); depth = 0; setVeil(false);
      const list = [...(e.dataTransfer?.files ?? [])];
      if (list.length) void upload(list);
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, [nav.view, upload, readOnly]);

  // The footer's "+ Upload" (studio/shell.tsx) asks for the picker.
  useEffect(() => {
    const on = () => picker.current?.click();
    window.addEventListener("files:upload", on);
    return () => window.removeEventListener("files:upload", on);
  }, []);

  // ?open=12 — a link to one file opens its preview on arrival.
  useEffect(() => {
    if (initialOpen == null) return;
    const f = files.find((x) => x.id === initialOpen && !x.deleted);
    if (f) {
      if (f.folderId != null) go({ view: "all", folder: f.folderId }, true);
      setPreview({ id: f.id, list: live.filter((x) => x.folderId === f.folderId) });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── menus ───────────────────────────────────────────────────────────── */
  const fileMenu = (f: FileRow, at: { x: number; y: number }) => {
    const ids = sel.has(f.id) && sel.size > 1 ? [...sel] : [f.id];
    const many = ids.length > 1;
    setMenu({ at, items: [
      ...(!many ? [{ label: "Preview", icon: <Eye size={14} />, kbd: "Space", onSelect: () => setPreview({ id: f.id, list: listFiles }) }] : []),
      { label: many ? `Download ${ids.length} as .zip` : "Download", icon: <Download size={14} />, onSelect: () => void download(ids) },
      ...(!many && !readOnly ? [{ label: "Rename", icon: <PenLine size={14} />, kbd: "F2", onSelect: () => setRenaming(f.id) }] : []),
      ...(!readOnly ? [
        { label: "Move to…", icon: <FolderInput size={14} />, onSelect: () => moveDialog(ids) },
        { label: f.starred ? "Unstar" : "Star", icon: <Star size={14} />, onSelect: () => starFiles(ids, !f.starred) },
      ] : []),
      ...(!many ? [{ label: "Copy link", icon: <Link2 size={14} />, onSelect: () => { void navigator.clipboard.writeText(`${location.origin}/files?open=${f.id}`).then(() => toast("Link copied.", { tone: "success" })).catch(() => toast("Couldn't copy the link.", { tone: "danger" })); } }] : []),
      ...(!readOnly ? ["-" as const, { label: many ? `Delete ${ids.length}` : "Delete", icon: <Trash2 size={14} />, kbd: "Del", bad: true, onSelect: () => deleteFiles(ids) }] : []),
    ] });
  };
  const folderMenu = (fo: FolderRow, at: { x: number; y: number }) => readOnly ? setMenu({ at, items: [
    { label: "Open", icon: <Folder size={14} />, onSelect: () => go({ view: "all", folder: fo.id }) },
    { label: "Download as .zip", icon: <Download size={14} />, onSelect: () => void download([], [fo.id]) },
  ] }) : setMenu({ at, items: [
    { label: "Open", icon: <Folder size={14} />, onSelect: () => go({ view: "all", folder: fo.id }) },
    { label: "Rename, colour or company", icon: <PenLine size={14} />, onSelect: () => openFolderDialog(fo) },
    { label: "Move to…", icon: <FolderInput size={14} />, onSelect: () => moveDialog([], fo.id) },
    { label: "Download as .zip", icon: <Download size={14} />, onSelect: () => void download([], [fo.id]) },
    "-",
    { label: "Delete folder", icon: <Trash2 size={14} />, bad: true, onSelect: () => deleteFolder(fo) },
  ], extra: (
    <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2">
      {FOLDER_COLORS.map((c) => (
        <button key={c} type="button" aria-label={`Make it ${c}`} onClick={() => {
          setMenu(null);
          const before = folders;
          setFolders((all) => all.map((f) => (f.id === fo.id ? { ...f, color: c } : f)));
          void save(() => updateFolderAction(fo.id, { color: c }), () => setFolders(before));
        }} className={cn("h-6 w-6 rounded-full border-2", fo.color === c ? "border-[var(--st-ink)]" : "border-[var(--st-line)]")}
          style={{ background: c === "black" ? "#111" : c === "white" ? "#fff" : "#50B1FD" }} />
      ))}
      <span className="ml-1 text-[11px] text-[var(--st-muted)]">colour</span>
    </div>
  ) });

  /* ── rendering ───────────────────────────────────────────────────────── */
  const badgesFor = (fo: FolderRow): FolderBadge[] => {
    const coId = fo.companyId ?? pathOf(folders, fo.id).find((x) => x.companyId)?.companyId;
    const co = coId != null ? coById.get(coId) : undefined;
    if (co) return [{ text: co.prefix, bg: co.tile, fg: co.ink }];
    if (fo.personId != null || pathOf(folders, fo.id).some((x) => x.name === "Staff papers")) return [{ text: "PP", bg: "#EFE8FF", fg: "#6B46C1" }];
    return [];
  };
  const trail = nav.view === "all" && nav.folder != null ? pathOf(folders, nav.folder) : [];
  const scopeFolder = nav.view === "all" && hereFolder && !hereFolder.deletedAt ? hereFolder : null;
  const scopeIds = scopeFolder ? descendantIds(liveFolders, scopeFolder.id) : null;
  const scopeFiles = scopeIds ? live.filter((f) => f.folderId != null && scopeIds.has(f.folderId)) : live;
  const scopeName = scopeFolder ? trail.map((f) => f.name).join(" / ") : "All files";
  const scopeSize = scopeFiles.reduce((n, f) => n + (f.size ?? 0), 0);
  const scopeKinds = { pdf: 0, image: 0, word: 0 };
  for (const f of scopeFiles) { const k = kindOf(f.ext); if (k === "pdf" || k === "image" || k === "word") scopeKinds[k]++; }
  const scopeFolderCount = liveFolders.filter((f) => f.parentId === (scopeFolder?.id ?? null)).length;
  const scopeDue = scopeFiles.filter((f) => f.status === "expired" || f.status === "soon").sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
  const scopeExpired = scopeDue.filter((f) => f.status === "expired").length;
  const scopeSoon = scopeDue.length - scopeExpired;
  const topCompanies = liveFolders.filter((f) => f.parentId == null && f.companyId != null);
  const staffTop = liveFolders.find((f) => f.parentId == null && f.name === "Staff papers");
  const totalSize = live.reduce((n, f) => n + (f.size ?? 0), 0);
  const byKind = { pdf: 0, image: 0, word: 0, other: 0 };
  for (const f of live) { const k = kindOf(f.ext); if (k === "pdf" || k === "image" || k === "word") byKind[k]++; else byKind.other++; }

  const clickFile = (e: React.MouseEvent, f: FileRow) => {
    if ((e.target as HTMLElement).closest("input, button, a")) return;
    if (e.shiftKey && anchor.current != null) {
      const ids = listFiles.map((x) => x.id); const a = ids.indexOf(anchor.current), b = ids.indexOf(f.id);
      setSel(new Set([...sel, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)]));
    } else if (e.metaKey || e.ctrlKey) {
      const n = new Set(sel); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); setSel(n); anchor.current = f.id;
    } else { setSel(new Set([f.id])); anchor.current = f.id; }
  };
  const toggle = (id: number) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); anchor.current = id; };

  const sortHead = (k: SortKey, label: string, cls?: string) => (
    <button type="button" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className={cn("flex items-center gap-1 text-left hover:text-[var(--st-ink)]", sort.key === k && "text-[var(--st-ink)]", cls)}>
      {label}{sort.key === k && (sort.dir === 1 ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
    </button>
  );

  const title = needle ? `Results for “${q.trim()}”` : VIEW_TITLE[nav.view];

  return (
    <StudioScope className="flex flex-col gap-[18px]">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3" data-page-header>
        <div className="min-w-0">
          <h1 className="m-0 whitespace-nowrap text-[34px] font-medium leading-[0.95] tracking-[-0.035em] sm:text-[56px]">Files Management</h1>
          <div className="mt-2 text-[13px] text-[var(--st-muted)]">{live.length} files · {fmtSize(totalSize)} · filed by hand, found in a second</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 w-full items-center gap-2 rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[var(--st-muted)] sm:w-[280px]">
            <Search size={15} />
            <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setSel(new Set()); }} placeholder="Search every file and folder" aria-label="Search files"
              style={{ background: "transparent", border: 0, boxShadow: "none" }} className="bare-field h-full w-full text-[13px] text-[var(--st-ink)] outline-none" />
            {q ? <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-[var(--st-muted)] hover:text-[var(--st-ink)]"><X size={14} /></button>
              : <kbd className="rounded-[5px] bg-[var(--st-page)] px-1.5 text-[11px] [font-family:var(--font-geist-mono),monospace]">/</kbd>}
          </label>
          <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="group" aria-label="View">
            {([["list", ListIcon, "List"], ["grid", LayoutGrid, "Grid"]] as const).map(([m, Icon, l]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setModeSaved(m)}
                className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-xs", mode === m ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)]")}><Icon size={14} />{l}</button>
            ))}
          </div>
          {!readOnly && <button type="button" onClick={() => openFolderDialog(null)} className={BTN}><FolderPlus size={15} />New folder</button>}
          {!readOnly && <button type="button" onClick={() => picker.current?.click()} className={BTN_DARK}><Upload size={15} />Upload</button>}
          <input ref={picker} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ""; if (l.length) void upload(l); }} />
        </div>
      </div>

      {/* The two dark cards every Studio page opens with (owner, 24 Sept 2026:
          "all the pages have these two cards… there must be continuity") —
          built from the same kit as Companies' Portfolio + Most at risk.
          Inside a folder they speak for that folder. */}
      <StudioCardRow className="lg:h-[210px]">
        <StudioCard tone="dark">
          <CardHead label={scopeName} right={`${fmtSize(scopeSize)} stored`} />
          <div className="mt-auto flex flex-wrap items-end gap-x-7 gap-y-4 pt-4">
            <div>
              <BigNumber value={scopeFiles.length} unit={scopeFiles.length === 1 ? "file" : "files"} />
              <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--st-on-card-muted)]">
                <button type="button" onClick={() => go({ view: "renew", folder: null })} className="text-[#F07BBE] hover:underline">{scopeExpired} expired</button>
                <button type="button" onClick={() => go({ view: "renew", folder: null })} className="text-[#F5B94E] hover:underline">{scopeSoon} due soon</button>
                {!scopeFolder && <span>{live.filter((f) => f.folderId == null).length} loose</span>}
              </div>
            </div>
            <span className="flex-1" />
            <div className="flex items-end gap-[18px]">
              {([[scopeKinds.pdf, "PDF", "#F07BBE"], [scopeKinds.image, "pictures", "#7CC0FF"], [scopeKinds.word, "Word", "#9DB4FF"], [scopeFolderCount, "folders", "#8E9197"]] as const).map(([v, l, c]) => (
                <div key={l} className="text-center">
                  <div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{v}</div>
                  <div className="mt-1.5 whitespace-nowrap text-[11px]" style={{ color: c }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </StudioCard>
        <StudioCard tone="dark" texture="rings">
          <CardHead label="Needs renewal" right={`soonest first · ${scopeDue.length} due${scopeFolder ? ` in ${scopeFolder.name}` : ""}`} />
          <div className="mt-auto flex flex-col gap-2.5 pt-4">
            {scopeDue.length === 0 && <div className="text-[13px] text-[var(--st-on-card-muted)]">Nothing here is expired or due for renewal.</div>}
            {scopeDue.slice(0, 4).map((f) => {
              const days = f.expiryDate ? Math.round((new Date(`${f.expiryDate}T00:00:00`).getTime() - Date.now()) / 86_400_000) : 0;
              const late = f.status === "expired";
              const w = late ? 100 : Math.max(8, Math.min(100, Math.round((1 - days / Math.max(1, f.reminderLeadDays)) * 100)));
              return (
                <button key={f.id} type="button" onClick={() => setPreview({ id: f.id, list: scopeDue })}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 text-left text-[13px] hover:opacity-90 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_130px]">
                  <span className="truncate">{f.title}<span className="ml-1.5 text-xs text-[var(--st-on-card-muted)]">{f.companyName ?? f.personName ?? ""}</span></span>
                  <span className="order-last col-span-2 h-2 overflow-hidden rounded bg-[var(--st-card-3)] sm:order-none sm:col-span-1">
                    <span className="block h-full rounded" style={{ width: `${w}%`, background: late ? "var(--st-late)" : "var(--st-soon)" }} />
                  </span>
                  <span className="whitespace-nowrap text-right text-xs text-[var(--st-on-card-muted)]">
                    {late ? `expired ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago` : days === 0 ? "expires today" : `renew in ${days} ${days === 1 ? "day" : "days"}`}
                  </span>
                </button>
              );
            })}
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* the rail */}
        <nav aria-label="Files" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-[20px] lg:bg-[var(--st-surface)] lg:p-3 lg:sticky lg:top-3">
          <RailItem on={nav.view === "all" && nav.folder == null && !needle} icon={<Folder size={15} />} label="All files" n={live.length} onClick={() => go({ view: "all", folder: null })} />
          <RailItem on={nav.view === "recent"} icon={<Clock size={15} />} label="Recent" onClick={() => go({ view: "recent", folder: null })} />
          {!readOnly && <RailItem on={nav.view === "starred"} icon={<Star size={15} />} label="Starred" n={live.filter((f) => f.starred).length || undefined} onClick={() => go({ view: "starred", folder: null })} />}
          <RailItem on={nav.view === "renew"} icon={<CalendarClock size={15} />} label="Needs renewal" n={renewN || undefined} bad={expiredN > 0} onClick={() => go({ view: "renew", folder: null })} />
          {!readOnly && <RailItem on={nav.view === "deleted"} icon={<Trash2 size={15} />} label="Deleted" n={looseDeleted.length + deletedFolders.length || undefined} onClick={() => go({ view: "deleted", folder: null })} />}
          {topCompanies.length > 0 && <div className="hidden px-2.5 pb-1.5 pt-3 text-[11px] text-[var(--st-muted)] lg:block">Companies</div>}
          <div className="hidden flex-col gap-0.5 lg:flex">
            {topCompanies.map((fo) => {
              const co = coById.get(fo.companyId!);
              return <RailItem key={fo.id} on={trail[0]?.id === fo.id} label={fo.name} n={countIn.get(fo.id)} onClick={() => go({ view: "all", folder: fo.id })}
                icon={<span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] text-[9px] font-semibold [font-family:var(--font-geist-mono),monospace]" style={{ background: co?.tile ?? "var(--st-page)", color: co?.ink ?? "var(--st-sub)" }}>{co?.prefix ?? fo.name.slice(0, 2).toUpperCase()}</span>} />;
            })}
            {staffTop && (
              <>
                <div className="px-2.5 pb-1.5 pt-3 text-[11px] text-[var(--st-muted)]">People</div>
                <RailItem on={trail[0]?.id === staffTop.id} label={staffTop.name} n={countIn.get(staffTop.id)} onClick={() => go({ view: "all", folder: staffTop.id })}
                  icon={<span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-[#EFE8FF] text-[#6B46C1]"><Users size={12} /></span>} />
              </>
            )}
            <div className="mx-1 mt-2.5 border-t border-[var(--st-line-soft)] px-1.5 pt-3 text-[11px] text-[var(--st-muted)]">
              {fmtSize(totalSize)} stored
              <div className="my-2 flex h-1.5 overflow-hidden rounded bg-[var(--st-line-soft)]">
                <span style={{ width: `${(byKind.pdf / Math.max(1, live.length)) * 100}%`, background: "#E0479E" }} />
                <span style={{ width: `${(byKind.image / Math.max(1, live.length)) * 100}%`, background: "#2490EF" }} />
                <span style={{ width: `${(byKind.word / Math.max(1, live.length)) * 100}%`, background: "#3B6FD8" }} />
                <span style={{ width: `${(byKind.other / Math.max(1, live.length)) * 100}%`, background: "#8E9197" }} />
              </div>
              <span className="text-[#C2327F]">●</span> PDF {byKind.pdf} <span className="ml-1.5 text-[#2490EF]">●</span> Pictures {byKind.image} <span className="ml-1.5 text-[#3B6FD8]">●</span> Word {byKind.word}
            </div>
          </div>
        </nav>

        {/* the work */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-h-[34px] flex-wrap items-center gap-1 text-[13px] lg:mt-3">
            {nav.view === "all" && !needle ? (
              <>
                <button type="button" onClick={() => go({ view: "all", folder: null })} className={cn("rounded-lg px-2 py-1.5 hover:bg-[var(--st-hover,var(--st-page))]", trail.length ? "text-[var(--st-sub)]" : "px-2 py-0.5 text-[20px] font-semibold tracking-[-0.01em]")}>All files</button>
                {trail.map((fo, i) => (
                  <span key={fo.id} className="flex items-center gap-1">
                    <span className="text-[var(--st-muted)]">/</span>
                    <button type="button" onClick={() => go({ view: "all", folder: fo.id })}
                      onDragOver={(e) => { if (dragIds.current) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragIds.current) { moveFiles(dragIds.current, fo.id); dragIds.current = null; } }}
                      className={cn("rounded-lg px-2 py-1.5 hover:bg-[var(--st-page)]", i === trail.length - 1 ? "py-0.5 text-[20px] font-semibold tracking-[-0.01em]" : "text-[var(--st-sub)]")}>{fo.name}</button>
                  </span>
                ))}
              </>
            ) : <span className="px-2 text-[20px] font-semibold tracking-[-0.01em]">{title}</span>}
            <span className="flex-1" />
            <span className="text-xs text-[var(--st-muted)]">{nav.view === "deleted" ? `Kept ${KEEP_DELETED_DAYS} days, then removed for good` : nav.view === "all" && !needle ? (readOnly ? "View only · open a file to preview or download it" : "Drop files anywhere to upload here · drag a file onto a folder to move it") : ""}</span>
          </div>


          {nav.view === "deleted" && deletedFolders.length > 0 && !needle && (
            <>
              <SecHead title="Deleted folders" meta={`${deletedFolders.length}`} />
              <div className="rounded-[20px] bg-[var(--st-surface)] p-1.5">
                {deletedFolders.map((fo) => <DeletedRow key={fo.id} icon={<FolderIcon color={fo.color} scale={0.1} />} name={fo.name} deletedAt={fo.deletedAt!}
                  onRestore={() => { const before = folders; setFolders((all) => all.map((f) => (f.deletedAt === fo.deletedAt && descendantIds(folders, fo.id).has(f.id) ? { ...f, deletedAt: null } : f))); void save(() => restoreFolderAction(fo.id), () => setFolders(before), `“${fo.name}” restored`); }}
                  onPurge={() => {
                    const before = { folders, files };
                    const ids = descendantIds(folders, fo.id);
                    setFolders((all) => all.filter((f) => !ids.has(f.id)));
                    setFiles((all) => all.filter((f) => !(f.deleted && f.folderId != null && ids.has(f.folderId))));
                    void save(() => purgeFolderAction(fo.id), () => { setFolders(before.folders); setFiles(before.files); }, `“${fo.name}” removed for good`);
                  }} />)}
              </div>
            </>
          )}

          {subFolders.length > 0 && (
            <>
              <SecHead title="Folders" meta={`${subFolders.length} ${subFolders.length === 1 ? "folder" : "folders"}`} />
              <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
                {subFolders.map((fo) => (
                  <FolderTile key={fo.id} folder={fo} count={countIn.get(fo.id) ?? 0} badges={badgesFor(fo)} popped={popped === fo.id} dropOn={dropOn === fo.id}
                    sub={needle ? pathOf(folders, fo.parentId).map((x) => x.name).join(" / ") || "All files" : undefined}
                    onOpen={() => go({ view: "all", folder: fo.id })}
                    onMenu={(at) => folderMenu(fo, at)}
                    onDragOver={(e) => { if (dragIds.current) { e.preventDefault(); setDropOn(fo.id); } }}
                    onDragLeave={() => setDropOn((d) => (d === fo.id ? null : d))}
                    onDrop={(e) => { e.preventDefault(); setDropOn(null); if (dragIds.current) { moveFiles(dragIds.current, fo.id); dragIds.current = null; } }} />
                ))}
              </div>
            </>
          )}

          {!(nav.view === "deleted" && deletedFolders.length > 0 && listFiles.length === 0) && (
          <SecHead title={nav.view === "all" && !needle ? (nav.folder == null ? "Loose files" : "Files") : nav.view === "deleted" ? "Deleted files" : needle ? "Files" : title}
            meta={`${listFiles.length} ${listFiles.length === 1 ? "file" : "files"}`} />
          )}
          {nav.view === "deleted" && deletedFolders.length > 0 && listFiles.length === 0 ? null : listFiles.length === 0 ? (
            <button type="button" onClick={() => nav.view === "all" && picker.current?.click()}
              className="flex flex-col items-center gap-1 rounded-[20px] border-[1.5px] border-dashed border-[var(--st-line)] px-5 py-11 text-center text-[13px] text-[var(--st-muted)]">
              <b className="text-[15px] font-medium text-[var(--st-ink)]">{nav.view === "deleted" ? "Nothing deleted" : needle ? "Nothing matches" : nav.view === "all" ? "Drop files here" : "Nothing here yet"}</b>
              {nav.view === "deleted" ? `Anything you delete waits here for ${KEEP_DELETED_DAYS} days.` : needle ? "Try another word — a company, a person, a reference number." : nav.view === "all" ? "or press Upload — they land in this folder." : ""}
            </button>
          ) : nav.view === "deleted" ? (
            <div className="rounded-[20px] bg-[var(--st-surface)] p-1.5">
              {listFiles.map((f) => <DeletedRow key={f.id} icon={<FileIcon ext={f.ext} />} name={displayName(f)} deletedAt={f.deletedAt} sub={f.folderId ? pathOf(folders, f.folderId).map((x) => x.name).join(" / ") : "All files"}
                onRestore={() => restoreFiles([f.id])} onPurge={() => { const before = files; setFiles((all) => all.filter((x) => x.id !== f.id)); void save(() => purgeFilesAction([f.id]), () => setFiles(before), "Removed for good"); }} />)}
            </div>
          ) : mode === "list" ? (
            <div className="rounded-[20px] bg-[var(--st-surface)] p-1.5">
              <div className="hidden h-[38px] grid-cols-[34px_minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_150px_70px_100px_92px] items-center gap-2.5 border-b border-[var(--st-line-soft)] px-3 text-xs text-[var(--st-muted)] md:grid">
                <span />
                {sortHead("name", "Name")}{sortHead("place", "Company · person")}{sortHead("who", "Added by")}{sortHead("expiry", "Expiry")}{sortHead("size", "Size")}{sortHead("modified", "Modified")}<span />
              </div>
              {listFiles.map((f) => (
                <FileLine key={f.id} f={f} on={sel.has(f.id)} renaming={renaming === f.id} showPath={needle ? (f.folderId ? pathOf(folders, f.folderId).map((x) => x.name).join(" / ") : "All files") : null}
                  onClick={(e) => clickFile(e, f)} onToggle={() => toggle(f.id)} onOpen={() => setPreview({ id: f.id, list: listFiles })}
                  onMenu={(at) => fileMenu(f, at)} onRename={(n) => commitRename(f, n)} onCancelRename={() => setRenaming(null)}
                  onStartRename={() => { if (!readOnly) setRenaming(f.id); }}
                  onDragStart={() => { if (!readOnly) dragIds.current = sel.has(f.id) ? [...sel] : [f.id]; }} onDragEnd={() => { dragIds.current = null; setDropOn(null); }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]">
              {listFiles.map((f) => (
                <FileCard key={f.id} f={f} on={sel.has(f.id)} onClick={(e) => clickFile(e, f)} onToggle={() => toggle(f.id)} onOpen={() => setPreview({ id: f.id, list: listFiles })}
                  onMenu={(at) => fileMenu(f, at)}
                  onDragStart={() => { if (!readOnly) dragIds.current = sel.has(f.id) ? [...sel] : [f.id]; }} onDragEnd={() => { dragIds.current = null; setDropOn(null); }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* selection bar */}
      <div className={cn("fixed bottom-[calc(64px+env(safe-area-inset-bottom)+18px)] left-1/2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-2xl bg-[#141517] py-1.5 pl-4 pr-1.5 text-[#F2F2F0] shadow-[0_18px_40px_rgba(0,0,0,0.3)] transition-all duration-200",
        sel.size && nav.view !== "deleted" ? "pointer-events-auto -translate-x-1/2 opacity-100" : "pointer-events-none -translate-x-1/2 translate-y-4 opacity-0")}>
        <span className="mr-1.5 text-[13px] font-medium">{sel.size} selected</span>
        <SelBtn onClick={() => void download([...sel])}><Download size={14} />Download</SelBtn>
        {!readOnly && <SelBtn onClick={() => moveDialog([...sel])}><FolderInput size={14} />Move</SelBtn>}
        {!readOnly && <SelBtn onClick={() => { const on = ![...sel].every((id) => files.find((f) => f.id === id)?.starred); starFiles([...sel], on); }}><Star size={14} />Star</SelBtn>}
        {!readOnly && <SelBtn bad onClick={() => deleteFiles([...sel])}><Trash2 size={14} />Delete</SelBtn>}
        <SelBtn onClick={() => setSel(new Set())} label="Clear selection"><X size={14} /></SelBtn>
      </div>

      {/* drop veil */}
      {veil && (
        <div className="pointer-events-none fixed inset-[10px_10px_74px] z-[60] flex items-center justify-center rounded-[18px] border-2 border-dashed border-[#2490EF] bg-[rgba(36,144,239,0.08)]">
          <div className="rounded-[18px] bg-[var(--st-surface)] px-6 py-4 text-center shadow-[0_16px_40px_rgba(17,18,20,0.14)]">
            <b className="block text-base font-semibold">Drop to upload to {hereFolder && nav.view === "all" ? hereFolder.name : "All files"}</b>
            <span className="text-xs text-[var(--st-muted)]">PDF, pictures, Word, Excel — up to 50 MB each</span>
          </div>
        </div>
      )}

      {/* uploads tray */}
      {uploads.length > 0 && (
        <div className="st-pop fixed bottom-[calc(64px+env(safe-area-inset-bottom)+18px)] right-4 z-[55] w-[min(340px,calc(100vw-32px))] rounded-[18px] border border-[var(--st-line-soft)] bg-[var(--st-surface)] p-3 shadow-[0_16px_40px_rgba(17,18,20,0.14)]">
          <div className="mb-2 flex items-center justify-between text-[13px] font-semibold">
            {uploads.some((u) => u.state === "up") ? `Uploading ${uploads.filter((u) => u.state === "up").length} of ${uploads.length}` : `${uploads.filter((u) => u.state === "done").length} uploaded`}
            <button type="button" onClick={() => setUploads([])} className={IB} aria-label="Close"><X size={14} /></button>
          </div>
          {(() => {
            // After an upload: the AI reads each new file and fills its details
            // for the owner to check — nothing is saved until he presses Save.
            const ids = uploads.filter((u) => u.state === "done" && u.id != null).map((u) => u.id!);
            const ready = files.filter((f) => ids.includes(f.id) && !f.deleted);
            if (uploads.some((u) => u.state === "up") || !ids.length) return null;
            return (
              <button type="button" disabled={ready.length < ids.length}
                onClick={() => { setPreview({ id: ready[0].id, list: ids.map((id) => ready.find((f) => f.id === id)!).filter(Boolean), review: true }); setUploads([]); }}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--st-ink)] px-3 py-2 text-[13px] font-semibold text-[var(--st-surface)] hover:opacity-90 disabled:opacity-40">
                {ready.length < ids.length ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Check the details{ids.length > 1 ? ` of ${ids.length} files` : ""}
              </button>
            );
          })()}
          <div className="st-scroll flex max-h-[260px] flex-col overflow-y-auto">
            {uploads.map((u) => (
              <div key={u.key} className="flex items-center gap-2.5 py-1.5">
                <FileIcon ext={u.name.split(".").pop()?.toLowerCase() ?? ""} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs">{u.name}</div>
                  {u.state === "error" ? <div className="text-[11px] text-[var(--st-late-text)]">{u.error}</div>
                    : <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--st-line-soft)]"><div className="h-full bg-[var(--st-ink)] transition-[width] duration-200" style={{ width: `${u.pct}%` }} /></div>}
                </div>
                {u.state === "done" ? <Check size={14} className="text-[var(--st-ok-text)]" /> : u.state === "up" ? <Loader2 size={14} className="animate-spin text-[var(--st-muted)]" /> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {menu && <PopMenu at={menu.at} items={menu.items} onClose={() => setMenu(null)}>{menu.extra}</PopMenu>}
      {dialog}
      {preview && (
        <FilePreview list={preview.list.filter((f) => !f.deleted)} startId={preview.id} folders={folders} onClose={() => setPreview(null)}
          onRename={(f) => { setPreview(null); setRenaming(f.id); }}
          onMove={(f) => { setPreview(null); moveDialog([f.id]); }}
          onStar={(f) => starFiles([f.id], !f.starred)}
          onDelete={(f) => { setPreview(null); deleteFiles([f.id]); }}
          onSaved={() => router.refresh()} review={preview.review} readOnly={readOnly} />
      )}
    </StudioScope>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function RailItem({ on, icon, label, n, bad, onClick }: { on: boolean; icon: ReactNode; label: string; n?: number; bad?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? "page" : undefined}
      className={cn("flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] px-2.5 text-left text-[13px] transition-colors lg:w-full lg:gap-2.5",
        on ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "bg-[var(--st-surface)] text-[var(--st-sub)] hover:bg-[var(--st-page)] hover:text-[var(--st-ink)] lg:bg-transparent")}>
      <span className="flex w-[22px] shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 truncate lg:flex-1">{label}</span>
      {n != null && <span className={cn("text-[11px]", on ? "opacity-60" : bad ? "text-[var(--st-late-text)]" : "text-[var(--st-muted)]")}>{n}</span>}
    </button>
  );
}

function SecHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2.5">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      {meta && <span className="text-xs text-[var(--st-muted)]">{meta}</span>}
    </div>
  );
}

function FolderTile({ folder, count, badges, sub, popped, dropOn, onOpen, onMenu, onDragOver, onDragLeave, onDrop }: {
  folder: FolderRow; count: number; badges: FolderBadge[]; sub?: string; popped: boolean; dropOn: boolean;
  onOpen: () => void; onMenu: (at: { x: number; y: number }) => void;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const click = () => {
    if (busy.current) return;
    busy.current = true;
    setOpen(true);                               // the papers fly up, the flap swings…
    setTimeout(() => { onOpen(); busy.current = false; setOpen(false); }, 380); // …then in.
  };
  return (
    <div className={cn("group relative rounded-[18px] transition-colors", (hover || dropOn) && "bg-[var(--st-seg)]", dropOn && "shadow-[inset_0_0_0_2px_var(--st-ok)]", popped && "st-pop")}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setOpen(false); }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}>
      <button type="button" onClick={click} onFocus={() => setHover(true)} onBlur={() => setHover(false)} title={`Open ${folder.name}`}
        className="flex w-full flex-col items-center gap-0.5 rounded-[18px] px-2.5 pb-3 pt-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-ink)]">
        <FolderIcon color={folder.color} scale={0.46} hovered={hover || dropOn} open={open} badges={badges} />
        <span className="mt-1.5 max-w-full truncate text-sm font-medium">{folder.name}</span>
        <span className="max-w-full truncate text-xs text-[var(--st-muted)]">{sub ?? `${count} ${count === 1 ? "file" : "files"}`}</span>
      </button>
      <button type="button" aria-label={`More for ${folder.name}`} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu({ x: r.left, y: r.bottom + 6 }); }}
        className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-lg bg-[var(--st-surface)] text-[var(--st-sub)] shadow-[0_1px_3px_rgba(0,0,0,0.12)] focus-visible:flex group-hover:flex"><MoreHorizontal size={14} /></button>
    </div>
  );
}

function Chk({ on, onToggle, className }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={on ? "Deselect" : "Select"} onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn("flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px] transition-colors", on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-page)]" : "border-[var(--st-line)] bg-[var(--st-surface)] group-hover:border-[var(--st-sub)]", className)}>
      {on && <Check size={11} strokeWidth={3.4} />}
    </button>
  );
}

function FileLine({ f, on, renaming, showPath, onClick, onToggle, onOpen, onMenu, onRename, onCancelRename, onStartRename, onDragStart, onDragEnd }: {
  f: FileRow; on: boolean; renaming: boolean; showPath: string | null;
  onClick: (e: React.MouseEvent) => void; onToggle: () => void; onOpen: () => void; onMenu: (at: { x: number; y: number }) => void;
  onRename: (name: string) => void; onCancelRename: () => void; onStartRename: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!renaming || !input.current) return;
    const el = input.current; el.focus();
    const dot = el.value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, [renaming]);
  const place = [f.companyName, f.personName].filter(Boolean).join(" · ") || "—";
  return (
    <div data-file={f.id} tabIndex={0} draggable={!renaming} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={onClick} onDoubleClick={(e) => { if ((e.target as HTMLElement).closest("[data-name]")) onStartRename(); else onOpen(); }}
      onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}
      className={cn("group grid h-[52px] grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--st-ink)] md:grid-cols-[34px_minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_150px_70px_100px_92px]",
        "[&+&]:shadow-[0_-1px_0_var(--st-line-soft)] hover:bg-[var(--st-page)]", on && "bg-[color-mix(in_srgb,#2490EF_9%,var(--st-surface))]")}>
      <Chk on={on} onToggle={onToggle} />
      <span className="flex min-w-0 items-center gap-2.5">
        <FileIcon ext={f.ext} />
        {renaming ? (
          <input ref={input} defaultValue={displayName(f)} aria-label="New name"
            onKeyDown={(e) => { if (e.key === "Enter") onRename(e.currentTarget.value); if (e.key === "Escape") { e.stopPropagation(); onCancelRename(); } }}
            onBlur={(e) => onRename(e.currentTarget.value)}
            className="h-8 w-full rounded-lg border border-[var(--st-ink)] bg-[var(--st-surface)] px-2 text-[13px] text-[var(--st-ink)] outline-none" />
        ) : (
          <span className="min-w-0">
            <span data-name className="block truncate text-[13px]" title="Double-click the name to rename">{displayName(f)}</span>
            {showPath && <span className="block truncate text-[11px] text-[var(--st-muted)]">{showPath}</span>}
          </span>
        )}
        {f.starred && !renaming && <Star size={13} className="shrink-0 text-[#F5A524]" fill="currentColor" />}
      </span>
      <span className="hidden truncate text-xs text-[var(--st-sub)] md:block">{place}</span>
      <span className="hidden truncate text-xs text-[var(--st-sub)] md:block">{addedBy(f.createdBy)}</span>
      <span className="hidden md:block"><ExpiryPill f={f} /></span>
      <span className="hidden text-xs text-[var(--st-sub)] md:block">{fmtSize(f.size)}</span>
      <span className="hidden text-xs text-[var(--st-sub)] md:block">{when(f.updatedAt)}</span>
      <span className={cn("flex justify-end gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100", on && "md:opacity-100")}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className={IB} title="Preview (Space)" aria-label="Preview"><Eye size={15} /></button>
        <a href={`/api/files/${f.id}?dl=1`} onClick={(e) => e.stopPropagation()} className={cn(IB, "hidden sm:inline-flex")} title="Download" aria-label="Download"><Download size={15} /></a>
        <button type="button" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onMenu({ x: r.right - 216, y: r.bottom + 6 }); }} className={IB} aria-label="More"><MoreHorizontal size={15} /></button>
      </span>
    </div>
  );
}

function FileCard({ f, on, onClick, onToggle, onOpen, onMenu, onDragStart, onDragEnd }: {
  f: FileRow; on: boolean; onClick: (e: React.MouseEvent) => void; onToggle: () => void; onOpen: () => void; onMenu: (at: { x: number; y: number }) => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const img = kindOf(f.ext) === "image" && f.hasFile && !["heic", "heif", "tiff"].includes(f.ext);
  return (
    <div data-file={f.id} tabIndex={0} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} onDoubleClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}
      className={cn("group relative flex cursor-pointer flex-col gap-2 rounded-[18px] bg-[var(--st-surface)] p-2.5 outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-[0_10px_24px_rgba(17,18,20,0.08)] focus-visible:ring-2 focus-visible:ring-[var(--st-ink)]", on && "shadow-[inset_0_0_0_2px_#2490EF]")}>
      <div className="relative flex h-[128px] items-end justify-center overflow-hidden rounded-xl bg-[var(--st-page)]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${f.id}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="flex h-[88%] w-[62%] flex-col gap-[5px] rounded-t-md bg-white px-2.5 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <i className="mb-1 block h-[7px] w-[70%] rounded bg-[#D4D4D0]" />
            {[100, 100, 80, 100, 60, 90].map((w, i) => <i key={i} className="block h-1 rounded bg-[#E4E4E0]" style={{ width: `${w}%` }} />)}
          </div>
        )}
        <span className="absolute left-2 top-2"><Chk on={on} onToggle={onToggle} /></span>
        <span className="absolute bottom-2 right-2"><FileIcon ext={f.ext} size={20} /></span>
      </div>
      <div className="truncate text-[13px] font-medium">{displayName(f)}</div>
      <div className="flex justify-between gap-1.5 text-[11px] text-[var(--st-muted)]">
        <span>{fmtSize(f.size)}</span>
        {f.status === "expired" ? <span className="text-[var(--st-late-text)]">Expired</span> : f.status === "soon" ? <span className="text-[var(--st-soon-text)]">Renew soon</span> : <span>{when(f.updatedAt)}</span>}
      </div>
    </div>
  );
}

function DeletedRow({ icon, name, sub, deletedAt, onRestore, onPurge }: { icon: ReactNode; name: string; sub?: string; deletedAt: string | null; onRestore: () => void; onPurge: () => void }) {
  const [sure, setSure] = useState(false);
  const left = deletedAt ? Math.max(0, KEEP_DELETED_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000)) : null;
  return (
    <div className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-1.5 [&+&]:shadow-[0_-1px_0_var(--st-line-soft)] hover:bg-[var(--st-page)]">
      <span className="flex w-8 justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{name}</span>
        <span className="block truncate text-[11px] text-[var(--st-muted)]">{sub ? `from ${sub} · ` : ""}{deletedAt ? `deleted ${when(deletedAt).toLowerCase()}` : "archived earlier"}</span>
      </span>
      {left != null && <span className="hidden text-xs text-[var(--st-muted)] sm:block">{left} {left === 1 ? "day" : "days"} left</span>}
      <button type="button" onClick={onRestore} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[var(--st-line)] px-2.5 text-xs hover:bg-[var(--st-surface)]"><RotateCcw size={13} />Restore</button>
      <button type="button" onBlur={() => setSure(false)} onClick={() => { if (!sure) { setSure(true); return; } setSure(false); onPurge(); }}
        className={cn("inline-flex h-8 items-center rounded-[9px] border px-2.5 text-xs", sure ? "border-[var(--st-late)] bg-[var(--st-late)] text-white" : "border-[var(--st-bad-line)] text-[var(--st-late-text)] hover:bg-[var(--st-bad-wash)]")}>
        {sure ? "Press again — gone for good" : "Delete for good"}
      </button>
    </div>
  );
}

function SelBtn({ children, onClick, bad, label }: { children: ReactNode; onClick: () => void; bad?: boolean; label?: string }) {
  return <button type="button" onClick={onClick} aria-label={label} className={cn("inline-flex h-[34px] items-center gap-1.5 rounded-[10px] px-3 text-[13px] hover:bg-[#26282C]", bad ? "text-[#F07BBE]" : "text-[#E6E6E3]")}>{children}</button>;
}

/* ── dialogs ────────────────────────────────────────────────────────────── */

function Modal({ children, onClose, width = 460 }: { children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return (
    <div className="studio fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(14,15,16,0.55)] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" className="st-pop w-full rounded-[22px] bg-[var(--st-surface)] p-5 text-[var(--st-ink)] shadow-[0_16px_40px_rgba(17,18,20,0.2)]" style={{ maxWidth: width }}>{children}</div>
    </div>
  );
}

function FolderDialog({ existing, companies, defaultCompany, onClose, onSubmit }: {
  existing: FolderRow | null; companies: FilesCompany[]; defaultCompany: number | null; onClose: () => void;
  onSubmit: (v: { name: string; color: FolderColor; companyId: number | null }) => Promise<void>;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<FolderColor>(existing?.color ?? "black");
  const [companyId, setCompanyId] = useState<number | null>(existing?.companyId ?? defaultCompany);
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!name.trim() || busy) return; setBusy(true); await onSubmit({ name: name.trim(), color, companyId }); setBusy(false); };
  return (
    <Modal onClose={onClose}>
      <h3 className="m-0 mb-4 text-lg font-medium tracking-[-0.01em]">{existing ? "Folder" : "New folder"}</h3>
      <label className="mb-3.5 flex flex-col gap-1.5 text-xs text-[var(--st-label)]">Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} placeholder="e.g. Licences 2026"
          className="h-[38px] rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] text-[var(--st-ink)] outline-none focus:border-[var(--st-ink)]" />
      </label>
      <div className="mb-3.5 flex flex-col gap-1.5 text-xs text-[var(--st-label)]">Colour
        <div className="flex gap-2.5">
          {FOLDER_COLORS.map((c) => (
            <button key={c} type="button" aria-pressed={color === c} onClick={() => setColor(c)}
              className={cn("flex flex-col items-center gap-1 rounded-[14px] border-2 bg-[var(--st-page)] px-2 pb-1 pt-2 text-[11px] capitalize text-[var(--st-sub)]", color === c ? "border-[var(--st-ink)]" : "border-transparent")}>
              <FolderIcon color={c} scale={0.2} hovered={color === c} />{c}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-1.5 flex flex-col gap-1.5 text-xs text-[var(--st-label)]">Belongs to
        <StudioChoiceMenu value={companyId != null ? String(companyId) : ""} showDot={false} width={300}
          options={[{ value: "", label: "No company — general" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
          onPick={(v) => setCompanyId(v ? Number(v) : null)}
          className="mx-0 h-[38px] w-full justify-between rounded-[11px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 py-0 text-[13px] text-[var(--st-ink)]" />
      </div>
      <p className="mb-4 text-[11px] text-[var(--st-muted)]">A company folder files what lands in it under that company, so its expiry reminders and the company page keep finding it.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN}>Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={!name.trim() || busy} className={cn(BTN_DARK, "disabled:opacity-40")}>{busy && <Loader2 size={13} className="animate-spin" />}{existing ? "Save" : "Create folder"}</button>
      </div>
    </Modal>
  );
}

function MoveDialog({ folders, exclude, title, onClose, onPick }: { folders: FolderRow[]; exclude?: Set<number>; title: string; onClose: () => void; onPick: (to: number | null) => void }) {
  const [to, setTo] = useState<number | null | undefined>(undefined);
  const [q, setQ] = useState("");
  const rows: { f: FolderRow; depth: number }[] = [];
  const walk = (pid: number | null, depth: number) => { for (const f of folders.filter((x) => x.parentId === pid)) { if (exclude?.has(f.id)) continue; rows.push({ f, depth }); walk(f.id, depth + 1); } };
  walk(null, 0);
  const shown = q.trim() ? rows.filter((r) => r.f.name.toLowerCase().includes(q.trim().toLowerCase())).map((r) => ({ ...r, depth: 0 })) : rows;
  return (
    <Modal onClose={onClose} width={480}>
      <h3 className="m-0 mb-3 text-lg font-medium tracking-[-0.01em]">{title}</h3>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a folder…"
        className="mb-2 h-9 w-full rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] outline-none focus:border-[var(--st-ink)]" />
      <div className="st-scroll mb-4 max-h-[340px] overflow-y-auto">
        {!q.trim() && (
          <button type="button" onClick={() => setTo(null)} className={cn("mb-0.5 flex h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px]", to === null ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "hover:bg-[var(--st-page)]")}>
            <Folder size={15} />All files (the top)
          </button>
        )}
        {shown.map(({ f, depth }) => (
          <button key={f.id} type="button" onClick={() => setTo(f.id)} onDoubleClick={() => onPick(f.id)}
            className={cn("mb-0.5 flex h-10 w-full items-center gap-2.5 rounded-[10px] pr-2.5 text-left text-[13px]", to === f.id ? "bg-[var(--st-ink)] text-[var(--st-page)]" : "hover:bg-[var(--st-page)]")}
            style={{ paddingLeft: 10 + depth * 18 }}>
            <FolderIcon color={f.color} scale={0.085} /><span className="truncate">{f.name}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN}>Cancel</button>
        <button type="button" disabled={to === undefined} onClick={() => onPick(to ?? null)} className={cn(BTN_DARK, "disabled:opacity-40")}>Move here</button>
      </div>
    </Modal>
  );
}

function Confirm({ title, body, yes, onYes, onClose }: { title: string; body: string; yes: string; onYes: () => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={420}>
      <h3 className="m-0 mb-2 text-lg font-medium tracking-[-0.01em]">{title}</h3>
      <p className="mb-5 text-[13px] leading-relaxed text-[var(--st-sub)]">{body}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN}>Cancel</button>
        <button type="button" autoFocus onClick={onYes} className="inline-flex h-9 items-center rounded-[11px] bg-[var(--st-late)] px-4 text-[13px] font-medium text-white hover:opacity-90">{yes}</button>
      </div>
    </Modal>
  );
}
