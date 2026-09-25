"use client";
/**
 * The preview (mockup: the dark full-screen viewer). The file itself in the
 * middle — a PDF in the browser's own viewer, a picture as a picture, a Word
 * file as readable text — with ← → through the list you opened it from, and
 * its details on the right, editable: expiry, reminder, type, reference,
 * issuer, notes. Nothing downloads to be looked at.
 */
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, Link2, Loader2, PenLine, FolderInput, Star, Trash2, X, ExternalLink, CalendarClock, Sparkles } from "lucide-react";
import { FileIcon, ExpiryPill, addedBy, when } from "./file-bits";
import { displayName, fmtSize, kindOf, type FileRow, type FolderRow, pathOf } from "@/lib/files-shared";
import { saveFileDetailsAction, readFileDetailsAction } from "@/app/files/actions";
import { renewDocumentAction } from "@/app/documents/actions";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";

const BTN = "inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#2E3035] px-3 text-[13px] text-[#E6E6E3] transition-colors hover:bg-[#1F2023]";
const FIELD = "h-9 w-full rounded-[10px] px-3 text-[13px] outline-none [color-scheme:dark]";
/* Inline, because the global field rule and `.studio`'s colour are unlayered
   CSS and beat utility classes — they turned these boxes white and the text on
   this dark viewer dark (found on the first live look). */
const DARK_FIELD = { background: "#141517", color: "#F2F2F0", border: "1px solid #2E3035", boxShadow: "none" } as const;

/** `review` = "Check the details" after an upload: each new file is read by
 *  the AI as it comes up, the boxes fill, and NOTHING is saved until the owner
 *  presses Save & next (or Skip). The details panel shows on a phone too. */
