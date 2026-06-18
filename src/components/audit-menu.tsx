"use client";

import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, X, Check, RotateCcw } from "lucide-react";
import { editAuditReason, deleteAuditEntry, restoreAuditEntry } from "@/app/audit/actions";
import { useToast } from "./toast";
import { Button } from "./ui";
import { cn } from "@/lib/cn";

type Props = {
  entryId: number;
  currentReason: string | null;
  /** When true, this entry is currently soft-deleted — show Restore instead. */
  deleted?: boolean;
};

/**
 * Per-audit-row overflow menu — mirrors UpdateMenu.
 * - Edit reason: opens inline textarea to rewrite change_reason
 *   (old/new values stay immutable — they represent factual history)
 * - Delete: soft-delete with inline confirm
 * - Restore: only visible when entry is currently deleted
 */
export function AuditMenu({ entryId, currentReason, deleted = false }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "edit" | "confirmDelete">("menu");
  const [draft, setDraft] = useState(currentReason ?? "");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const close = () => {
    setMode("menu");
    setDraft(currentReason ?? "");
    setOpen(false);
  };

  const onSaveEdit = () => {
    start(async () => {
      const res = await editAuditReason(entryId, draft);
      if (res.ok) {
        toast("Reason updated.", { tone: "success" });
        close();
      } else {
        toast(res.error ?? "Couldn't edit.", { tone: "danger" });
      }
    });
  };

  const onDelete = () => {
    start(async () => {
      const res = await deleteAuditEntry(entryId);
      if (res.ok) {
        toast("Audit entry removed.", { tone: "success" });
        close();
      } else {
        toast(res.error ?? "Couldn't delete.", { tone: "danger" });
      }
    });
  };

  const onRestore = () => {
    start(async () => {
      const res = await restoreAuditEntry(entryId);
      if (res.ok) {
        toast("Audit entry restored.", { tone: "success" });
        close();
      } else {
        toast(res.error ?? "Couldn't restore.", { tone: "danger" });
      }
    });
  };

  return (
    <>
      <DropdownMenu.Root
        open={open && mode === "menu"}
        onOpenChange={(o) => {
          if (!o) close();
          else setOpen(true);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center h-6 w-6 rounded text-fg-subtle hover:text-fg hover:bg-bg-muted opacity-70 hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label="Audit entry options"
          >
            <MoreHorizontal size={13} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={4}
            align="end"
            className="z-[60] min-w-[160px] glass-menu rounded-xl p-1 shadow-pill ring-1 ring-border/70 text-sm"
          >
            {deleted ? (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onRestore();
                }}
                className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted text-success"
              >
                <RotateCcw size={13} /> Restore
              </DropdownMenu.Item>
            ) : (
              <>
                <DropdownMenu.Item
                  onSelect={(e) => {
                    e.preventDefault();
                    setMode("edit");
                  }}
                  className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
                >
                  <Pencil size={13} /> Edit reason
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-border my-1" />
                <DropdownMenu.Item
                  onSelect={(e) => {
                    e.preventDefault();
                    setMode("confirmDelete");
                  }}
                  className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none text-danger data-[highlighted]:bg-danger-soft"
                >
                  <Trash2 size={13} /> Delete
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {mode === "confirmDelete" && (
        <div className="mt-2 -mx-3 -mb-3 px-3 py-2 bg-danger/5 border-t border-danger/20 flex items-center justify-between gap-2 text-xs">
          <span className="text-fg">Delete this audit entry? It is hidden, not erased — recoverable via Restore.</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
            >
              <X size={12} className="inline" /> Cancel
            </button>
            <Button
              type="button"
              variant="danger"
              size="xs"
              onClick={onDelete}
              disabled={pending}
            >
              <Check size={12} className="inline" /> Confirm
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <div className="mt-2 space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") close();
            }}
            rows={2}
            placeholder="Why was this changed?"
            className={cn(
              "w-full rounded-md border border-border bg-bg-elev px-2.5 py-2 text-sm leading-relaxed",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            )}
          />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-fg-subtle">⌘+Enter to save · empty to clear · Esc to cancel</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
              >
                Cancel
              </button>
              <Button
                type="button"
                size="xs"
                onClick={onSaveEdit}
                disabled={pending || draft.trim() === (currentReason ?? "").trim()}
              >
                Save reason
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
