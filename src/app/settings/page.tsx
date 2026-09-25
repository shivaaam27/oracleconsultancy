import { Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { SignOutForm } from "@/components/sign-out-form";
import { ResyncLatestUpdateButton } from "@/components/resync-button";
import { NotificationSettings } from "@/components/notification-settings";
import { SettingsCard } from "@/components/settings-card";
import { SettingsSections, type SettingsGroup } from "@/components/settings-sections";
import { getAppSettings, getEmailConfig, getGeminiKeyPreview } from "@/lib/settings";
import { whatsAppConfigured } from "@/lib/whatsapp";
import { getGoogleStatus } from "@/lib/google";
import { signDocumentFile } from "@/lib/documents";
import { sb } from "@/db/supabase";
import { saveSettings, setPortalAccess, disconnectGoogleAction, setDirectorOutreach, setEmailAutomation, setAutomationTuning, sendDirectorBriefNow, runEmailAutomationNow, setCommandCentrePause, savePortalPermissionsAction } from "./actions";
import { getPortalPermissions } from "@/lib/portal-permissions-store";
import { resolveMatrix, PORTAL_ROLES, ROLE_LABEL, SCOPE_WORDS } from "@/lib/portal-permissions";
import { parsePortalRole, directorScopeOf } from "@/lib/portal-access";
import { PortalPermissionsEditor } from "@/components/portal-permissions-editor";
import { RevealPassword } from "@/components/reveal-password";
import { StudioInstall } from "@/components/studio/studio-install";
import { AppearanceSetting } from "@/components/studio/appearance-setting";
import { getSecurityStatus } from "@/lib/security-status";
import { getAutomationConfig, CATEGORY_META } from "@/lib/automation";
import { AutomationSettings } from "@/components/automation-settings";
import { getAutomationRuleStatuses } from "@/app/automations/actions";
import { EmailStatus } from "./email-test";
import { WhatsAppStatus } from "./whatsapp-test";
import { adminChangePassword, adminLogout, adminSaveOwnerIdentity } from "../login/actions";
import { adminBeginPasskey, adminFinishPasskey, adminRemovePasskey } from "./passkey-actions";
import { listMcpKeys, createMcpKey, revokeMcpKey, listMcpConnections, revokeMcpConnection } from "./mcp-actions";
import { McpKeyManager } from "@/components/mcp-key-manager";
import { appBaseUrl } from "@/lib/app-url";
import { getOwnerIdentity } from "@/lib/admin-auth";
import { listCredentials } from "@/lib/webauthn";
import { PasskeyManager } from "@/components/passkey-manager";
import { DirectorReachSelect } from "@/components/director-reach-select";
import { PortalAccessList } from "@/components/portal-access-list";
import { FormSwitch } from "@/components/form-switch";
import { StudioScope, StudioCard, StudioCardRow, CardHead } from "@/components/studio/kit";
import { AiUsageDashboard } from "@/components/ai-usage-dashboard";
import Link from "next/link";
import { Save, SlidersHorizontal, Sparkles, MessageCircle, Check, Sun, Mic2, Bell, KeyRound, CalendarCheck, ScanFace, Mail, Users, Wrench, Scale, ClipboardList, ShieldCheck, Gauge, Bot } from "lucide-react";

export const dynamic = "force-dynamic";

// The Settings page is sectioned: the rail picks a group, only that group's cards
// show. Order here = rail order. `cards` lets a deep link to #card-id open the
// group that holds it.
/** One-line results for buttons that are not a plain save (`?note=`). Each says
 *  what really happened — a button that fell back to a draft says so. */
const NOTES: Record<string, { ok: boolean; text: string }> = {
  "brief-sent": { ok: true, text: "The Director Brief has been emailed to you." },
  "brief-drafted": { ok: false, text: "Email isn't working, so the Director Brief was saved to the Outbox as a draft instead." },
  ran: { ok: true, text: "Email automation ran. Anything sent or drafted is in the Outbox." },
  "sig-failed": { ok: false, text: "Settings saved, but the signature image didn't upload — try it again." },
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  // Navigation (pinned pages) was removed — unused (owner, 25 Sept 2026); this
  // device's look and alerts moved in so General is not two lonely cards.
  { id: "general", label: "General", icon: "SlidersHorizontal", cards: ["about", "appearance", "risk", "notifications"] },
  { id: "ai", label: "AI & Voice", icon: "Sparkles", cards: ["ai", "voice", "ai-usage"] },
  { id: "automation", label: "Automation", icon: "Wrench", cards: ["automations", "meeting-tasks", "tax-legal"] },
  { id: "portals", label: "Portals", icon: "MonitorSmartphone", cards: ["portal", "portal-permissions", "portal-nudges"] },
  { id: "email", label: "Email & Integrations", icon: "Mail", cards: ["email", "email-automation", "messaging", "google"] },
  { id: "security", label: "Security & Access", icon: "KeyRound", cards: ["security-check", "owner", "passkeys", "mcp-keys"] },
  { id: "alerts", label: "Notifications & More", icon: "Bell", cards: ["quiet-hours", "maintenance"] },
];

/** Sticky Save button shared by every per-section settings form. Tagged
 *  data-savebar so the in-page search can hide it while filtering. */
function SaveBar() {
  return (
    <div data-savebar className="sticky bottom-3 z-10 flex justify-end">
      <Button type="submit" className="shadow-lg"><Save size={13} /> Save changes</Button>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; portal?: string; owner?: string; google?: string; section?: string; note?: string }>;
}) {
  const [s, sp, googleStatus, { data: peopleRows }, { data: companyRows }, ownerIdentity] = await Promise.all([
    getAppSettings(),
    searchParams,
    getGoogleStatus(),
    sb
      .from("people")
      .select("id,name,company_id,portal_password_hash,portal_last_login_at,portal_role,director_company_id,director_companies(company_id),person_companies(company_id)")
      .eq("active", true)
      .order("name"),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    getOwnerIdentity(),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const ownerPasskeys = await listCredentials({ kind: "admin" });
  const securityChecks = await getSecurityStatus();
  const mcpKeys = await listMcpKeys();
  const mcpConnections = await listMcpConnections();
  const appUrl = appBaseUrl();
  // Live counts for the Danger-zone confirmation screen.
  const geminiKey = await getGeminiKeyPreview();
  const signatureImageUrl = s.emailSignatureImagePath
    ? await signDocumentFile(s.emailSignatureImagePath, 3600)
    : null;
  const emailCfg = await getEmailConfig();
  const portalPeople = (peopleRows ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    enabled: Boolean(p.portal_password_hash),
    lastLogin: p.portal_last_login_at as string | null,
    role: parsePortalRole(p.portal_role),
    directorCompanyIds: directorScopeOf(p),
    companyIds: [...new Set([p.company_id as number | null, ...((p.person_companies as { company_id: number }[] | null) ?? []).map((x) => x.company_id)].filter((n): n is number => n != null))],
  }));
  const portalEnabled = portalPeople.filter((p) => p.enabled);
  const { data: dirKill } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  const directorPaused = (dirKill?.value as string | null) === "1";
  const whatsAppOn = whatsAppConfigured();
  const emailAuto = await getAutomationConfig();
  const { data: tmRow } = await sb.from("settings").select("value").eq("key", "email.testMode").maybeSingle();
  const emailTestMode = (tmRow?.value as string | null) === "1";
  const automationStatuses = await getAutomationRuleStatuses();
  // Tax & Legal only creates tasks while the task-create rule is on — the card
  // used to say "can spawn tasks" regardless (audit 24 Sept 2026).
  const taskCreateOff = automationStatuses.find((r) => r.kind === "task-create")?.mode === "off";
  const portalPermsMatrix = resolveMatrix(await getPortalPermissions());
  // Mockup board Settings: the cards in the Studio frame, restyled by .st-settings.
  const studioFrame = {
    title: "Settings",
    note: <span className="flex items-center gap-1.5 text-xs text-[var(--st-ok-text)]"><Check size={13} strokeWidth={2.4} />Each section saves on its own</span>,
    top: (
      // Phone: one card you swipe, like every Studio page (swipe-row.tsx) —
      // stacked, the two filled the first screen and hid the section picker.
      <StudioCardRow className="lg:min-h-[196px]">
        <StudioCard className="min-h-[180px]">
          <CardHead label="Security check" right={<span className="hidden text-xs text-[var(--st-muted)] xl:inline">reads the live state · changes nothing</span>} />
          {/* Two across only where the card is wide enough (xl); on a tablet
              the card is half the screen and two across cut every word off. */}
          <div className="mt-auto grid grid-cols-1 content-end gap-2 pt-3 xl:grid-cols-2">
            {securityChecks.map((c) => {
              const col = c.state === "ok" ? "#19C37D" : c.state === "warn" ? "#F5A524" : "#8E9197";
              return (
                <div key={c.id} title={c.fix ?? c.detail} className="rounded-[12px] border border-[var(--st-card-line)] bg-[var(--st-card-2)] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col }} />
                    <span className="truncate">{c.label}</span>
                    <span className="ml-auto shrink-0 text-[11px]" style={{ color: col }}>{c.state === "ok" ? "Good" : c.state === "warn" ? "Needs you" : "Check"}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[var(--st-muted)]">{c.detail}</div>
                </div>
              );
            })}
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[180px]">
          <CardHead label="Install Oracle" right={<span className="text-xs text-[var(--st-muted)]">nothing to download</span>} />
          <div className="mt-auto pt-3"><StudioInstall /></div>
        </StudioCard>
      </StudioCardRow>
    ),
  };

  return (
    <StudioScope className="w-full">

      {(sp.saved || sp.google || sp.note) && (
        <div className="mt-4 space-y-2">
          {sp.note && NOTES[sp.note] && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${NOTES[sp.note].ok ? "border-success/30 bg-success/10 text-success" : "border-warn/30 bg-warn/10 text-warn"}`}>
              <Check size={14} /> {NOTES[sp.note].text}
            </div>
          )}
          {sp.saved && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <Check size={14} /> Settings saved.
            </div>
          )}
          {sp.google && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${sp.google === "connected" ? "border-success/30 bg-success/10 text-success" : "border-warn/30 bg-warn/10 text-warn"}`}>
              <Check size={14} />
              {sp.google === "connected" && "Google Calendar connected."}
              {sp.google === "disconnected" && "Google Calendar disconnected."}
              {sp.google === "denied" && "Google connection was cancelled."}
              {sp.google === "norefresh" && "Google didn't return a refresh token — try again (it forces a fresh consent)."}
              {sp.google === "unconfigured" && "Google isn't configured yet (missing client credentials)."}
              {sp.google === "error" && "Something went wrong connecting Google. Please try again."}
            </div>
          )}
        </div>
      )}

      <SettingsSections groups={SETTINGS_GROUPS} initial={sp.section} studio={studioFrame}>
        {/* ───────────────────────── General ───────────────────────── */}
        <section data-group="general" className="space-y-4">
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="operatorName,dueSoonDays,stalledDays,agingDays" />
            <input type="hidden" name="__section" value="general" />

            <SettingsCard id="about" icon={<Sparkles size={15} />} title="About you" desc="How ORI greets you." keywords="name operator greeting">
              <div className="max-w-xs">
                <FieldLabel>Your name</FieldLabel>
                <Input name="operatorName" defaultValue={s.operatorName} placeholder="e.g. Sunny" />
              </div>
            </SettingsCard>

            <SettingsCard id="risk" icon={<SlidersHorizontal size={15} />} title="Risk rules" desc="When a task flags for attention." keywords="due soon stalled aging overdue thresholds colour">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <FieldLabel>Due soon — within (days)</FieldLabel>
                  <Input name="dueSoonDays" type="number" min={0} defaultValue={s.dueSoonDays} />
                </div>
                <div>
                  <FieldLabel>Stalled — blocked, and open over (days)</FieldLabel>
                  <Input name="stalledDays" type="number" min={0} defaultValue={s.stalledDays} />
                </div>
                <div>
                  <FieldLabel>Aging — open over (days)</FieldLabel>
                  <Input name="agingDays" type="number" min={0} defaultValue={s.agingDays} />
                </div>
              </div>
            </SettingsCard>

            <SaveBar />
          </form>

          <SettingsCard id="appearance" icon={<Sun size={15} />} title="Appearance" desc="Light, dark, or follow this device." keywords="theme dark light mode appearance colour system">
            <AppearanceSetting />
          </SettingsCard>

          <SettingsCard id="notifications" icon={<Bell size={15} />} title="Notifications" desc="Device alerts for overdue, escalated & due-today tasks." keywords="notifications push alerts device overdue escalated reminders iphone">
            <NotificationSettings />
          </SettingsCard>
        </section>

        {/* ───────────────────────── AI & Voice ───────────────────────── */}
        <section data-group="ai" className="space-y-4">
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="aiEnabled,semanticSearch,geminiApiKey,aiMonthlySpendCap,voiceLanguage,voiceDictionary" />
            <input type="hidden" name="__section" value="ai" />

            <SettingsCard id="ai" icon={<Sparkles size={15} />} title="AI assistance" desc="Master switch for all AI features." keywords="ai groq ask polish drafting meeting semantic search key model">
              <div className="grid grid-cols-1 gap-2">
                <FormSwitch name="aiEnabled" defaultChecked={s.aiEnabled} label="Enable AI features" hint="Off runs the whole system manually — nothing breaks." />
                <FormSwitch name="semanticSearch" defaultChecked={s.semanticSearch} label="Semantic search (ORI)" hint="Find by meaning, not just words. Needs the one-time setup (SEMANTIC_SEARCH.md)." />
              </div>


              {/* Google Gemini is the sole everyday-AI provider (Groq removed). It
                  powers document reading, Ask ORI, dictation polish and minutes. */}
              <div className="mt-1 max-w-xl space-y-2 border-t border-border/60 pt-3.5">
                <FieldLabel>AI key (Google Gemini)</FieldLabel>
                <div className="flex items-center gap-2 text-xs">
                  {geminiKey.source === "settings" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success ring-1 ring-success/30">
                      <Check size={12} /> Key set here · ends &hellip;{geminiKey.last4}
                    </span>
                  )}
                  {geminiKey.source === "env" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/70 px-2.5 py-1 font-medium text-fg-muted ring-1 ring-border">
                      Using built-in key · ends &hellip;{geminiKey.last4}
                    </span>
                  )}
                  {geminiKey.source === "none" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 font-medium text-warn ring-1 ring-warn/30">
                      No key set — Gemini can&apos;t be used yet
                    </span>
                  )}
                </div>
                <Input
                  name="geminiApiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={geminiKey.source === "settings" ? "Enter a new key to rotate it" : "Paste a Gemini API key (AIza…)"}
                />
                {geminiKey.source === "settings" && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-danger">
                    <input type="checkbox" name="remove_geminiApiKey" value="1" className="h-3.5 w-3.5 accent-[var(--accent)]" /> Remove the key set here
                  </label>
                )}
                <p className="text-xs text-fg-muted">
                  Free at aistudio.google.com/apikey — no card required. This one key powers all AI. Never shown again; blank keeps the current key.
                </p>
              </div>

              {/* The monthly ceiling ai-spend.ts enforces. It was read everywhere and
                  settable nowhere, so it sat at 0 = no limit (audit 24 Sept 2026). */}
              <div className="mt-1 max-w-xs space-y-2 border-t border-border/60 pt-3.5">
                <FieldLabel>Monthly AI spend cap</FieldLabel>
                <Input name="aiMonthlySpendCap" type="number" min={0} step="any" defaultValue={s.aiMonthlySpendCap} />
                <p className="text-xs text-fg-muted">AI switches itself off for the rest of the month once this much is spent. 0 means no limit.</p>
              </div>

            </SettingsCard>

            <SettingsCard id="voice" icon={<Mic2 size={15} />} title="Voice intelligence" desc="Dictation language & trusted words." keywords="voice dictation language swahili hindi gujarati dictionary speech">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <FieldLabel>Primary dictation language</FieldLabel>
                  <Select name="voiceLanguage" defaultValue={s.voiceLanguage}>
                    <option value="en-GB">English</option>
                    <option value="sw-TZ">Swahili</option>
                    <option value="hi-IN">Hindi</option>
                    <option value="gu-IN">Gujarati</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>ORI voice dictionary</FieldLabel>
                  <Textarea
                    name="voiceDictionary"
                    rows={7}
                    defaultValue={s.voiceDictionary}
                    placeholder="Add names, companies, places, acronyms, and phrases ORI should preserve..."
                  />
                </div>
              </div>
            </SettingsCard>

            <SaveBar />
          </form>

          {/* AI usage — live per-model dashboard (own endpoints; no form). The
              chat model picker in ORI's chat header writes the same `chatModel`
              setting this reflects. */}
          <SettingsCard id="ai-usage" icon={<Gauge size={15} />} title="AI usage" desc="Live per-model calls, quota & tokens today." keywords="ai usage model quota calls tokens gemini flash gemma remaining budget spend chat model picker reset pacific">
            <AiUsageDashboard />
          </SettingsCard>
        </section>

        {/* ───────────────────────── Automation ───────────────────────── */}
        <section data-group="automation" className="space-y-4">
          <SettingsCard id="automations" icon={<Wrench size={15} />} title="Automations" desc="How hands-off the system runs. Auto · Suggest · Off." keywords="automation rules auto suggest reactions hands-off">
            <AutomationSettings statuses={automationStatuses} />
          </SettingsCard>

          <SettingsCard id="meeting-tasks" icon={<CalendarCheck size={15} />} title="Meetings & scheduling" desc="Turn meetings into tasks and tune how they auto-advance and remind." keywords="meeting task schedule calendar event auto in progress reminder ping recurring">
            <form action={saveSettings} className="space-y-4">
              <input type="hidden" name="__keys" value="meetingTaskMode,meetingTaskCategory,autoAdvanceMeetingTasks,meetingTaskGraceMinutes,eventAttendeePings,recurringMeetingTaskMode,meetingFollowupPrompt,managedCalendarPersonId,eventReminderEmail" />
              <input type="hidden" name="__section" value="automation" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Create a task from a meeting</FieldLabel>
                  <Select name="meetingTaskMode" defaultValue={s.meetingTaskMode}>
                    <option value="company">When a company is set</option>
                    <option value="always">Always</option>
                    <option value="off">Never</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Task category</FieldLabel>
                  <Input name="meetingTaskCategory" defaultValue={s.meetingTaskCategory} placeholder="Meetings" />
                </div>
              </div>
              <FormSwitch
                name="autoAdvanceMeetingTasks"
                defaultChecked={s.autoAdvanceMeetingTasks}
                label="Move the task to In Progress when the meeting starts"
                hint="No deadline is set — the task simply becomes active once the meeting time arrives."
              />
              <div className="sm:w-1/2">
                <FieldLabel>Grace minutes before advancing</FieldLabel>
                <Input name="meetingTaskGraceMinutes" type="number" min={0} max={120} defaultValue={s.meetingTaskGraceMinutes} />
              </div>
              <FormSwitch
                name="eventAttendeePings"
                defaultChecked={s.eventAttendeePings}
                label="Ping attendees before each meeting"
                hint="A push + a message in their Reminders channel, at every reminder time set on the event."
              />
              <FormSwitch
                name="eventReminderEmail"
                defaultChecked={s.eventReminderEmail}
                label="Email the reminder as well"
                hint="Guests with an email address also get the branded “coming up” note."
              />
              <div className="sm:w-1/2">
                <FieldLabel>Keep this person&rsquo;s calendar</FieldLabel>
                <Select name="managedCalendarPersonId" defaultValue={String(s.managedCalendarPersonId || "")}>
                  <option value="">Nobody</option>
                  {portalPeople.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <p className="mt-1.5 text-xs leading-snug text-fg-muted">
                  Every event you create adds them as a guest, so it lands on their Google calendar —
                  not just the ones with a Meet link.
                </p>
              </div>
              <div className="sm:w-1/2">
                <FieldLabel>Recurring meeting tasks</FieldLabel>
                <Select name="recurringMeetingTaskMode" defaultValue={s.recurringMeetingTaskMode}>
                  <option value="occurrence">A fresh task each occurrence</option>
                  <option value="series">One task for the whole series</option>
                </Select>
              </div>
              <FormSwitch
                name="meetingFollowupPrompt"
                defaultChecked={s.meetingFollowupPrompt}
                label="Prompt for the outcome after a meeting"
                hint="If the task is still open when the meeting ends, drop a 'capture the minutes / outcome' note into it."
              />
              <SaveBar />
            </form>
          </SettingsCard>

          <SettingsCard id="tax-legal" icon={<Scale size={15} />} title="Tax & Legal" desc="Pause the area until you have real data. Resumes fresh." keywords="tax legal pause hide obligations statutory administrator">
            <form action={setCommandCentrePause} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.commandCentrePaused ? "Paused" : "Live"}</p>
                <p className="text-xs text-fg-muted">
                  {s.commandCentrePaused
                    ? "Hidden everywhere and dormant. Resume to start fresh from today."
                    : taskCreateOff
                      ? "Visible, but no tasks are created — “Create renewal & notice tasks” is Off under Automations."
                      : "Visible in navigation; obligations that fall due become tasks."}
                </p>
              </div>
              <input type="hidden" name="paused" value={s.commandCentrePaused ? "0" : "1"} />
              <Button type="submit" variant={s.commandCentrePaused ? "primary" : "secondary"}>
                {s.commandCentrePaused ? "Resume" : "Pause"}
              </Button>
            </form>
          </SettingsCard>
        </section>

        {/* ───────────────────────── Portals ───────────────────────── */}
        <section data-group="portals" className="space-y-4">
          {/* Staff portal access */}
          <SettingsCard id="portal" icon={<Users size={15} />} title="Portal access" desc="Give someone a sign-in. Directors and managers use the main screens over their companies; staff their own portal. Revoke any time." keywords="portal staff access password role manager director revoke outreach">
            {sp.portal === "saved" && (
              <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Portal access saved.</p>
            )}
            {sp.portal === "role" && (
              <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Access level updated — it applies the next time they open the portal.</p>
            )}
            {sp.portal === "revoked" && (
              <p className="text-sm text-fg-muted">Portal access revoked. Their records (tasks, messages, documents) are kept.</p>
            )}
            {sp.portal === "short" && (
              <p className="text-sm text-danger">Password must be at least 8 characters.</p>
            )}
            {sp.portal === "error" && (
              <p className="text-sm text-danger">Couldn&apos;t update portal access — please try again.</p>
            )}
            {sp.portal === "pick" && <p className="text-sm text-danger">Choose the person first.</p>}
            {sp.portal === "kept-level" && <p className="text-sm text-warn">Password reset. Their level was kept — a reset never lowers a level; use &ldquo;Change level&rdquo; for that.</p>}
            {sp.portal === "no-companies" && <p className="text-sm text-danger">They have no company on their record, so &ldquo;their companies&rdquo; would mean every company. Add their company on their profile first — nothing was changed.</p>}

            {portalEnabled.length > 0 && (
              <div className="space-y-2">
                <PortalAccessList people={portalEnabled} companies={companies} scope={portalPermsMatrix.scope} />
                <p className="text-xs text-fg-subtle">
                  Changing the access level here doesn&apos;t change their password. <strong className="text-fg-muted">Revoking</strong> only stops them signing in — everything they created (tasks, updates, chat messages, documents, attendance, leave) stays in the system, and you can grant access again at any time.
                </p>
              </div>
            )}

            <form action={setPortalAccess} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
              <div className="sm:col-span-2 lg:col-span-4">
                <FieldLabel>Add access or reset a password</FieldLabel>
              </div>
              <div>
                <Select name="personId" defaultValue="" aria-label="Person">
                  <option value="" disabled>Choose a person…</option>
                  {portalPeople.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.enabled ? " (has access — reset password)" : ""}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Select name="portalRole" defaultValue="staff" aria-label="Access level">
                  {PORTAL_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]} — {SCOPE_WORDS[portalPermsMatrix.scope[r]]}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <FieldLabel>Director only — what they see</FieldLabel>
                <DirectorReachSelect current="all" forGrant />
                <p className="mt-1 text-xs text-fg-subtle">Every company, or only the companies on their record (Main company + &ldquo;Also works for&rdquo;). Ignored for every other level. You can set all of this on the person&apos;s own page too.</p>
              </div>
              <div>
                <RevealPassword name="password" minLength={8} required placeholder="Password (min 8 characters)" />
              </div>
              <Button type="submit"><KeyRound size={13} /> Enable access</Button>
            </form>

            <form action={setDirectorOutreach} className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Director &amp; manager outreach</p>
                <p className="text-xs text-fg-muted">
                  {directorPaused
                    ? "Paused — directors and managers can't draft messages/reminders right now."
                    : "Active — directors and managers can draft messages/reminders (saved to Outbox first)."}
                </p>
              </div>
              <input type="hidden" name="paused" value={directorPaused ? "0" : "1"} />
              <Button type="submit" variant={directorPaused ? "primary" : "secondary"}>
                {directorPaused ? "Resume" : "Pause"}
              </Button>
            </form>
          </SettingsCard>

          <SettingsCard id="portal-permissions" icon={<ShieldCheck size={15} />} title="Roles & permissions" desc="What Staff, Managers, HR and Directors can see and do. Managers match Directors, limited to their companies." keywords="permissions roles staff manager admin hr director scope visibility capabilities create tasks manage complete delete events leave outbox insights requests tabs portal access">
            <PortalPermissionsEditor initial={portalPermsMatrix} action={savePortalPermissionsAction} />
          </SettingsCard>

          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="portalNudges,portalNudgeNotStartedHours,portalNudgeNoUpdateDays,portalNudgeNotStartedMsg,portalNudgeNoUpdateMsg" />
            <input type="hidden" name="__section" value="portals" />

            <SettingsCard id="portal-nudges" icon={<ClipboardList size={15} />} title="Task nudges" desc="The reminder banner above every portal home & board." keywords="portal nudge banner not started reminder staff manager director tasks hero updates">
              <FormSwitch
                name="portalNudges"
                defaultChecked={s.portalNudges}
                label="Show the task nudge banner"
                hint="A calm banner on every portal home / board pointing staff, managers and directors to tasks that need a look."
              />

              <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-3.5 sm:grid-cols-2">
                <div>
                  <FieldLabel>Not started — remind after (hours)</FieldLabel>
                  <Input name="portalNudgeNotStartedHours" type="number" min={0} max={168} defaultValue={s.portalNudgeNotStartedHours} />
                  <p className="mt-1 text-xs text-fg-muted">How long a task can sit at &ldquo;Not Started&rdquo;, untouched, before it&apos;s flagged. Shown to everyone.</p>
                </div>
                <div>
                  <FieldLabel>Raised by me — remind after (days)</FieldLabel>
                  <Input name="portalNudgeNoUpdateDays" type="number" min={0} max={90} defaultValue={s.portalNudgeNoUpdateDays} />
                  <p className="mt-1 text-xs text-fg-muted">How long a task someone raised can go without an update before it&apos;s flagged. Managers, directors &amp; admin only.</p>
                </div>
              </div>

              <div className="space-y-4 border-t border-border/60 pt-3.5">
                <div>
                  <FieldLabel>&ldquo;Not started&rdquo; wording</FieldLabel>
                  <Input name="portalNudgeNotStartedMsg" defaultValue={s.portalNudgeNotStartedMsg} placeholder="not started yet. Please take a look." />
                  <p className="mt-1 text-xs text-fg-muted">Appears right after the count — e.g. &ldquo;3 tasks &hellip;&rdquo;. Blank restores the default.</p>
                </div>
                <div>
                  <FieldLabel>&ldquo;No update&rdquo; wording</FieldLabel>
                  <Input name="portalNudgeNoUpdateMsg" defaultValue={s.portalNudgeNoUpdateMsg} placeholder="you raised with no recent update. Review or send a reminder." />
                  <p className="mt-1 text-xs text-fg-muted">Appears right after the count — e.g. &ldquo;2 tasks &hellip;&rdquo;. Blank restores the default.</p>
                </div>
              </div>
            </SettingsCard>

            <SaveBar />
          </form>

        </section>

        {/* ───────────────────── Email & Integrations ───────────────────── */}
        <section data-group="email" className="space-y-4">
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="emailFromName,emailFrom,emailSignature,emailSignatureImagePath" />
            <input type="hidden" name="__section" value="email" />

            <SettingsCard id="email" icon={<Mail size={15} />} title="Email sending" desc="Sender name, address & signature." keywords="email sender from address signature footer logo invites">
              <EmailStatus
                configured={!!emailCfg}
                provider={emailCfg?.provider ?? null}
                from={emailCfg?.from ?? `${s.emailFromName} <${s.emailFrom}>`}
                defaultTo={s.emailFrom}
              />
              <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Sender name</FieldLabel>
                  <Input name="emailFromName" defaultValue={s.emailFromName} placeholder="Oracle Consultancy" />
                </div>
                <div>
                  <FieldLabel>Sender email address</FieldLabel>
                  <Input name="emailFrom" type="email" defaultValue={s.emailFrom} placeholder="admin@oracle.co.tz" />
                </div>
              </div>
              <div className="max-w-xl">
                <FieldLabel>Email signature / footer</FieldLabel>
                <Textarea
                  name="emailSignature"
                  rows={4}
                  defaultValue={s.emailSignature}
                  placeholder={"Oracle Consultancy\nadmin@oracle.co.tz\n+255 ..."}
                />
                <p className="mt-1 text-xs text-fg-muted">
                  Added to every email (your Gmail signature isn&apos;t). Blank = sender name + address.
                </p>
              </div>
              <div className="max-w-xl space-y-2">
                <FieldLabel>Signature image (logo / branded sign-off)</FieldLabel>
                {signatureImageUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signatureImageUrl}
                      alt="Current signature"
                      className="max-h-20 rounded border border-border bg-white p-1"
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-danger">
                      <input type="checkbox" name="remove_emailSignatureImage" value="1" /> Remove image
                    </label>
                  </div>
                ) : null}
                <Input name="emailSignatureImage" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
                <p className="text-xs text-fg-muted">
                  Shown at the foot of each email. Wide PNG/JPG up to ~360px; transparent looks best.
                </p>
              </div>
            </SettingsCard>

            <SaveBar />
          </form>

          {/* Email automation */}
          <SettingsCard id="email-automation" icon={<Mail size={15} />} title="Email automation" desc={emailCfg ? "Scheduled daily reminders (08:00–18:00)." : "Not connected — prepares Outbox drafts to send with one tap."} keywords="email automation reminders schedule test mode director brief send window cap" className="scroll-mt-24">
            <form action={setEmailAutomation} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${emailTestMode ? "bg-warn-soft/50 ring-1 ring-warn/30" : "bg-bg-subtle/50"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{emailTestMode ? "🧪 Test mode is ON" : "Test mode"}</p>
                <p className="text-xs text-fg-muted">
                  {emailTestMode
                    ? "Every email is redirected to your inbox — nothing reaches staff or clients. Turn off to go live."
                    : "Redirect every outgoing email to your own inbox, so you can trial safely."}
                </p>
              </div>
              <input type="hidden" name="field" value="testMode" />
              <input type="hidden" name="value" value={emailTestMode ? "0" : "1"} />
              <Button type="submit" variant={emailTestMode ? "secondary" : "primary"}>{emailTestMode ? "Turn off" : "Turn on"}</Button>
            </form>

            <form action={setEmailAutomation} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-sm font-medium">All email automation</p>
                <p className="text-xs text-fg-muted">{emailAuto.paused ? "Paused — nothing runs." : "Active."}</p>
              </div>
              <input type="hidden" name="field" value="paused" />
              <input type="hidden" name="value" value={emailAuto.paused ? "0" : "1"} />
              <Button type="submit" variant={emailAuto.paused ? "primary" : "secondary"}>{emailAuto.paused ? "Resume all" : "Pause all"}</Button>
            </form>

            {CATEGORY_META.map((c) => {
              const off = emailAuto.categories[c.key].mode === "off";
              return (
                <form key={c.key} action={setEmailAutomation} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-fg-muted">{off ? "Off." : `On — ${c.onDescription}`}</p>
                  </div>
                  <input type="hidden" name="field" value={c.key} />
                  <input type="hidden" name="value" value={off ? "1" : "0"} />
                  <Button type="submit" variant={off ? "primary" : "secondary"}>{off ? "Turn on" : "Turn off"}</Button>
                </form>
              );
            })}

            {/* How it behaves — send window, daily cap, cooldown, brief weekday */}
            <form action={setAutomationTuning} className="border-t border-border/60 pt-3 space-y-3">
              <p className="text-sm font-medium">How it behaves</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-fg-muted">
                  Send only between (from)
                  <Select wrapperClassName="w-full" name="windowStartHour" defaultValue={String(emailAuto.windowStartHour)} className="mt-1 text-fg">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </Select>
                </label>
                <label className="text-xs text-fg-muted">
                  …and (to)
                  <Select wrapperClassName="w-full" name="windowEndHour" defaultValue={String(emailAuto.windowEndHour)} className="mt-1 text-fg">
                    {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </Select>
                </label>
                <label className="text-xs text-fg-muted">
                  Daily email cap
                  <Input name="dailyCap" type="number" min={1} max={500} defaultValue={emailAuto.dailyCap} className="mt-1" />
                </label>
                <label className="text-xs text-fg-muted">
                  Don&apos;t re-chase within (days)
                  <Input name="cooldownDays" type="number" min={0} max={30} defaultValue={emailAuto.cooldownDays} className="mt-1" />
                </label>
                <label className="text-xs text-fg-muted col-span-2">
                  Send the weekly Director Brief on
                  <Select wrapperClassName="w-full" name="briefDay" defaultValue={String(emailAuto.briefDay)} className="mt-1 text-fg">
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </Select>
                </label>
              </div>
              <Button type="submit" variant="secondary"><Save size={13} /> Save settings</Button>
            </form>

            <form action={sendDirectorBriefNow} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-sm font-medium">Send the Director Brief now</p>
                <p className="text-xs text-fg-muted">One-off — emails the current brief to you immediately (great for a test run).</p>
              </div>
              <Button type="submit" variant="secondary"><Save size={13} /> Send now</Button>
            </form>

            <form action={runEmailAutomationNow} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-sm font-medium">Run all automation now</p>
                <p className="text-xs text-fg-muted">
                  Fires every switched-on category right now (ignores the schedule).
                  {emailTestMode ? " Test mode is on, so it all comes to you." : " ⚠️ Test mode is OFF — this will email staff."}
                </p>
              </div>
              <Button type="submit" variant="secondary"><Save size={13} /> Run now</Button>
            </form>
          </SettingsCard>

          {/* Messaging status */}
          <SettingsCard id="messaging" icon={<MessageCircle size={15} />} title="Messaging" desc={`WhatsApp / SMS channel. Email is ${emailCfg ? "connected" : "not connected"}.`} keywords="messaging whatsapp sms channel outbox drafts">
            <WhatsAppStatus configured={whatsAppOn} defaultTo="+255686450999" />
          </SettingsCard>

          {/* Google Calendar connection */}
          <SettingsCard id="google" icon={<CalendarCheck size={15} />} title="Google Calendar" desc="Connect for real calendar invites & Meet links." keywords="google calendar meet invites connect oauth">
            {!googleStatus.configured ? (
              <p className="text-xs text-warn">
                Not configured yet — the Google client credentials need adding to the app before this can be switched on.
              </p>
            ) : googleStatus.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-success">
                  <Check size={14} /> Connected{googleStatus.email ? ` as ${googleStatus.email}` : ""}
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/api/google/connect" className="text-xs text-fg-muted underline hover:text-fg">
                    Reconnect / switch account
                  </Link>
                  <form action={disconnectGoogleAction}>
                    <Button type="submit" variant="secondary" size="sm">Disconnect</Button>
                  </form>
                </div>
              </div>
            ) : (
              <Link href="/api/google/connect">
                <Button type="button" className="gap-1.5"><CalendarCheck size={15} /> Connect Google Calendar</Button>
              </Link>
            )}
          </SettingsCard>

        </section>

        {/* ───────────────────── Security & Access ───────────────────── */}
        <section data-group="security" className="space-y-4">
          {/* Health check — reads the live environment, changes nothing. */}
          <SettingsCard id="security-check" icon={<ShieldCheck size={15} />} title="Security check" desc="What is protecting this system right now." keywords="security check database row level security rls anon key cookie signing sentry error alerts content security policy csp headers safe">
            <ul className="divide-y divide-border">
              {securityChecks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-2.5">
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      c.state === "ok" ? "bg-success" : c.state === "warn" ? "bg-warn" : "bg-fg-subtle"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">{c.label}</div>
                    <div className="text-xs text-fg-muted">{c.detail}</div>
                    {c.fix && <div className="mt-0.5 text-xs text-fg-subtle">{c.fix}</div>}
                  </div>
                  <span className="ml-auto shrink-0 text-xs uppercase tracking-wide text-fg-subtle">
                    {c.state === "ok" ? "Good" : c.state === "warn" ? "Needs you" : "Unknown"}
                  </span>
                </li>
              ))}
            </ul>
          </SettingsCard>

          {/* Owner sign-in */}
          <SettingsCard id="owner" icon={<KeyRound size={15} />} title="Owner sign-in" desc="Password & identity for the admin system." keywords="owner password sign-in identity admin login security">
            {sp.owner === "saved" && (
              <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Password changed.</p>
            )}
            {sp.owner === "wrong" && <p className="text-sm text-danger">Current password was wrong.</p>}
            {sp.owner === "short" && <p className="text-sm text-danger">New password must be at least 8 characters.</p>}
            {sp.owner === "mismatch" && <p className="text-sm text-danger">The two new passwords didn&apos;t match — nothing was changed.</p>}
            {sp.owner === "identity" && <p className="text-sm text-danger">Your owner name/email didn&apos;t match. Enter the same one you sign in with.</p>}
            {sp.owner === "identity-saved" && <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Owner identity saved.</p>}

            <form action={adminSaveOwnerIdentity} className="grid grid-cols-1 items-end gap-3 border-b border-border/50 pb-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Owner name</FieldLabel>
                <Input name="ownerName" defaultValue={ownerIdentity.name ?? ""} placeholder="e.g. Pulin Manek" autoComplete="name" />
              </div>
              <div>
                <FieldLabel>Owner email</FieldLabel>
                <Input name="ownerEmail" type="email" defaultValue={ownerIdentity.email ?? ""} placeholder="admin@oracle.co.tz" autoComplete="email" />
              </div>
              <div>
                <FieldLabel>Your password</FieldLabel>
                <Input name="current" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" variant="secondary">Save identity</Button>
              <p className="-mt-1 text-xs text-fg-subtle sm:col-span-2">
                When set, the Administrator sign-in requires this name or email <span className="font-medium">and</span> the password. Leave both blank to sign in with the password alone.
              </p>
            </form>

            <form action={adminChangePassword} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
              {(ownerIdentity.name || ownerIdentity.email) && (
                <div className="sm:col-span-2">
                  <FieldLabel>Your owner name or email</FieldLabel>
                  <Input name="identifier" type="text" autoComplete="username" required placeholder={ownerIdentity.email ?? ownerIdentity.name ?? ""} />
                </div>
              )}
              <div>
                <FieldLabel>Current password</FieldLabel>
                <Input name="current" type="password" autoComplete="current-password" required />
              </div>
              <div>
                <FieldLabel>New password (min 8 characters)</FieldLabel>
                <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <div>
                <FieldLabel>New password again</FieldLabel>
                <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <Button type="submit"><KeyRound size={13} /> Change password</Button>
            </form>
            <SignOutForm action={adminLogout}>
              <button type="submit" className="text-xs font-medium text-danger hover:underline">
                Sign out on this device
              </button>
            </SignOutForm>
          </SettingsCard>

          {/* Face ID / fingerprint */}
          <SettingsCard id="passkeys" icon={<ScanFace size={15} />} title="Face ID & fingerprint" desc="Sign in without a password. Biometric stays on device." keywords="passkey face id touch fingerprint biometric webauthn windows hello">
            <PasskeyManager initial={ownerPasskeys} begin={adminBeginPasskey} finish={adminFinishPasskey} remove={adminRemovePasskey} />
          </SettingsCard>

          {/* Claude / MCP access keys */}
          <SettingsCard id="mcp-keys" icon={<Bot size={15} />} title="Claude access" desc="Let Claude read COS and do your day-to-day work in it." keywords="claude mcp ai assistant key token api access connector model context protocol oauth connect phone">
            <p className="mb-3 text-xs leading-snug text-fg-muted">
              Claude can look at everything you can — tasks, people, attendance, calendar, documents,
              the brief — and do the ordinary work: raise tasks, post updates, complete and archive
              them, put meetings in the diary. <strong className="font-medium text-fg">It can never
              delete anything, and it never sends a message on your behalf</strong> — those wait in
              the Outbox for you. Creating a meeting is the one thing that emails anybody, because an
              invitation is part of the meeting. Add it to Claude Code with{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-xs">claude mcp add --transport http cos {appUrl}/api/mcp -H &quot;Authorization: Bearer YOUR_KEY&quot;</code>
              , or add <code className="rounded bg-surface px-1 py-0.5 text-xs">{appUrl}/api/mcp</code> as a connector in Claude on your phone and sign in.
            </p>
            <McpKeyManager initial={mcpKeys} create={createMcpKey} revoke={revokeMcpKey} connections={mcpConnections} revokeConnection={revokeMcpConnection} />
          </SettingsCard>


        </section>

        {/* ───────────────────── Notifications & More ───────────────────── */}
        <section data-group="alerts" className="space-y-4">
          {/* Quiet hours & batching — how non-urgent alerts behave */}
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="quietHoursStart,quietHoursEnd,notifyDigest" />
            <input type="hidden" name="__section" value="alerts" />
            <SettingsCard id="quiet-hours" icon={<Bell size={15} />} title="Quiet hours & batching" desc="Hold routine alerts; urgent ones always go through." keywords="quiet hours batching digest notifications mute window">
              <div className="max-w-xl space-y-3">
                <div>
                  <p className="text-xs text-fg-muted">Hold routine alerts in this window (Dar es Salaam time). Blank = off; can wrap midnight.</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-xs">
                    <div>
                      <FieldLabel>From</FieldLabel>
                      <Input name="quietHoursStart" type="time" defaultValue={s.quietHoursStart} />
                    </div>
                    <div>
                      <FieldLabel>To</FieldLabel>
                      <Input name="quietHoursEnd" type="time" defaultValue={s.quietHoursEnd} />
                    </div>
                  </div>
                </div>
                <FormSwitch name="notifyDigest" defaultChecked={s.notifyDigest} label="Batch routine alerts into a digest" hint="Everyday alerts arrive together once an hour (chat messages still come one by one). Urgent ones buzz straight away." />
              </div>
            </SettingsCard>
            <SaveBar />
          </form>

          {/* Design */}
          {/* Maintenance / advanced */}
          <SettingsCard id="maintenance" icon={<Wrench size={15} />} title="Maintenance" desc="Rarely needed tidy-up tools." keywords="maintenance rebuild summaries resync advanced tools">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Rebuild task summaries</p>
                <p className="text-xs text-fg-muted">Only if a task&apos;s latest note looks wrong. Rebuilds the short &ldquo;latest note&rdquo; line on each task from its full update history.</p>
              </div>
              <ResyncLatestUpdateButton />
            </div>
          </SettingsCard>
        </section>
      </SettingsSections>
    </StudioScope>
  );
}
