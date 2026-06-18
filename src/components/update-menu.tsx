"use client";

import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, Pin, PinOff, Trash2, X, Check, RotateCcw } from "lucide-react";
import { editTaskUpdate, deleteTaskUpdate, restoreTaskUpdate, toggleUpdatePin } from "@/app/task/actions";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { Button } from "./ui";

type Props = {
  updateId: number;
  body: string;
  pinned: boolean;
  /** Disables pin action (e.g. on company-wide timelines where pin only matters per-task). */
  showPin?: boolean;
  /** When true, this update is currently soft-deleted — show a Restore button instead of the menu. */
  deleted?: boolean;
};

/**
 * Per-update overflow menu on a timeline item.
 * - Edit: opens inline editor, preserves original body on first save (server side).
 * - Pin / Unpin: toggles tasks_updates.pinned_at; pinned items hoist to top in liftPinnedUpdates.
 * - Delete: soft-delete (sets deleted_at) — hidden from the timeline but kept for
 *   the audit trail and recoverable via restoreTaskUpdate. Confirmed inline.
 *
 * Server actions invalidate /task/[code] and update the latest-update mirror.
 */
export function UpdateMenu({ updateId, body, pinned, showPin = true, deleted = false }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "edit" | "confirmDelete">("menu");
  const [draft, setDraft] = useState(body);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const onRestore = () => {
    start(async () => {
      const res = await restoreTaskUpdate(updateId);
      if (res.ok) toast("Update restored.", { tone: "success" });
      else toast(res.error ?? "Couldn't restore.", { tone: "danger" });
    });
  };

  // Soft-deleted updates only offer Restore (shown in the "Recently removed" surface).
  if (deleted) {
    return (
      <button
        type="button"
        onClick={onRestore}
        disabled={pending}
        className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent disabled:opacity-50"
      >
        <RotateCcw size={12} /> Restore
      </button>
    );
  }

  const close = () => {
    setMode("menu");
    setDraft(body);
    setOpen(false);
  };

  const onEdit = () => {
    setMode("edit");
  };

  const onSaveEdit = () => {
    const next = draft.trim();
    if (!next || next === body) {
      close();
      return;
    }
    start(async () => {
      const res = await editTaskUpdate(updateId, next);
      if (res.ok) {
        toast("Update edited.", { tone: "success" });
        close();
      } else {
        toast(res.error ?? "Couldn't edit.", { tone: "danger" });
      }
    });
  };

  const onPinToggle = () => {
    start(async () => {
      const res = await toggleUpdatePin(updateId);
      if (res.ok) {
        toast(res.pinned ? "Pinned to top." : "Unpinned.", { tone: "success" });
        close();
      } else {
        toast(res.error ?? "Couldn't toggle pin.", { tone: "danger" });
      }
    });
  };

  const onDelete = () => {
    start(async () => {
      const res = await deleteTaskUpdate(updateId);
      if (res.ok) {
        toast("Update removed.", { tone: "success" });
        close();
      } else {
        toast(res.error ?? "Couldn't delete.", { tone: "danger" });
      }
    });
  };

  // Inline edit mode renders directly in place (not in the dropdown popover)
  // so the user has the full timeline card width to work with.
  // The dropdown contains the menu items; the inline edit is a separate UI surface
  // shown when mode === "edit".

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
            aria-label="Update options"
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={4}
            align="end"
            className="z-[60] min-w-[160px] glass-menu rounded-xl p-1 shadow-pill ring-1 ring-border/70 text-sm"
          >
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                onEdit();
              }}
              className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
            >
              <Pencil size={13} /> Edit
            </DropdownMenu.Item>
            {showPin && (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onPinToggle();
                }}
                className="px-2.5 py-1.5 rounded-md flex items-center gap-2 cursor-pointer outline-none data-[highlighted]:bg-bg-muted"
              >
                {pinned ? <><PinOff size={13} /> Unpin</> : <><Pin size={13} /> Pin to top</>}
              </DropdownMenu.Item>
            )}
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
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {mode === "confirmDelete" && (
        <div className="mt-2 -mx-3 -mb-3 px-3 py-2 bg-danger/5 border-t border-danger/20 flex items-center justify-between gap-2 text-xs">
          <span className="text-fg">Remove this update? It is hidden from the timeline but kept on the record, not erased.</span>
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
              onClick={onDelete}
              disabled={pending}
              variant="danger"
              size="sm"
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
            rows={3}
            className={cn(
              "w-full rounded-md border border-border bg-bg-elev px-2.5 py-2 text-sm leading-relaxed",
              "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            )}
          />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-fg-subtle">⌘+Enter to save · Esc to cancel</span>
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
                onClick={onSaveEdit}
                disabled={pending || !draft.trim() || draft.trim() === body}
                size="xs"
              >
                Save edit
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