/** `readOnly` — a director: look and download, no changes (see FilesApp). */
export function FilePreview({ list, startId, folders, onClose, onRename, onMove, onStar, onDelete, onSaved, review = false, readOnly = false }: {
  readOnly?: boolean;
  list: FileRow[];
  startId: number;
  folders: FolderRow[];
  onClose: () => void;
  onRename: (f: FileRow) => void;
  onMove: (f: FileRow) => void;
  onStar: (f: FileRow) => void;
  onDelete: (f: FileRow) => void;
  onSaved: () => void;
  review?: boolean;
}) {
  const [i, setI] = useState(() => Math.max(0, list.findIndex((f) => f.id === startId)));
  // What was saved here, laid over the list — the list is a snapshot, and
  // stepping back to a file must show what was just saved, not what it was.
  const [saved, setSaved] = useState<Record<number, Partial<FileRow>>>({});
  const [readIds] = useState(() => new Set<number>());
  const base = list[Math.min(i, list.length - 1)];
  const f = base ? { ...base, ...saved[base.id] } : base;
  const { toast } = useToast();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === "ArrowRight") setI((n) => (n + 1) % list.length);
      if (e.key === "ArrowLeft") setI((n) => (n - 1 + list.length) % list.length);
    };
    window.addEventListener("keydown", key, true);
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key, true); document.body.style.overflow = body; };
  }, [list.length, onClose]);

  if (!f) return null;
  const kind = kindOf(f.ext);
  const src = `/api/files/${f.id}`;
  const place = [f.companyName, f.personName].filter(Boolean).join(" · ") || "Not filed to a company";
  const trail = f.folderId ? pathOf(folders, f.folderId).map((x) => x.name).join(" / ") : "All files";

  return (
    <div className="studio fixed inset-0 z-[80] grid grid-rows-[60px_minmax(0,1fr)] bg-[rgba(14,15,16,0.95)]" style={{ color: "#F2F2F0" }} role="dialog" aria-label={`Preview of ${displayName(f)}`}>
      <div className="flex min-w-0 items-center gap-2.5 border-b border-[#26282C] px-4">
        <FileIcon ext={f.ext} size={26} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName(f)}</div>
          <div className="truncate text-xs text-[#B4B7BC]">{review ? <span className="text-[#F2F2F0]">Check the details · </span> : null}{place} · {fmtSize(f.size)} · {i + 1} of {list.length}</div>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          {!readOnly && <button type="button" className={BTN} onClick={() => onRename(f)}><PenLine size={14} />Rename</button>}
          {!readOnly && <button type="button" className={BTN} onClick={() => onMove(f)}><FolderInput size={14} />Move</button>}
          <button type="button" className={BTN} onClick={() => { void navigator.clipboard.writeText(`${location.origin}/files?open=${f.id}`).then(() => toast("Link copied — it opens for anyone signed in to Oracle as the owner.", { tone: "success" })).catch(() => toast("Couldn't copy the link.", { tone: "danger" })); }}><Link2 size={14} />Copy link</button>
          {!readOnly && <button type="button" className={cn(BTN, f.starred && "text-[#F5B94E]")} onClick={() => onStar(f)} aria-label={f.starred ? "Unstar" : "Star"}><Star size={14} fill={f.starred ? "currentColor" : "none"} /></button>}
          {!readOnly && <button type="button" className={cn(BTN, "text-[#F07BBE]")} onClick={() => onDelete(f)} aria-label="Delete"><Trash2 size={14} /></button>}
        </div>
        <a href={`${src}?dl=1`} className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[#F2F2F0] px-3 text-[13px] font-semibold text-[#111214] hover:opacity-90"><Download size={14} />Download</a>
        <button type="button" className={BTN} onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>

      <div className={cn("grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1", review && "grid-rows-[minmax(0,38%)_minmax(0,1fr)]")}>
        <div className="relative flex min-h-0 items-center justify-center p-4 sm:px-16 sm:py-6">
          {!f.hasFile ? (
            <Empty text="No file is stored for this one — only its details." />
          ) : kind === "pdf" ? (
            <iframe key={f.id} title={displayName(f)} src={src} className="h-full w-full max-w-[980px] rounded-lg bg-white shadow-[0_30px_80px_rgba(0,0,0,0.5)]" />
          ) : kind === "image" && f.ext !== "heic" && f.ext !== "heif" && f.ext !== "tiff" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={src} alt={displayName(f)} className="max-h-full max-w-full rounded-lg object-contain shadow-[0_30px_80px_rgba(0,0,0,0.5)]" />
          ) : kind === "word" && f.ext === "docx" ? (
            <WordFrame key={f.id} id={f.id} title={displayName(f)} />
          ) : (
            <Empty text={`${f.ext ? f.ext.toUpperCase() + " files" : "This file"} can't be shown here — download it to open it.`} action={<a href={`${src}?dl=1`} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#F2F2F0] px-3.5 text-[13px] font-semibold text-[#111214]"><Download size={14} />Download</a>} />
          )}
          {list.length > 1 && (
            <>
              <button type="button" aria-label="Previous" onClick={() => setI((n) => (n - 1 + list.length) % list.length)} className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#2E3035] bg-[#141517] hover:bg-[#1F2023] sm:flex"><ChevronLeft size={18} /></button>
              <button type="button" aria-label="Next" onClick={() => setI((n) => (n + 1) % list.length)} className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#2E3035] bg-[#141517] hover:bg-[#1F2023] sm:flex"><ChevronRight size={18} /></button>
            </>
          )}
        </div>
        <Details key={f.id} f={f} trail={trail} review={review} readOnly={readOnly} last={i >= list.length - 1}
          autoRead={review && !readIds.has(f.id)} onRead={() => readIds.add(f.id)}
          onSaved={(v) => { setSaved((m) => ({ ...m, [f.id]: { ...m[f.id], ...v } })); onSaved(); }}
          onNext={() => (i >= list.length - 1 ? onClose() : setI(i + 1))} />
      </div>
    </div>
  );
}

/** A Word file as readable text. Fetched and shown through `srcDoc`, not
 *  `src`: every Oracle page carries X-Frame-Options: DENY, which would refuse to
 *  frame our own converted page. Sandboxed with scripts off. */
