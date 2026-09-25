import { redirect } from "next/navigation";
import { SignOutForm } from "@/components/sign-out-form";
import { Bell, FileCheck2, LogOut, Settings2, UserRound, CalendarDays, Route as RouteIcon, Package, CheckCircle2, Circle } from "lucide-react";
import { DevicePushToggle } from "@/components/device-push-toggle";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { AccessibilityControls } from "@/components/portal-prefs";
import { PortalDocuments, type PortalDocumentItem } from "@/components/portal-documents";
import { PortalAttendance } from "@/components/portal-attendance";
import { personAttendanceWeek } from "@/lib/attendance";
import { PasskeyManager } from "@/components/passkey-manager";
import { InstallApp } from "@/components/install-app";
import { PortalPassword } from "@/components/portal-password";
import { listCredentials } from "@/lib/webauthn";
import { staffBeginPasskey, staffFinishPasskey, staffRemovePasskey } from "@/app/portal/passkey-actions";
import { Clock, ScanFace, KeyRound, MonitorSmartphone } from "lucide-react";
import { Sparkles } from "lucide-react";
import { getPortalPerson } from "@/lib/portal-auth";
import { getInitials } from "@/lib/names";
import { audienceForRole, firstRunTourFor, spotlightsFor } from "@/lib/tours";
import { TourReplay } from "@/components/tour-replay";
import { portalRestartTour } from "../../tour-actions";
import { getJourney } from "@/lib/onboarding";
import { assetsForPerson } from "@/lib/assets";
import { staffIdFor } from "@/lib/staff-id";
import { portalLogout } from "../../actions";
import { PortalBriefFilters } from "@/components/portal-brief-filters";
import { portalBriefOptions } from "@/lib/portal-brief-scope";
import { briefMonthOptions } from "@/lib/brief-links";
import { Contact } from "lucide-react";
import { PortalContactDetails, type ContactDetails } from "./portal-contact-details";
import { getAllTasks } from "@/lib/queries";
import { computePersonKpi } from "@/lib/kpi";
import { PortalKpiCard } from "@/components/portal-kpi-card";
import { StaffProfile, PCard, KpiCard } from "@/components/studio/profile/staff-profile";
import { WeekStrip, CheckinPanel } from "@/components/studio/home/staff-cards";
import { StudioInstall } from "@/components/studio/studio-install";
import { visibleTaskIds } from "@/lib/portal-auth";
import { isStaffLikeRole } from "@/lib/director-routes";

export const dynamic = "force-dynamic";

