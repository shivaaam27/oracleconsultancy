import { redirect } from "next/navigation";
import { Bell, FileCheck2, LogOut, Settings2, UserRound, CalendarDays, Route as RouteIcon, Package, CheckCircle2, Circle } from "lucide-react";
import { DevicePushToggle } from "@/components/device-push-toggle";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { AccessibilityControls } from "@/components/portal-prefs";
import { PortalDocuments, type PortalChecklistItem } from "@/components/portal-documents";
import { PortalLeave } from "@/components/portal-leave";
import { PortalAttendance } from "@/components/portal-attendance";
import { personAttendanceWeek } from "@/lib/attendance";
import { PasskeyManager } from "@/components/passkey-manager";
import { PortalPassword } from "@/components/portal-password";
import { listCredentials } from "@/lib/webauthn";
import { staffBeginPasskey, staffFinishPasskey, staffRemovePasskey } from "@/app/portal/passkey-actions";
import { Clock, ScanFace, KeyRound } from "lucide-react";
import { Sparkles } from "lucide-react";
import { getPortalPerson } from "@/lib/portal-auth";
import { audienceForRole, firstRunTourFor, spotlightsFor } from "@/lib/tours";
import { TourReplay } from "@/components/tour-replay";
import { portalRestartTour } from "../../tour-actions";
import { getPersonChecklist } from "@/lib/requirements";
import { personLeaveBalances, listLeaveRequests } from "@/lib/leave";
import { getJourney } from "@/lib/onboarding";
import { assetsForPerson } from "@/lib/assets";
import { staffIdFor } from "@/lib/staff-id";
import { portalLogout } from "../../actions";
import { BriefPdfButton } from "@/components/brief-pdf-button";

export const dynamic = "force-dynamic";