function WordFrame({ id, title }: { id: number; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/files/${id}?as=html`).then((r) => (r.ok ? r.text() : Promise.reject())).then((t) => { if (live) setHtml(t); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  if (failed) return <Empty text="This Word file couldn't be read — download it to open it." />;
  if (html == null) return <Loader2 size={20} className="animate-spin text-[#B4B7BC]" />;
  return <iframe title={title} srcDoc={html} sandbox="" className="h-full w-full max-w-[860px] rounded-lg bg-white shadow-[0_30px_80px_rgba(0,0,0,0.5)]" />;
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex max-w-[360px] flex-col items-center text-center">
      <FileIcon ext="" size={52} />
      <p className="mt-4 text-[13px] text-[#D4D6DA]">{text}</p>
      {action}
    </div>
  );
}

function Details({ f, trail, onSaved, review = false, readOnly = false, last = false, autoRead = false, onRead, onNext }: {
  readOnly?: boolean;
  f: FileRow; trail: string; onSaved: (v: Partial<FileRow>) => void;
  review?: boolean; last?: boolean; autoRead?: boolean; onRead?: () => void; onNext?: () => void;
}) {
  const { toast } = useToast();
  const [d, setD] = useState({ expiryDate: f.expiryDate ?? "", issueDate: f.issueDate ?? "", reminderLeadDays: f.reminderLeadDays, docType: f.docType ?? "", referenceNo: f.referenceNo ?? "", issuer: f.issuer ?? "", notes: f.notes ?? "" });
  const dRef = useRef(d);
  dRef.current = d;
  const [dirty, setDirty] = useState(false);
  const [saving, start] = useTransition();
  const set = (p: Partial<typeof d>) => { setD((x) => ({ ...x, ...p })); setDirty(true); };
  const save = (andNext = false) => start(async () => {
    if (!dirty) { if (andNext) onNext?.(); return; }
    const v = { ...d, expiryDate: d.expiryDate || null, issueDate: d.issueDate || null, docType: d.docType || null, referenceNo: d.referenceNo || null, issuer: d.issuer || null, notes: d.notes || null };
    const r = await saveFileDetailsAction(f.id, v);
    if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
    if (!andNext) toast("Details saved.", { tone: "success" });
    setDirty(false); onSaved(v);
    if (andNext) onNext?.();
  });
  // Read it for me: the AI suggests, the boxes fill, nothing is saved until
  // the owner presses Save. Only empty boxes are filled — never over his typing.
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const read = async () => {
    setReading(true); setReadNote(null); onRead?.();
    const r = await readFileDetailsAction(f.id).catch(() => ({ ok: false, fields: {}, note: "Couldn't reach the reader." }) as Awaited<ReturnType<typeof readFileDetailsAction>>);
    // Moved on to the next file while this one was being read — say nothing.
    if (!live.current) return;
    setReading(false);
    const got = r.fields ?? {};
    // Only EMPTY boxes — whatever is already there, or he typed while it was
    // reading, stays. Read from the ref: `d` here is the value from before the
    // wait. (Computing this inside a setState updater looked neater and was
    // wrong — React runs the updater later, so the count came out 0 and the
    // filled boxes were never marked unsaved.)
    const cur = dRef.current;
    const fill: Partial<typeof d> = {};
    if (!cur.expiryDate && got.expiryDate) fill.expiryDate = got.expiryDate;
    if (!cur.issueDate && got.issueDate) fill.issueDate = got.issueDate;
    if (!cur.docType && got.docType) fill.docType = got.docType;
    if (!cur.referenceNo && got.referenceNo) fill.referenceNo = got.referenceNo;
    if (!cur.issuer && got.issuer) fill.issuer = got.issuer;
    if (!cur.notes && got.notes) fill.notes = got.notes;
    const n = Object.keys(fill).length;
    if (n) set(fill);
    const msg = n ? `Filled ${n} ${n === 1 ? "box" : "boxes"} — check them, then Save.` : r.note || "Nothing new to fill in.";
    if (review) setReadNote(msg); else toast(msg, { tone: n ? "success" : "default" });
  };
  // Once, as the file comes up. The ref (not the effect) is the guard: React
  // runs an effect twice in development, and each run is a paid AI call.
  const started = useRef(false);
  useEffect(() => { if (autoRead && f.hasFile && !started.current) { started.current = true; void read(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const renew = () => start(async () => {
    const r = await renewDocumentAction(f.id);
    toast(r.ok ? "Renewal task raised — due on the expiry date." : r.error, { tone: r.ok ? "success" : "danger" });
    if (r.ok) onSaved({});
  });
  const L = "mb-1 block text-xs text-[#B4B7BC]";
  return (
    <aside className={cn("min-h-0 flex-col gap-4 overflow-y-auto border-[#26282C] p-5 lg:flex lg:border-l", review ? "flex border-t lg:border-t-0" : "hidden")}>
      {review && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#2E3035] bg-[#141517] px-3 py-2.5 text-[13px]">
          {reading ? <Loader2 size={14} className="shrink-0 animate-spin text-[#B4B7BC]" /> : <Sparkles size={14} className="shrink-0 text-[#9DB4FF]" />}
          <span className={reading ? "text-[#D4D6DA]" : ""}>{reading ? "Reading the file…" : readNote ?? "Check the boxes, then Save & next."}</span>
        </div>
      )}
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
        <span className="text-[#B4B7BC]">Company</span><span className="truncate">{f.companyName ?? "—"}</span>
        <span className="text-[#B4B7BC]">Person</span><span className="truncate">{f.personName ?? "—"}</span>
        <span className="text-[#B4B7BC]">Folder</span><span className="truncate" title={trail}>{trail}</span>
        <span className="text-[#B4B7BC]">Added</span><span className="truncate">{addedBy(f.createdBy)} · {when(f.createdAt)}</span>
        <span className="text-[#B4B7BC]">Changed</span><span>{when(f.updatedAt)}</span>
        {f.expiryDate && <><span className="text-[#B4B7BC]">Status</span><span><ExpiryPill f={f} /></span></>}
      </div>
      <div className="h-px shrink-0 bg-[#26282C]" />
      {readOnly ? (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
          {([["Expires", f.expiryDate], ["Issued", f.issueDate], ["Type", f.docType], ["Reference", f.referenceNo], ["Issued by", f.issuer], ["Notes", f.notes]] as const)
            .filter(([, val]) => val)
            .map(([k, val]) => <Fragment key={k}><span className="text-[#B4B7BC]">{k}</span><span className="whitespace-pre-wrap break-words">{val}</span></Fragment>)}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-3">
        <label><span className={L}>Expires</span><input type="date" style={DARK_FIELD} className={FIELD} value={d.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} /></label>
        <label><span className={L}>Remind (days before)</span><input type="number" min={0} max={365} style={DARK_FIELD} className={FIELD} value={d.reminderLeadDays} onChange={(e) => set({ reminderLeadDays: Number(e.target.value) })} /></label>
        <label><span className={L}>Issued</span><input type="date" style={DARK_FIELD} className={FIELD} value={d.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></label>
        <label><span className={L}>Type</span><input style={DARK_FIELD} className={FIELD} value={d.docType} placeholder="e.g. Trade licence" onChange={(e) => set({ docType: e.target.value })} /></label>
        <label><span className={L}>Reference no.</span><input style={DARK_FIELD} className={FIELD} value={d.referenceNo} onChange={(e) => set({ referenceNo: e.target.value })} /></label>
        <label><span className={L}>Issued by</span><input style={DARK_FIELD} className={FIELD} value={d.issuer} placeholder="e.g. BRELA" onChange={(e) => set({ issuer: e.target.value })} /></label>
        <label className="col-span-2"><span className={L}>Notes</span><textarea rows={3} style={DARK_FIELD} className={cn(FIELD, "h-auto py-2")} value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        {review ? (
          <>
            <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#F2F2F0] px-3.5 text-[13px] font-semibold text-[#111214] disabled:opacity-35">
              {saving && <Loader2 size={13} className="animate-spin" />}{last ? "Save & finish" : "Save & next"}
            </button>
            <button type="button" disabled={saving} onClick={onNext} className={BTN}>{last ? "Finish" : "Skip"}</button>
          </>
        ) : (
          <button type="button" disabled={!dirty || saving} onClick={() => save()} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#F2F2F0] px-3.5 text-[13px] font-semibold text-[#111214] disabled:opacity-35">
            {saving && <Loader2 size={13} className="animate-spin" />}{dirty ? "Save details" : "Saved"}
          </button>
        )}
        {f.hasFile && <button type="button" disabled={reading} onClick={() => void read()} className={BTN} title="The AI reads the file and fills the empty boxes — nothing is saved until you press Save">{reading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{reading ? "Reading…" : "Read it for me"}</button>}
        {f.expiryDate && <button type="button" disabled={saving} onClick={renew} className={BTN}><CalendarClock size={14} />Make a renewal task</button>}
      </div>
      </>
      )}
      {f.companyId && (
        <a href={`/companies/${f.companyId}`} className="inline-flex items-center gap-1.5 text-xs text-[#D4D6DA] hover:text-[#F2F2F0]"><ExternalLink size={12} />{f.companyName}</a>
      )}
    </aside>
  );
}