export default async function PortalProfile() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  // Directors are operators, not staff being managed — their profile is a clean
  // account screen (details + security + the Brief). Decided FIRST, because the
  // staff-only halves of this page are expensive: the contact row, the whole
  // document library, the onboarding journey, the equipment list and the
  // attendance week were all fetched for a director and then thrown away by a
  // `!isDirector` guard further down. Five queries for nothing, one of them
  // `listDocuments()` — the entire library, filtered in JavaScript.
  const isDirector = me.portalRole === "director";

  const audience = audienceForRole(me.portalRole);

  // Every read on this page needs only `me`, so they go in ONE round rather than
  // a dozen waits one after another.
  const [companyName, staffId, { data: contactRow }, docItems, [journey, equipment, attendance], passkeys, [welcomeTour, spotlights], briefOptions, allTasks] = await Promise.all([
    me.companyId
      ? sb.from("companies").select("name").eq("id", me.companyId).maybeSingle().then(({ data }) => (data?.name as string | null) ?? null)
      : Promise.resolve(null),
    staffIdFor(me.id),
    // The signed-in person's OWN editable contact details (pre-fill the form). Read
    // here, scoped to me.id; the write goes through portalStaffUpdateContact, which
    // re-scopes to the caller and only ever touches these five contact columns.
    isDirector
      ? Promise.resolve({ data: null })
      : sb
          .from("people")
          .select("phone,whatsapp,address,emergency_contact_name,emergency_contact_phone")
          .eq("id", me.id)
          .maybeSingle(),
    // The documents filed against this person — a plain list, no checklist.
    (async (): Promise<PortalDocumentItem[]> => {
      if (isDirector) return [];
      const { deriveDocStatus, expiryLabel: docExpiryLabel, listDocuments } = await import("@/lib/documents");
      return (await listDocuments())
        .filter((d) => d.personId === me.id && !d.archived)
        .map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          status: deriveDocStatus(d),
          expiryLabel: docExpiryLabel(d),
        }));
    })(),
    isDirector
      ? Promise.resolve([null, [] as Awaited<ReturnType<typeof assetsForPerson>>, { days: [] as Awaited<ReturnType<typeof personAttendanceWeek>>["days"], todayEditable: false, lockReason: null } as Awaited<ReturnType<typeof personAttendanceWeek>>] as const)
      : Promise.all([
          getJourney(me.id, "onboarding"),
          assetsForPerson(me.id),
          personAttendanceWeek(me.id),
        ]),
    listCredentials({ kind: "person", id: me.id, name: me.name }),
    // Guides the person can replay (welcome walkthrough + past feature spotlights).
    Promise.all([firstRunTourFor(audience), spotlightsFor(audience)]),
    // Director Brief filters — gated by the owner-configurable `directorBrief`
    // capability, not the role. Both lists are scoped to what this person may see,
    // so a company-locked director never sees other companies' staff names.
    me.caps.directorBrief ? portalBriefOptions(me) : Promise.resolve(null),
    // Every branch below reads the task list (the KPI or the Studio page).
    getAllTasks(),
  ]);
  const contact: ContactDetails = {
    phone: (contactRow?.phone as string | null) ?? "",
    whatsapp: (contactRow?.whatsapp as string | null) ?? "",
    address: (contactRow?.address as string | null) ?? "",
    emergencyContactName: (contactRow?.emergency_contact_name as string | null) ?? "",
    emergencyContactPhone: (contactRow?.emergency_contact_phone as string | null) ?? "",
  };

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

  const initials = getInitials(me.name);
  const accessLabel =
    me.portalRole === "director" ? "Director" : me.portalRole === "hr" ? "Admin access" : me.portalRole === "manager" ? "Manager access" : "Staff access";

  // Self-KPI (staff/managers only) — last 4 months of their own scorecard.
  let kpiMonths: React.ComponentProps<typeof PortalKpiCard>["months"] = [];
  if (!isDirector) {
    const nowK = new Date();
    kpiMonths = Array.from({ length: 4 }, (_, i) => {
      const dt = new Date(nowK.getFullYear(), nowK.getMonth() - i, 1);
      const k = computePersonKpi(me.id, allTasks, dt.getFullYear(), dt.getMonth() + 1);
      return { monthLabel: k.monthLabel, completed: k.completed, openInvolved: k.openInvolved, score: k.score };
    });
  }

  // Staff are on Studio (26 Sept 2026, mockup S_Profile): the same parts, in
  // the Studio layout. Every part that saves is the component it always was.
  // Managers and directors too (26 Sept 2026) — it was the one page of theirs
  // still in the old portal. A director keeps what their old page showed: no
  // KPI, attendance, files, equipment or contact form.
  if (isStaffLikeRole(me.portalRole) || me.portalRole === "manager" || isDirector) {
    const allT = allTasks;
    // "Open now" and "late" are THEIR tasks (on it, or accountable) — not every
    // task a manager can see.
    const openMine = allT.filter((r) => (r.ownerId === me.id || r.assigneeIds.includes(me.id)) && r.status !== "Completed" && r.status !== "Closed");
    const lateNow = openMine.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const week = attendance.days.map((d) => ({ date: d.date, label: DOW[d.dow], status: d.status, isToday: d.isToday }));
    const tick = "text-xs text-[var(--st-muted)]";
    const row = "flex items-center gap-3 border-t border-[var(--st-line-soft)] py-3 first:border-0 first:pt-0";
    const icon = "grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--st-page)] text-[var(--st-sub)]";
    const head = "flex items-center gap-3 text-[13px] font-medium";
    return (
      <StaffProfile
        name={me.name}
        sub={[me.role, companyName].filter(Boolean).join(" · ") || "Your profile"}
        pills={[...(staffId ? [{ label: staffId }] : []), { label: accessLabel, dot: "#19C37D" }]}
        sections={{
          kpi: !isDirector && kpiMonths.length > 0 ? <KpiCard months={kpiMonths.map((k) => ({ monthLabel: k.monthLabel, completed: k.completed }))} openNow={openMine.length} lateNow={lateNow} /> : null,
          attendance: isDirector ? null : (
            <PCard title="Attendance" right="this week">
              {isStaffLikeRole(me.portalRole) ? (
                <div>
                  <WeekStrip week={week} />
                  <p className={tick + " mt-3"}>Check in on Home each day. Your manager can adjust a day if needed.</p>
                </div>
              ) : (
                // A manager's Home is the shared one, with no check-in card — so
                // their day is marked here, as it was on their old profile.
                <CheckinPanel c={{
                  status: attendance.days.find((d) => d.isToday)?.status ?? null,
                  editable: attendance.todayEditable,
                  lockReason: attendance.lockReason,
                  dateLabel: "",
                  week,
                }} />
              )}
            </PCard>
          ),
          // A wrapper, not a fragment: a fragment handed to a client component
          // arrives as a list, and React asks for keys.
          guides: (
            <div className="contents">
              {journey && journey.total > 0 && (
                <PCard key="journey" title="Your onboarding" right={journey.completed + " of " + journey.total + " done"}>
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--st-page)]"><div className="h-full rounded-full bg-[var(--st-ok,#19C37D)]" style={{ width: journey.percent + "%" }} /></div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {journey.steps.slice(0, 12).map((st) => (
                      <li key={st.id} className="flex items-center gap-2.5 text-[13px]">
                        {st.done ? <CheckCircle2 size={14} className="shrink-0 text-[var(--st-ok-text)]" /> : <Circle size={14} className="shrink-0 text-[var(--st-muted)]" />}
                        <span className={st.done ? "text-[var(--st-muted)] line-through" : ""}>{st.label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className={tick + " mt-3"}>Your administrator ticks these off as they are completed.</p>
                </PCard>
              )}
              {showGuides && (
                <PCard key="guides" title="Guides & tips">
                  <TourReplay welcome={welcome} spotlights={spotlightsLite} restart={portalRestartTour} />
                </PCard>
              )}
            </div>
          ),
          details: (
            <PCard title="My details" right="from HR — ask to change">
              <dl className="m-0 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] gap-x-3 gap-y-2.5 text-[13px]">
                {details.map((d) => (
                  <div key={d.label} className="contents"><dt className="text-[var(--st-muted)]">{d.label}</dt><dd className="m-0 min-w-0 break-words">{d.value}</dd></div>
                ))}
              </dl>
              {!isDirector && <div className="mt-5 border-t border-[var(--st-line-soft)] pt-4">
                <div className="mb-3 text-[13px] font-semibold">Contact — you can edit these</div>
                <PortalContactDetails initial={contact} />
                <p className={tick + " mt-2"}>Only you can edit them.</p>
              </div>}
            </PCard>
          ),
          files: isDirector ? null : (
            <PCard title="My files" right={String(docItems.length)}>
              <PortalDocuments items={docItems} />
              <p className={tick + " mt-2"}>Send anything we ask for. Your administrator files and checks each one.</p>
            </PCard>
          ),
          equipment: isDirector ? null : (
            <PCard title="Equipment" right={String(equipment.length)}>
              {equipment.length === 0 ? <p className={tick}>Nothing is signed out to you.</p> : (
                <div className="flex flex-col">
                  {equipment.map((a) => (
                    <div key={a.id} className={row}>
                      <span className={icon}><Package size={15} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{a.name}</span>
                        <span className="block truncate text-[11px] text-[var(--st-muted)]">{[a.category, a.brand, a.tag].filter(Boolean).join(" · ") || "Assigned to you"}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </PCard>
          ),
          signin: (
            <PCard title="Sign-in & app">
              <div className="flex flex-col">
                <div className={row + " flex-col items-stretch"}>
                  <div className={head}><span className={icon}><ScanFace size={15} /></span>Face ID / fingerprint</div>
                  <PasskeyManager initial={passkeys} begin={staffBeginPasskey} finish={staffFinishPasskey} remove={staffRemovePasskey} />
                </div>
                <div className={row + " flex-col items-stretch"}>
                  <div className={head}><span className={icon}><KeyRound size={15} /></span>Password</div>
                  <PortalPassword />
                </div>
                <div className={row + " flex-col items-stretch"}>
                  <div className={head}><span className={icon}><Bell size={15} /></span>Alerts on this device</div>
                  <DevicePushToggle />
                </div>
                <div className={row + " flex-col items-stretch"}>
                  <div className={head}><span className={icon}><MonitorSmartphone size={15} /></span>Install Oracle</div>
                  <StudioInstall />
                </div>
                <div className={row + " flex-col items-stretch"}>
                  <div className={head}><span className={icon}><Settings2 size={15} /></span>Accessibility</div>
                  <AccessibilityControls />
                </div>
              </div>
            </PCard>
          ),
          signout: (
            <SignOutForm action={portalLogout}>
              <button type="submit" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--st-line)] bg-[var(--st-surface)] text-[13px] font-medium text-[var(--st-late-text)] transition-colors hover:bg-[var(--st-page)]">
                <LogOut size={15} /> Sign out
              </button>
            </SignOutForm>
          ),
        }}
      />
    );
  }

  // Glance rail — the three numbers that tell a staff member where they stand
  // before any scrolling. Each tile only appears when there's data behind it.
  const presentDays = attendance.days.filter((d) => d.status === "Present" || d.status === "Remote" || d.status === "Half-day").length;
  const glance: Array<{ label: string; value: string; tone: keyof typeof TONE }> = [
    { label: "Present wk", value: `${presentDays}/6`, tone: "muted" as keyof typeof TONE },
  ];

  return (
    // Two columns from `lg`, one on a phone. It was a single `max-w-3xl` column,
    // which on a monitor left a director looking at three short panels down the
    // middle of an empty screen (the portal lays out at 1.25x its window because
    // of the 0.8 zoom, so "3xl" is barely half the width). Staff gain more: their
    // eight sections stop being one long scroll.
    <div className="flex w-full flex-col gap-5 lg:mx-auto lg:max-w-5xl">
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
              <span className="inline-flex items-center rounded-full bg-bg-subtle/70 px-2 py-0.5 text-xs font-medium tabular text-fg-muted ring-1 ring-border/60">
                {staffId}
              </span>
            )}
          </div>
        </Hero>
      </Reveal>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
      <div className="flex flex-col gap-5">
      {briefOptions && (
        <Reveal delay={0.02}>
          <PortalBriefFilters
            months={briefMonthOptions(new Date())}
            companies={briefOptions.companies}
            people={briefOptions.people}
          />
        </Reveal>
      )}

      {!isDirector && glance.length > 1 && (
        <Reveal delay={0.03}>
          <div className={`grid gap-2 ${glance.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {glance.map((g) => (
              <div key={g.label} className={`rounded-2xl p-3 ring-1 ${TONE[g.tone].bg} ${TONE[g.tone].ring}`}>
                <div className={`text-xs font-medium ${TONE[g.tone].text}`}>{g.label}</div>
                <p className="mt-1 text-xl font-semibold tabular">{g.value}</p>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {!isDirector && kpiMonths.length > 0 && (
        <Reveal delay={0.04}>
          <PortalKpiCard months={kpiMonths} />
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
        <p className="px-1 text-xs text-fg-subtle">
          Need a detail changed? Ask your administrator — these come from your HR record.
        </p>
      </Reveal>

      {!isDirector && (
        <Reveal delay={0.065} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Contact size={13} />}>Your contact details</SectionLabel>
          <PortalContactDetails initial={contact} />
          <p className="px-1 text-xs text-fg-subtle">
            Keep these up to date yourself — only you can edit them, and only you see them.
          </p>
        </Reveal>
      )}

      {!isDirector && (
        <Reveal delay={0.08} className="flex flex-col gap-2.5">
          <SectionLabel icon={<FileCheck2 size={13} />}>Your files</SectionLabel>
          <PortalDocuments items={docItems} />
          <p className="px-1 text-xs text-fg-subtle">
            Send anything we ask for. Your administrator files and checks each one.
          </p>
        </Reveal>
      )}

      {!isDirector && (
        <Reveal delay={0.085} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Clock size={13} />}>Your attendance</SectionLabel>
          <PortalAttendance days={attendance.days} todayEditable={attendance.todayEditable} lockReason={attendance.lockReason} />
          <p className="px-1 text-xs text-fg-subtle">Check in each day. Your manager can adjust this if needed.</p>
        </Reveal>
      )}

      </div>
      <div className="flex flex-col gap-5">
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
          <p className="px-1 text-xs text-fg-subtle">Your administrator ticks these off as they’re completed.</p>
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
                  <span className="block text-xs text-fg-subtle truncate">{[a.category, a.brand, a.tag].filter(Boolean).join(" · ") || "Assigned to you"}</span>
                </span>
              </div>
            ))}
          </Panel>
          <p className="px-1 text-xs text-fg-subtle">Company equipment currently assigned to you.</p>
        </Reveal>
      )}

      {showGuides && (
        <Reveal delay={0.125} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Sparkles size={13} />}>Guides &amp; tips</SectionLabel>
          <TourReplay welcome={welcome} spotlights={spotlightsLite} restart={portalRestartTour} />
          <p className="px-1 text-xs text-fg-subtle">Re-watch the welcome tour or catch up on what&apos;s new — any time.</p>
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
            <p className="mt-2.5 text-xs text-fg-subtle">Add this device to sign in with Face ID or your fingerprint — no password needed. Your biometric stays on your device.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><MonitorSmartphone size={16} /></span>
              Get the app
            </div>
            <InstallApp />
            <p className="mt-2.5 text-xs text-fg-subtle">Puts Oracle Consultancy on your home screen or Start menu, in its own window. Nothing is downloaded and it stays up to date on its own.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg-muted"><KeyRound size={16} /></span>
              Password
            </div>
            <PortalPassword />
            <p className="mt-2.5 text-xs text-fg-subtle">Change the password you use to sign in. Only you can do this.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg-muted"><Bell size={16} /></span>
              Notifications
            </div>
            <DevicePushToggle />
            <p className="mt-2.5 text-xs text-fg-subtle">Get a phone alert when you&apos;re mentioned, replied to, or assigned a task.</p>
          </div>
          <div className="p-4">
            <div className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg-muted"><Settings2 size={16} /></span>
              Accessibility
            </div>
            <AccessibilityControls />
            <p className="mt-2.5 text-xs text-fg-subtle">These settings are saved on this device only.</p>
          </div>
        </Panel>
      </Reveal>
      </div>
      </div>

      <SignOutForm action={portalLogout}>
        <button
          type="submit"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-bg-elev ring-1 ring-border px-4 text-sm font-medium text-danger hover:bg-danger-soft/40 transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
      </SignOutForm>
    </div>
  );
}
