"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, UserPlus, AlertCircle, Plus, X } from "lucide-react";
import { createPerson, updatePerson } from "@/app/people/actions";
import { cn } from "@/lib/cn";
import { PERSON_TYPES, PERSON_TYPE_LABELS, PERSON_TYPE_HINTS, normalizePersonType } from "@/lib/person-types";

const CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;

type Association = { companyId: number | ""; relationship: string };

type Defaults = Partial<{
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredChannel: string | null;
  role: string | null;
  companyId: number | null;
  department: string | null;
  startDate: string | null;
  managerId: number | null;
  notes: string | null;
  personType: string | null;
  relatedPersonId: number | null;
  associations: Array<{ companyId: number; relationship: string | null }>;
  // Profile details
  dateOfBirth: string | null;
  nationality: string | null;
  nationalId: string | null;
  passportNo: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  probationEndDate: string | null;
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
  departments = [],
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
  /** Existing department names for the datalist (create-on-the-fly still allowed). */
  departments?: string[];
  onComplete?: (result: Result) => void;
  onCancel?: () => void;
  /** Compact mode = tighter spacing for in-drawer rendering. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pType, setPType] = useState<string>(normalizePersonType(defaults?.personType));
  const [associations, setAssociations] = useState<Association[]>(
    (defaults?.associations ?? []).map((a) => ({ companyId: a.companyId, relationship: a.relationship ?? "" }))
  );

  const addAssociation = () => setAssociations((a) => [...a, { companyId: "", relationship: "" }]);
  const removeAssociation = (i: number) => setAssociations((a) => a.filter((_, idx) => idx !== i));
  const updateAssociation = (i: number, patch: Partial<Association>) =>
    setAssociations((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const action = (fd: FormData) => {
    setError(null);
    // Serialise associations (drop rows with no company selected) into a single JSON field.
    const clean = associations
      .filter((a) => a.companyId !== "")
      .map((a) => ({ companyId: Number(a.companyId), relationship: a.relationship.trim() || null }));
    fd.set("associations", JSON.stringify(clean));
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
    "w-full rounded-lg border border-border bg-bg-subtle/60 text-sm transition-all",
    compact ? "px-2.5 py-1.5" : "px-3 py-2",
    "focus:outline-none focus:ring-2 focus:ring-accent/40"
  );
  const labelCls = "block text-[10px] uppercase tracking-wider text-fg-subtle mb-1";
  const gap = compact ? "space-y-2.5" : "space-y-4";

  return (
    <form action={action} className={gap}>
      <div className="grid gap-2.5 grid-cols-2">
        {/* Name (required, full width) */}
        <div className="col-span-2">
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

        {/* Person type — drives whether this is an employee or an external/expat contact */}
        <div className="col-span-2">
          <label className={labelCls}>Type</label>
          <input type="hidden" name="personType" value={pType} />
          <div className="grid grid-cols-2 gap-1.5">
            {PERSON_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPType(t)}
                title={PERSON_TYPE_HINTS[t]}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs transition-colors text-left",
                  pType === t
                    ? "border-accent bg-accent/10 text-accent font-medium"
                    : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted/60"
                )}
              >
                {PERSON_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Role / Job title</label>
          <input
            name="role"
            defaultValue={defaults?.role ?? ""}
            className={inputCls}
            placeholder="e.g. Operations Manager"
          />
        </div>

        <div>
          <label className={labelCls}>Department</label>
          <input
            name="department"
            list="department-options"
            defaultValue={defaults?.department ?? ""}
            className={inputCls}
            placeholder="e.g. Finance"
          />
          <datalist id="department-options">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={labelCls}>Start date</label>
          <input
            name="startDate"
            type="date"
            defaultValue={defaults?.startDate ?? ""}
            className={inputCls}
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

        <div>
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

        {/* Related person — e.g. an immigration agent ↔ the expat they're helping */}
        <div>
          <label className={labelCls}>Related person</label>
          <select
            name="relatedPersonId"
            defaultValue={defaults?.relatedPersonId ? String(defaults.relatedPersonId) : ""}
            className={inputCls}
          >
            <option value="">— None</option>
            {managerCandidates.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Associated companies — extra company links with a relationship label */}
        <div className="col-span-2">
          <label className={labelCls}>Associated companies</label>
          <div className="space-y-2">
            {associations.length === 0 && (
              <p className="text-xs text-fg-subtle italic">
                None. Use this to link external contacts to the companies they serve.
              </p>
            )}
            {associations.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={row.companyId === "" ? "" : String(row.companyId)}
                  onChange={(e) => updateAssociation(i, { companyId: e.target.value === "" ? "" : Number(e.target.value) })}
                  className={cn(inputCls, "flex-1")}
                >
                  <option value="">— Company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  value={row.relationship}
                  onChange={(e) => updateAssociation(i, { relationship: e.target.value })}
                  className={cn(inputCls, "flex-1")}
                  placeholder="e.g. Insurance broker"
                />
                <button
                  type="button"
                  onClick={() => removeAssociation(i)}
                  title="Remove"
                  className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addAssociation}
              className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity"
            >
              <Plus size={13} /> Add company link
            </button>
          </div>
        </div>

        {/* Profile details — HR master data. All optional; auto-filled from intake where possible. */}
        <div className="col-span-2 mt-1 border-t border-border/60 pt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-2">Profile details</div>
          <div className="grid gap-2.5 grid-cols-2">
            <div>
              <label className={labelCls}>Date of birth</label>
              <input name="dateOfBirth" type="date" defaultValue={defaults?.dateOfBirth ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nationality</label>
              <input name="nationality" defaultValue={defaults?.nationality ?? ""} className={inputCls} placeholder="e.g. Tanzanian" />
            </div>
            <div>
              <label className={labelCls}>National ID (NIDA)</label>
              <input name="nationalId" defaultValue={defaults?.nationalId ?? ""} className={inputCls} placeholder="ID number" />
            </div>
            <div>
              <label className={labelCls}>Passport number</label>
              <input name="passportNo" defaultValue={defaults?.passportNo ?? ""} className={inputCls} placeholder="Passport no." />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Address</label>
              <input name="address" defaultValue={defaults?.address ?? ""} className={inputCls} placeholder="Residential address" />
            </div>
            <div>
              <label className={labelCls}>Emergency contact</label>
              <input name="emergencyContactName" defaultValue={defaults?.emergencyContactName ?? ""} className={inputCls} placeholder="Name" />
            </div>
            <div>
              <label className={labelCls}>Emergency phone</label>
              <input name="emergencyContactPhone" type="tel" defaultValue={defaults?.emergencyContactPhone ?? ""} className={inputCls} placeholder="+255…" />
            </div>
            <div>
              <label className={labelCls}>Probation ends</label>
              <input name="probationEndDate" type="date" defaultValue={defaults?.probationEndDate ?? ""} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="col-span-2">
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
