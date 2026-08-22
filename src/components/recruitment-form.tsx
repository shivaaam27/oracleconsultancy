"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ONE FORM, for creating and for editing.
//
// Driven by the field specs in `lib/recruitment-fields.ts`, so the "New client"
// panel and the client record are the same form and cannot drift. ERPNext works
// the same way, and for the same reason.
//
// ⚠️ NOTHING IS PRE-FILLED. Every box starts empty and stays empty until it is
// typed into — the rule the Projects form already follows. A default the owner
// did not choose is indistinguishable, a year later, from a figure they did.
//
// ⚠️ NO NATIVE <select> ANYWHERE. `FluidSelect` is the house control; the OS
// popup ignores the app's styling and mis-renders (CLAUDE.md).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect } from "./fluid-select";
import { Switch } from "./ui";
import type { FormGroup, FormField } from "@/lib/recruitment-fields";

export type FormValues = Record<string, string | boolean | null>;

/** An ISO timestamp trimmed to what an `<input type="date">` will accept. */
export function dateValue(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : "";
}

export function RecruitmentForm({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  /** Options that are only known at run time — the client list, say. */
  dynamicOptions,
  footNote,
}: {
  groups: FormGroup[];
  initial: FormValues;
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
  footNote?: ReactNode;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (key: string, v: string | boolean | null) => {
    setValues((s) => ({ ...s, [key]: v }));
    setSaved(false);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const missing = groups
          .flatMap((g) => g.fields)
          .find((f) => f.required && !String(values[f.key] ?? "").trim());
        if (missing) {
          setError(`${missing.label} is needed.`);
          return;
        }
        start(async () => {
          const res = await onSubmit(values);
          if (!res.ok) setError(res.error ?? "Couldn't save.");
          else { setError(null); setSaved(true); }
        });
      }}
    >
      {groups.map((g) => (
        <section key={g.id} className="overflow-hidden rounded-lg border border-border bg-bg-elev">
          <div className="border-b border-border bg-bg-subtle px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{g.title}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-2">
            {g.fields.map((f) => (
              <Field
                key={f.key}
                field={f}
                value={values[f.key]}
                options={f.options ?? dynamicOptions?.[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60"
        >
          {pending && <Loader2 size={13} className="animate-spin" />} {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-bg-muted"
          >
            Cancel
          </button>
        )}
        {saved && !pending && <span className="text-xs text-success">Saved.</span>}
        {footNote && <span className="text-xs text-fg-subtle">{footNote}</span>}
      </div>
    </form>
  );
}

function Field({
  field: f, value, options, onChange,
}: {
  field: FormField;
  value: string | boolean | null | undefined;
  options?: { value: string; label: string }[];
  onChange: (v: string | boolean | null) => void;
}) {
  const label = (
    <span className="mb-1 block text-xs uppercase tracking-[0.04em] text-fg-subtle">
      {f.label}{f.required && <span className="ml-0.5 text-danger">*</span>}
    </span>
  );
  const hint = f.hint ? <span className="mt-0.5 block text-xs text-fg-subtle">{f.hint}</span> : null;
  const box = "h-8 w-full rounded-md border border-border bg-bg px-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent";

  if (f.kind === "toggle") {
    /* `Switch` is presentational and `aria-hidden` — the button around it owns
       the click and the accessible state, exactly as `SwitchRow` does. */
    return (
      <div className={cn("min-w-0", f.full && "sm:col-span-2")}>
        {label}
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          aria-label={f.label}
          onClick={() => onChange(!value)}
          className="flex h-8 items-center gap-2 text-base text-fg-muted"
        >
          <Switch on={!!value} size="sm" />
          <span>{value ? "Yes" : "No"}</span>
        </button>
        {hint}
      </div>
    );
  }

  if (f.kind === "select") {
    /* An optional select needs a way BACK to blank, or a mis-click is permanent. */
    const opts = [{ value: "", label: f.required ? "Choose…" : "—" }, ...(options ?? [])];
    return (
      <label className={cn("block min-w-0", f.full && "sm:col-span-2")}>
        {label}
        <FluidSelect
          value={String(value ?? "")}
          options={opts}
          onSelect={(v: string) => onChange(v || null)}
          placeholder="Choose…"
          className="w-full"
          buttonClassName="h-8 w-full justify-between"
        />
        {hint}
      </label>
    );
  }

  if (f.kind === "textarea") {
    return (
      <label className={cn("block min-w-0", f.full && "sm:col-span-2")}>
        {label}
        <textarea
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
        />
        {hint}
      </label>
    );
  }

  const type =
    f.kind === "date" ? "date" :
    f.kind === "email" ? "email" :
    f.kind === "tel" ? "tel" :
    f.kind === "number" || f.kind === "money" ? "text" : "text";

  return (
    <label className={cn("block min-w-0", f.full && "sm:col-span-2")}>
      {label}
      <input
        type={type}
        inputMode={f.kind === "number" || f.kind === "money" ? "decimal" : undefined}
        value={String(value ?? "")}
        placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(box, (f.kind === "money" || f.kind === "number") && "tabular")}
      />
      {hint}
    </label>
  );
}
