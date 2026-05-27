"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, UserPlus, AlertCircle } from "lucide-react";
import { createPerson, updatePerson } from "@/app/people/actions";
import { cn } from "@/lib/cn";

const CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;

type Defaults = Partial<{
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredChannel: string | null;
  role: string | null;
  companyId: number | null;
  managerId: number | null;
  notes: string | null;
}>;

type Result =
  | { ok: true; id?: number }
  | { ok: false; error: string };

export function PersonForm({
  mode,
  id,
  defaults,
  companies,
  peopleList,
  onComplete,
  onCancel,
  compact = false,
}: {
  mode: "create" | "edit";
  /** required when mode === "edit" */
  id?: number;
  defaults?: Defaults;
  companies: Array<{ id: number; name: string }>;
  /** Used for manager dropdown. Excludes the person being edited (can't be own manager). */
  peopleList: Array<{ id: number; name: string; active: boolean }>;
  onComplete?: (result: Result) => void;
  onCancel?: () => void;
  /** Compact mode = tighter spacing for in-drawer rendering. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const action = (fd: FormData) => {
    setError(null);
    start(async () => {
      const res =
        mode === "create"
          ? await createPerson(fd)
          : await updatePerson(id!, fd);
      if (res.ok) {
        onComplete?.(res);
      } else {
        setError(res.error);
        onComplete?.(res);
      }
    });
  };

  // Filter manager candidates: active people, excluding self in edit mode
  const managerCandidates = peopleList.filter(
    (p) => p.active && (mode === "create" || p.id !== id)
  );

  const inputCls = cn(
    "w-full rounded-md border border-border bg-bg-subtle text-sm",
    compact ? "px-2.5 py-1.5" : "px-3 py-2",
    "focus:outline-none focus:border-accent"
  );
  const labelCls = "block text-[11px] uppercase tracking-wider text-fg-muted mb-1";
  const gap = compact ? "space-y-3" : "space-y-4";

  return (
    <form action={action} className={gap}>
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2")}>
        {/* Name (required, full width) */}
        <div className={compact ? "" : "col-span-2"}>
          <label className={labelCls}>Name <span className="text-danger">*</span></label>
          <input
            name="name"
            defaultValue={defaults?.name ?? ""}
            required
            autoFocus={mode === "create"}
            className={inputCls}
            placeholder="Full name"
          />
        </div>

        <div>
          <label className={labelCls}>Role</label>
          <input
            name="role"
            defaultValue={defaults?.role ?? ""}
            className={inputCls}
            placeholder="e.g. Operations Manager"
          />
        </div>

        <div>
          <label className={labelCls}>Company</label>
          <select
            name="companyId"
            defaultValue={defaults?.companyId ? String(defaults.companyId) : ""}
            className={inputCls}
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Email</label>
          <input
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ""}
            className={inputCls}
            placeholder="name@example.com"
          />
        </div>

        <div>
          <label className={labelCls}>Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={defaults?.phone ?? ""}
            className={inputCls}
            placeholder="+254..."
          />
        </div>

        <div>
          <label className={labelCls}>WhatsApp</label>
          <input
            name="whatsapp"
            type="tel"
            defaultValue={defaults?.whatsapp ?? ""}
            className={inputCls}
            placeholder="+254..."
          />
        </div>

        <div>
          <label className={labelCls}>Preferred channel</label>
          <select
            name="preferredChannel"
            defaultValue={defaults?.preferredChannel ?? ""}
            className={inputCls}
          >
            <option value="">—</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className={compact ? "" : "col-span-2"}>
          <label className={labelCls}>Manager</label>
          <select
            name="managerId"
            defaultValue={defaults?.managerId ? String(defaults.managerId) : ""}
            className={inputCls}
          >
            <option value="">— No manager</option>
            {managerCandidates.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className={compact ? "" : "col-span-2"}>
          <label className={labelCls}>Notes</label>
          <textarea
            name="notes"
            defaultValue={defaults?.notes ?? ""}
            rows={2}
            className={inputCls}
            placeholder="Internal notes, escalation preferences, etc."
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : mode === "create" ? (
            <UserPlus size={13} />
          ) : (
            <Save size={13} />
          )}
          {pending ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create person" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
