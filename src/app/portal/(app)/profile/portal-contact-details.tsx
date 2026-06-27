"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, MapPin, LifeBuoy, Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { portalStaffUpdateContact } from "@/app/portal/actions";

export type ContactDetails = {
  phone: string;
  whatsapp: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

const inputCls =
  "w-full rounded-2xl bg-bg-subtle ring-1 ring-border px-3.5 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

/* Staff self-service: edit only your OWN contact details. Pre-filled from the
 * signed-in person's record; the server action (portalStaffUpdateContact) scopes
 * the write to the caller and only ever touches these five contact columns —
 * never pay, IDs, role or company. Optimistic toast + refresh on save. */
export function PortalContactDetails({ initial }: { initial: ContactDetails }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  // Track edits so we can disable Save when nothing has changed.
  const [values, setValues] = useState<ContactDetails>(initial);
  const dirty = (Object.keys(values) as Array<keyof ContactDetails>).some(
    (k) => values[k].trim() !== initial[k].trim()
  );

  function set<K extends keyof ContactDetails>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    startTransition(async () => {
      const res = await portalStaffUpdateContact({
        phone: values.phone,
        whatsapp: values.whatsapp,
        address: values.address,
        emergencyContactName: values.emergencyContactName,
        emergencyContactPhone: values.emergencyContactPhone,
      });
      setBusy(false);
      if (!res.ok) {
        toast(res.error, { tone: "danger" });
        return;
      }
      toast("Contact details saved.", { tone: "success" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border divide-y divide-border/60">
        <Field
          icon={<Phone size={16} />}
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. +255 7XX XXX XXX"
          value={values.phone}
          onChange={(v) => set("phone", v)}
        />
        <Field
          icon={<MessageCircle size={16} />}
          label="WhatsApp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="If different from your phone"
          value={values.whatsapp}
          onChange={(v) => set("whatsapp", v)}
        />
        <Field
          icon={<MapPin size={16} />}
          label="Address"
          name="address"
          textarea
          autoComplete="street-address"
          placeholder="Where you live"
          value={values.address}
          onChange={(v) => set("address", v)}
        />
        <Field
          icon={<LifeBuoy size={16} />}
          label="Emergency contact"
          name="emergencyContactName"
          autoComplete="name"
          placeholder="Name of someone we can call"
          value={values.emergencyContactName}
          onChange={(v) => set("emergencyContactName", v)}
        />
        <Field
          icon={<Phone size={16} />}
          label="Emergency phone"
          name="emergencyContactPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Their phone number"
          value={values.emergencyContactPhone}
          onChange={(v) => set("emergencyContactPhone", v)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={busy || !dirty}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save changes
        </Button>
        {dirty && !busy && (
          <button
            type="button"
            onClick={() => setValues(initial)}
            className="px-2 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            Undo
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  icon,
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  textarea = false,
}: {
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "tel" | "text";
  autoComplete?: string;
  textarea?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">
        <span className="text-fg-subtle">{icon}</span>
        {label}
      </span>
      {textarea ? (
        <textarea
          name={name}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`${inputCls} resize-none`}
        />
      ) : (
        <input
          name={name}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </label>
  );
}
