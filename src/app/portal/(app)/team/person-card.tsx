"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Panel } from "@/components/surface-kit";
import { Button } from "@/components/ui";
import { Phone, MessageCircle, Mail, ArrowUpRight, Loader2, Check } from "lucide-react";
import { useToast } from "@/components/toast";
import { TeamTaskList, type TeamTask } from "./team-task-list";
import { portalSendReminderEmail, portalSendTaskSummaryWhatsApp } from "@/app/portal/actions";

const ICON = "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full transition-transform active:scale-90";
const ICON_OFF = `${ICON} bg-bg-subtle/50 text-fg-subtle/40`;

export type TeamPerson = {
  id: number;
  name: string;
  role: string | null;
  company: string | null;
  open: number;
  overdue: number;
  hasEmail: boolean;
  callHref: string | null;
  mailtoHref: string | null;
  contactWaHref: string | null;
  details: TeamTask[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** One person, merged: identity + contact/reminder icons + profile on top, their
 *  open tasks below (no chevron — always shown). The WhatsApp/email icons send the
 *  task summary/reminder when the person has open tasks, otherwise open a plain chat
 *  / email. */
export function PersonCard({ p }: { p: TeamPerson }) {
  const { toast } = useToast();
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [busy, start] = useTransition();
  const hasTasks = p.details.length > 0;
  const first = p.name.split(" ")[0];

  const whatsapp = () => {
    if (hasTasks) {
      // Open a blank tab synchronously inside the tap so mobile browsers don't block
      // it; we set its location once the server returns the deep-link.
      const win = window.open("", "_blank");
      start(async () => {
        const res = await portalSendTaskSummaryWhatsApp(p.id);
        if (!res.ok) { win?.close(); toast(res.error, { tone: "warn" }); return; }
        if (res.waHref) {
          if (win) win.location.href = res.waHref;
          else window.open(res.waHref, "_blank", "noreferrer");
          setWaSent(true);
          toast(`WhatsApp summary ready for ${first}.`, { tone: "success" });
        } else {
          win?.close();
          toast(`No WhatsApp number for ${first}.`, { tone: "warn" });
        }
      });
    } else if (p.contactWaHref) {
      window.open(p.contactWaHref, "_blank", "noreferrer");
    } else {
      toast(`No WhatsApp number for ${first}.`, { tone: "warn" });
    }
  };

  const sendEmail = () =>
    start(async () => {
      const res = await portalSendReminderEmail(p.id, note.trim() || undefined);
      if (res.ok) {
        setEmailSent(true);
        setEmailOpen(false);
        toast(`Reminder emailed to ${first}.`, { tone: "success" });
        return;
      }
      const msg =
        res.reason === "no-tasks" ? "No open tasks to remind about."
        : res.reason === "no-email" ? "No email address on file."
        : res.reason === "not-configured" ? "Email sending isn't switched on."
        : res.error || "Couldn't send the reminder.";
      toast(msg, { tone: "warn" });
    });

  const waActive = hasTasks || !!p.contactWaHref;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center gap-3 p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{initials(p.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.name}</p>
          <p className="truncate text-[11px] text-fg-muted">
            {[p.role, p.company].filter(Boolean).join(" · ") || "—"}
            {hasTasks ? (
              <>
                {" · "}{p.open} open{p.overdue > 0 && <span className="text-danger"> · {p.overdue} overdue</span>}
              </>
            ) : (
              <span className="text-fg-subtle"> · No open tasks</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {p.callHref ? (
            <a href={p.callHref} title={`Call ${first}`} className={`${ICON} bg-bg-subtle text-fg-muted`}><Phone size={15} /></a>
          ) : (
            <span title="No phone on file" className={ICON_OFF}><Phone size={15} /></span>
          )}

          {waActive ? (
            <button type="button" onClick={whatsapp} disabled={busy} title={hasTasks ? `WhatsApp reminder to ${first}` : `WhatsApp ${first}`} aria-label={hasTasks ? `WhatsApp reminder to ${first}` : `WhatsApp ${first}`} className={`${ICON} bg-success-soft text-success disabled:opacity-50`}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : waSent ? <Check size={15} /> : <MessageCircle size={15} />}
            </button>
          ) : (
            <span title="No WhatsApp number on file" className={ICON_OFF}><MessageCircle size={15} /></span>
          )}

          {p.hasEmail ? (
            hasTasks ? (
              <button type="button" onClick={() => setEmailOpen((o) => !o)} title={`Email reminder to ${first}`} aria-label={`Email reminder to ${first}`} className={`${ICON} ${emailOpen ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent"}`}>
                {emailSent ? <Check size={15} /> : <Mail size={15} />}
              </button>
            ) : (
              <a href={p.mailtoHref ?? "#"} title={`Email ${first}`} className={`${ICON} bg-accent-soft text-accent`}><Mail size={15} /></a>
            )
          ) : (
            <span title="No email address on file" className={ICON_OFF}><Mail size={15} /></span>
          )}

          <Link href={`/portal/people/${p.id}`} title={`Open ${first}'s profile`} aria-label={`Open ${first}'s profile`} className={`${ICON} bg-accent text-accent-fg`}><ArrowUpRight size={16} /></Link>
        </div>
      </div>

      {emailOpen && hasTasks && p.hasEmail && (
        <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a personal line (optional) — appears at the top of the email"
            className="w-full min-h-[54px] rounded-lg border border-border bg-bg-elev p-2 font-sans text-xs leading-relaxed text-fg focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={sendEmail} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} {busy ? "Sending…" : "Send reminder"}
            </Button>
            <button type="button" onClick={() => setEmailOpen(false)} className="text-xs text-fg-subtle hover:text-fg">Cancel</button>
          </div>
        </div>
      )}

      {hasTasks && (
        <div className="border-t border-border/50 px-3 pb-3 pt-3">
          <TeamTaskList items={p.details} />
        </div>
      )}
    </Panel>
  );
}
