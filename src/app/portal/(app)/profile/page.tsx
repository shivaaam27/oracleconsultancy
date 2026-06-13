import { Bell, FileCheck2, LogOut, Settings2, UserRound, CalendarDays, Route as RouteIcon, Package, CheckCircle2, Circle } from "lucide-react";
import { DevicePushToggle } from "@/components/device-push-toggle";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { AccessibilityControls } from "@/components/portal-prefs";
import { PortalDocuments, type PortalChecklistItem } from "@/components/portal-documents";
import { PortalLeave } from "@/components/portal-leave";
import { PortalAttendance } from "@/components/portal-attendance";
import { personAttendanceWeek } from "@/lib/attendance";
import { PasskeyManager } from "@/components/passkey-manager";
import { listCredentials } from "@/lib/webauthn";
import { staffBeginPasskey, staffFinishPasskey, staffRemovePasskey } from "@/app/portal/passkey-actions";
import { Clock, ScanFace } from "lucide-react";
import { getPortalPerson } from "@/lib/portal-auth";
import { getPersonChecklist } from "@/lib/requirements";
import { personLeaveBalances, listLeaveRequests } from "@/lib/leave";
import { getJourney } from "@/lib/onboarding";
import { assetsForPerson } from "@/lib/assets";
import { staffIdFor } from "@/lib/staff-id";
import { portalLogout } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PortalProfile() {
  const me = (await getPortalPerson())!;

  let companyName: string | null = null;
  if (me.companyId) {
    const { data } = await sb.from("companies").select("name").eq("id", me.companyId).maybeSingle();
    companyName = (data?.name as string | null) ?? null;
  }
  const staffId = await staffIdFor(me.id);

  // The person's document-compliance checklist (auto-links + scores server-side).
  const checklist = await getPersonChecklist(me.id);
  const docItems: PortalChecklistItem[] = (checklist?.items ?? []).map((it) => ({
    id: it.id,
    label: it.label,
    mandatory: it.mandatory,
    effectiveStatus: it.effectiveStatus,
    documentTitle: it.documentTitle,
    expiryLabel: it.expiryLabel,
  }));

  const [leaveBalances, leaveRequests, journey, equipment, attendance] = await Promise.all([
    personLeaveBalances(me.id),
    listLeaveRequests({ personId: me.id }),
    getJourney(me.id, "onboarding"),
    assetsForPerson(me.id),
    personAttendanceWeek(me.id),
  ]);
  const passkeys = await listCredentials({ kind: "person", id: me.id, name: me.name });

  const details: Array<{ label: string; value: string }> = [
    { label: "Name", value: me.name },
    ...(staffId ? [{ label: "Staff ID", value: staffId }] : []),
    ...(me.role ? [{ label: "Role", value: me.role }] : []),
    ...(me.email ? [{ label: "Email", value: me.email }] : []),
    ...(companyName ? [{ label: "Company", value: companyName }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Reveal delay={0}>
        <Hero title={me.name} subtitle="Your profile and viewing preferences.">
          <Badge tone="info">{me.portalRole === "manager" ? "Manager access" : "Staff access"}</Badge>
        </Hero>
      </Reveal>

      <Reveal delay={0.05} className="flex flex-col gap-2.5">
        <SectionLabel icon={<UserRound size={13} />}>Your details</SectionLabel>
        <Panel className="divide-y divide-border">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">{d.label}</span>
              <span className="text-sm text-right">{d.value}</span>
            </div>
          ))}
        </Panel>
        <p className="px-1 text-[11px] text-fg-subtle">
          Need a detail changed? Ask your administrator — these come from your HR record.
        </p>
      </Reveal>

      {docItems.length > 0 && (
        <Reveal delay={0.08} className="flex flex-col gap-2.5">
          <SectionLabel icon={<FileCheck2 size={13} />}>Your documents</SectionLabel>
          <PortalDocuments items={docItems} score={checklist?.score ?? 0} />
          <p className="px-1 text-[11px] text-fg-subtle">
            Upload anything we still need. Your administrator checks and confirms each one.
          </p>
        </Reveal>
      )}

      <Reveal delay={0.085} className="flex flex-col gap-2.5">
        <SectionLabel icon={<Clock size={13} />}>Your attendance</SectionLabel>
        <PortalAttendance days={attendance.days} todayEditable={attendance.todayEditable} lockReason={attendance.lockReason} />
        <p className="px-1 text-[11px] text-fg-subtle">Check in each day. Your manager can adjust this if needed.</p>
      </Reveal>

      {leaveBalances.length > 0 && (
        <Reveal delay={0.09} className="flex flex-col gap-2.5">
          <SectionLabel icon={<CalendarDays size={13} />}>Your leave</SectionLabel>
          <PortalLeave balances={leaveBalances} requests={leaveRequests} />
          <p className="px-1 text-[11px] text-fg-subtle">Request leave here — your manager reviews and approves it.</p>
        </Reveal>
      )}

      {journey && journey.total > 0 && (
        <Reveal delay={0.11} className="flex flex-col gap-2.5">
          <SectionLabel icon={<RouteIcon size={13} />}>Your onboarding</SectionLabel>
          <Panel className="overflow-hidden p-0">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{journey.completed} of {journey.total} steps done</div>
                <div className="mt-1.5 h-1.5 rounded-full bg-bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${journey.percent}%` }} />
                </div>
              </div>
              <Badge tone={journey.percent === 100 ? "success" : "info"}>{journey.percent}%</Badge>
            </div>
            <ul className="divide-y divide-border/50">
              {journey.steps.slice(0, 12).map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 px-4 py-2">
                  {s.done ? <CheckCircle2 size={14} className="text-success shrink-0" /> : <Circle size={14} className="text-fg-subtle shrink-0" />}
                  <span className={`min-w-0 flex-1 text-xs truncate ${s.done ? "text-fg-subtle line-through" : ""}`}>{s.label}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="px-1 text-[11px] text-fg-subtle">Your administrator ticks these off as they’re completed.</p>
        </Reveal>
      )}

      {equipment.length > 0 && (
        <Reveal delay={0.12} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Package size={13} />}>Your equipment</SectionLabel>
          <Panel className="divide-y divide-border/50 p-0">
            {equipment.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Package size={14} className="text-fg-subtle shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{a.name}</span>
                  <span className="block text-[11px] text-fg-subtle truncate">{[a.category, a.brand, a.tag].filter(Boolean).join(" · ") || "Assigned to you"}</span>
                </span>
              </div>
            ))}
          </Panel>
          <p className="px-1 text-[11px] text-fg-subtle">Company equipment currently assigned to you.</p>
        </Reveal>
      )}

      <Reveal delay={0.095} className="flex flex-col gap-2.5">
        <SectionLabel icon={<ScanFace size={13} />}>Sign in faster</SectionLabel>
        <Panel className="p-4">
          <PasskeyManager initial={passkeys} begin={staffBeginPasskey} finish={staffFinishPasskey} remove={staffRemovePasskey} />
        </Panel>
        <p className="px-1 text-[11px] text-fg-subtle">Add this device to sign in with Face ID or your fingerprint next time — no password needed. Your biometric stays on your device.</p>
      </Reveal>

      <Reveal delay={0.1} className="flex flex-col gap-2.5">
        <SectionLabel icon={<Bell size={13} />}>Notifications</SectionLabel>
        <Panel className="p-4">
          <DevicePushToggle />
        </Panel>
        <p className="px-1 text-[11px] text-fg-subtle">Get a phone alert when you&apos;re mentioned, replied to, or assigned a task.</p>
      </Reveal>

      <Reveal delay={0.15} className="flex flex-col gap-2.5">
        <SectionLabel icon={<Settings2 size={13} />}>Accessibility</SectionLabel>
        <Panel className="p-4">
          <AccessibilityControls />
        </Panel>
        <p className="px-1 text-[11px] text-fg-subtle">These settings are saved on this device only.</p>
      </Reveal>

      <form action={portalLogout}>
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-bg-elev ring-1 ring-border px-4 py-3 text-sm font-medium text-danger hover:bg-danger-soft/40 transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
      </form>
    </div>
  );
}