export default async function PortalProfile() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

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

  // Guides the person can replay (welcome walkthrough + past feature spotlights).
  const audience = audienceForRole(me.portalRole);
  const [welcomeTour, spotlights] = await Promise.all([firstRunTourFor(audience), spotlightsFor(audience)]);
  const welcome = welcomeTour
    ? { key: welcomeTour.key, title: welcomeTour.title, body: welcomeTour.body, route: welcomeTour.route }
    : null;
  const spotlightsLite = spotlights.map((s) => ({ key: s.key, title: s.title, body: s.body, route: s.route }));
  const showGuides = !!welcome || spotlightsLite.length > 0;

  const details: Array<{ label: string; value: string }> = [
    { label: "Name", value: me.name },
    ...(staffId ? [{ label: "Staff ID", value: staffId }] : []),
    ...(me.role ? [{ label: "Role", value: me.role }] : []),
    ...(me.email ? [{ label: "Email", value: me.email }] : []),
    ...(companyName ? [{ label: "Company", value: companyName }] : []),
  ];

  const initials = me.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const accessLabel =
    me.portalRole === "director" ? "Director" : me.portalRole === "hr" ? "Admin access" : me.portalRole === "manager" ? "Manager access" : "Staff access";

  // Directors are operators, not staff being managed — their profile is a clean
  // account screen (details + security). The staff self-service sections
  // (documents / attendance / leave / onboarding / equipment) stay for everyone
  // else.
  const isDirector = me.portalRole === "director";

  // Glance rail — the three numbers that tell a staff member where they stand
  // before any scrolling. Each tile only appears when there's data behind it.
  const compScore = checklist ? checklist.score : null;
  const annual =
    leaveBalances.find((b) => /annual/i.test(b.typeName) && b.remaining != null) ??
    leaveBalances.find((b) => b.remaining != null);
  const leaveLeft = annual?.remaining ?? null;
  const presentDays = attendance.days.filter((d) => d.status === "Present" || d.status === "Remote" || d.status === "Half-day").length;
  const glance: Array<{ label: string; value: string; tone: keyof typeof TONE }> = [
    ...(compScore != null ? [{ label: "Compliance", value: `${compScore}%`, tone: (compScore >= 80 ? "success" : compScore >= 50 ? "warn" : "danger") as keyof typeof TONE }] : []),
    ...(leaveLeft != null ? [{ label: "Leave left", value: `${leaveLeft}d`, tone: "accent" as keyof typeof TONE }] : []),
    { label: "Present wk", value: `${presentDays}/6`, tone: "muted" as keyof typeof TONE },
  ];

  return (
    <div className="flex w-full flex-col gap-5 lg:mx-auto lg:max-w-3xl">
      <Reveal delay={0}>
        <Hero
          title={
            <span className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft/70 text-accent text-base font-semibold ring-1 ring-accent/20">
                {initials}
              </span>
              <span className="min-w-0 truncate">{me.name}</span>
            </span>
          }
          subtitle={[me.role, companyName].filter(Boolean).join(" · ") || "Your profile and viewing preferences."}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="info">{accessLabel}</Badge>
            {staffId && (
              <span className="inline-flex items-center rounded-full bg-bg-subtle/70 px-2 py-0.5 text-[11px] font-medium tabular text-fg-muted ring-1 ring-border/60">
                {staffId}
              </span>
            )}
            {isDirector && (
              <BriefPdfButton href="/api/portal/brief-pdf" label="Download PDF" size="xs" />
            )}
          </div>
        </Hero>
      </Reveal>

      {!isDirector && glance.length > 1 && (
        <Reveal delay={0.03}>
          <div className={`grid gap-2 ${glance.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {glance.map((g) => (
              <div key={g.label} className={`rounded-2xl p-3 ring-1 ${TONE[g.tone].bg} ${TONE[g.tone].ring}`}>
                <div className={`text-[11px] font-medium ${TONE[g.tone].text}`}>{g.label}</div>
                <p className="mt-1 text-xl font-semibold tabular">{g.value}</p>
              </div>
            ))}
          </div>
        </Reveal>
      )}

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

      {!isDirector && docItems.length > 0 && (
        <Reveal delay={0.08} className="flex flex-col gap-2.5">
          <SectionLabel icon={<FileCheck2 size={13} />}>Your documents</SectionLabel>
          <PortalDocuments items={docItems} score={checklist?.score ?? 0} />
          <p className="px-1 text-[11px] text-fg-subtle">
            Upload anything we still need. Your administrator checks and confirms each one.
          </p>
        </Reveal>
      )}

      {!isDirector && (
        <Reveal delay={0.085} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Clock size={13} />}>Your attendance</SectionLabel>
          <PortalAttendance days={attendance.days} todayEditable={attendance.todayEditable} lockReason={attendance.lockReason} />
          <p className="px-1 text-[11px] text-fg-subtle">Check in each day. Your manager can adjust this if needed.</p>
        </Reveal>
      )}

      {!isDirector && leaveBalances.length > 0 && (
        <Reveal delay={0.09} className="flex flex-col gap-2.5">
          <SectionLabel icon={<CalendarDays size={13} />}>Your leave</SectionLabel>
          <PortalLeave balances={leaveBalances} requests={leaveRequests} />
          <p className="px-1 text-[11px] text-fg-subtle">Request leave here — your manager reviews and approves it.</p>
        </Reveal>
      )}

      {!isDirector && journey && journey.total > 0 && (
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

      {!isDirector && equipment.length > 0 && (
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

      {showGuides && (
        <Reveal delay={0.125} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Sparkles size={13} />}>Guides &amp; tips</SectionLabel>
          <TourReplay welcome={welcome} spotlights={spotlightsLite} restart={portalRestartTour} />
          <p className="px-1 text-[11px] text-fg-subtle">Re-watch the welcome tour or catch up on what&apos;s new — any time.</p>
        </Reveal>
      )}

      <Reveal delay={0.13} className="flex flex-col gap-2.5">
        <SectionLabel icon={<ShieldCheck size={13} />}>Account &amp; security</SectionLabel>
        <Panel className="divide-y divide-border/60 p-0">
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><ScanFace size={16} /></span>
              Sign in faster
            </div>
            <PasskeyManager initial={passkeys} begin={staffBeginPasskey} finish={staffFinishPasskey} remove={staffRemovePasskey} />
            <p className="mt-2.5 text-[11px] text-fg-subtle">Add this device to sign in with Face ID or your fingerprint — no password needed. Your biometric stays on your device.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg-muted"><KeyRound size={16} /></span>
              Password
            </div>
            <PortalPassword />
            <p className="mt-2.5 text-[11px] text-fg-subtle">Change the password you use to sign in. Only you can do this.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg-muted"><Bell size={16} /></span>
              Notifications
            </div>
            <DevicePushToggle />
            <p className="mt-2.5 text-[11px] text-fg-subtle">Get a phone alert when you&apos;re mentioned, replied to, or assigned a task.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg-muted"><Settings2 size={16} /></span>
              Accessibility
            </div>
            <AccessibilityControls />
            <p className="mt-2.5 text-[11px] text-fg-subtle">These settings are saved on this device only.</p>
          </div>
        </Panel>
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
