import { PageHeader, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { ResyncLatestUpdateButton } from "@/components/resync-button";
import { NavSettings } from "@/components/nav-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { SettingsCard } from "@/components/settings-card";
import { SettingsSections, type SettingsGroup } from "@/components/settings-sections";
import { getAppSettings, getEmailConfig, getGroqKeyPreview, getGeminiKeyPreview, getOcrSpaceKeyPreview, SWIPE_ACTIONS } from "@/lib/settings";
import { whatsAppConfigured } from "@/lib/whatsapp";
import { getGoogleStatus } from "@/lib/google";
import { signDocumentFile } from "@/lib/documents";
import { sb } from "@/db/supabase";
import { saveSettings, setPortalAccess, setPortalRole, revokePortalAccess, disconnectGoogleAction, setDirectorOutreach, setEmailAutomation, setAutomationTuning, sendDirectorBriefNow, runEmailAutomationNow, setCommandCentrePause, savePortalPermissionsAction } from "./actions";
import { getPortalPermissions } from "@/lib/portal-permissions-store";
import { resolveMatrix } from "@/lib/portal-permissions";
import { PortalPermissionsEditor } from "@/components/portal-permissions-editor";
import { RevealPassword } from "@/components/reveal-password";
import { getAutomationConfig, CATEGORY_META } from "@/lib/automation";
import { AutomationSettings } from "@/components/automation-settings";
import { getAutomationRuleStatuses, getRecordsConfidence } from "@/app/automations/actions";
import { DropboxSettings } from "@/components/dropbox-settings";
import { getDropboxStatus } from "@/lib/dropbox";
import { EmailStatus } from "./email-test";
import { WhatsAppStatus } from "./whatsapp-test";
import { adminChangePassword, adminLogout, adminSaveOwnerIdentity } from "../login/actions";
import { adminBeginPasskey, adminFinishPasskey, adminRemovePasskey } from "./passkey-actions";
import { getOwnerIdentity } from "@/lib/admin-auth";
import { listCredentials } from "@/lib/webauthn";
import { PasskeyManager } from "@/components/passkey-manager";
import { DirectorScopePicker } from "@/components/director-scope-picker";
import { FormSwitch } from "@/components/form-switch";
import Link from "next/link";
import { Save, SlidersHorizontal, MapPin, Sparkles, MessageCircle, Check, LayoutGrid, Mic2, Bell, Hand, Palette, ArrowRight, KeyRound, CalendarCheck, ScanFace, Mail, Users, Wrench, FolderSync, Scale, MonitorSmartphone, ClipboardList, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

// The Settings page is sectioned: the rail picks a group, only that group's cards
// show. Order here = rail order. `cards` lets a deep link to #card-id open the
// group that holds it.
const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: "general", label: "General", icon: "SlidersHorizontal", cards: ["about", "risk", "location", "swipe", "navigation"] },
  { id: "ai", label: "AI & Voice", icon: "Sparkles", cards: ["ai", "voice"] },
  { id: "automation", label: "Automation", icon: "Wrench", cards: ["automations", "meeting-tasks", "tax-legal"] },
  { id: "portals", label: "Portals", icon: "MonitorSmartphone", cards: ["portal-nudges", "portal-permissions"] },
  { id: "email", label: "Email & Integrations", icon: "Mail", cards: ["email", "email-automation", "messaging", "google", "dropbox"] },
  { id: "security", label: "Security & Access", icon: "KeyRound", cards: ["owner", "passkeys", "portal"] },
  { id: "alerts", label: "Notifications & More", icon: "Bell", cards: ["notifications", "quiet-hours", "design", "maintenance"] },
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
  searchParams: Promise<{ saved?: string; portal?: string; owner?: string; google?: string; section?: string }>;
}) {
  const [s, sp, googleStatus, { data: peopleRows }, { data: companyRows }, ownerIdentity] = await Promise.all([
    getAppSettings(),
    searchParams,
    getGoogleStatus(),
    sb
      .from("people")
      .select("id,name,portal_password_hash,portal_last_login_at,portal_role,director_company_id,director_companies(company_id)")
      .eq("active", true)
      .order("name"),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    getOwnerIdentity(),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const ownerPasskeys = await listCredentials({ kind: "admin" });
  const groqKey = await getGroqKeyPreview();
  const geminiKey = await getGeminiKeyPreview();
  const ocrKey = await getOcrSpaceKeyPreview();
  const signatureImageUrl = s.emailSignatureImagePath
    ? await signDocumentFile(s.emailSignatureImagePath, 3600)
    : null;
  const emailCfg = await getEmailConfig();
  const portalPeople = (peopleRows ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    enabled: Boolean(p.portal_password_hash),
    lastLogin: p.portal_last_login_at as string | null,
    role: ((p.portal_role as string | null) ?? "staff") as "staff" | "manager" | "director",
    directorCompanyIds: (() => {
      const raw = p.director_companies as { company_id: number }[] | { company_id: number } | null | undefined;
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const ids = rows.map((r) => r.company_id as number);
      if (ids.length === 0 && p.director_company_id != null) return [p.director_company_id as number];
      return ids;
    })(),
  }));
  const portalEnabled = portalPeople.filter((p) => p.enabled);
  const { data: dirKill } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  const directorPaused = (dirKill?.value as string | null) === "1";
  const whatsAppOn = whatsAppConfigured();
  const emailAuto = await getAutomationConfig();
  const { data: tmRow } = await sb.from("settings").select("value").eq("key", "email.testMode").maybeSingle();
  const emailTestMode = (tmRow?.value as string | null) === "1";
  const automationStatuses = await getAutomationRuleStatuses();
  const recordsConfidence = await getRecordsConfidence();
  const dropboxStatus = await getDropboxStatus();
  const portalPermsMatrix = resolveMatrix(await getPortalPermissions());

  return (
    <div className="mx-auto max-w-5xl">
      <HrmsCrumbs />
      <PageHeader
        title="Settings"
        sub="Live controls — changes take effect across the whole system."
      />

      {(sp.saved || sp.google) && (
        <div className="mt-4 space-y-2">
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

      <SettingsSections groups={SETTINGS_GROUPS} initial={sp.section}>
        {/* ───────────────────────── General ───────────────────────── */}
        <section data-group="general" className="space-y-4">
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="operatorName,dueSoonDays,stalledDays,agingDays,weatherCity,weatherLat,weatherLon,swipeRightAction,swipeLeftAction" />
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
                  <FieldLabel>Stalled — blocked over (days)</FieldLabel>
                  <Input name="stalledDays" type="number" min={0} defaultValue={s.stalledDays} />
                </div>
                <div>
                  <FieldLabel>Aging — open over (days)</FieldLabel>
                  <Input name="agingDays" type="number" min={0} defaultValue={s.agingDays} />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard id="location" icon={<MapPin size={15} />} title="Location & weather" desc="Drives the welcome-screen weather." keywords="city latitude longitude coordinates weather">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <FieldLabel>City name</FieldLabel>
                  <Input name="weatherCity" defaultValue={s.weatherCity} placeholder="e.g. Dar es Salaam" />
                </div>
                <div>
                  <FieldLabel>Latitude</FieldLabel>
                  <Input name="weatherLat" type="number" step="any" defaultValue={s.weatherLat} />
                </div>
                <div>
                  <FieldLabel>Longitude</FieldLabel>
                  <Input name="weatherLon" type="number" step="any" defaultValue={s.weatherLon} />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard id="swipe" icon={<Hand size={15} />} title="Swipe actions" desc="Left / right swipe on a task row." keywords="swipe gesture complete escalate task row">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Swipe right</FieldLabel>
                  <Select name="swipeRightAction" defaultValue={s.swipeRightAction}>
                    {SWIPE_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Swipe left</FieldLabel>
                  <Select name="swipeLeftAction" defaultValue={s.swipeLeftAction}>
                    {SWIPE_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </Select>
                </div>
              </div>
            </SettingsCard>

            <SaveBar />
          </form>

          <SettingsCard id="navigation" icon={<LayoutGrid size={15} />} title="Navigation" desc="Pin your most-used pages. Saves automatically." keywords="pin nav pages search command menu shortcuts">
            <NavSettings />
          </SettingsCard>
        </section>

        {/* ───────────────────────── AI & Voice ───────────────────────── */}
        <section data-group="ai" className="space-y-4">
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="aiEnabled,aiHighQuality,semanticSearch,aiProvider,groqApiKey,geminiApiKey,ocrSpaceApiKey,voiceLanguage,voiceDictionary" />
            <input type="hidden" name="__section" value="ai" />

            <SettingsCard id="ai" icon={<Sparkles size={15} />} title="AI assistance" desc="Master switch for all AI features." keywords="ai groq ask polish drafting meeting semantic search key model">
              <div className="grid grid-cols-1 gap-2">
                <FormSwitch name="aiEnabled" defaultChecked={s.aiEnabled} label="Enable AI features" hint="Off runs the whole system manually — nothing breaks." />
                <FormSwitch name="aiHighQuality" defaultChecked={s.aiHighQuality} label="Higher-quality reading" hint="Stronger model for documents & minutes — more accurate, a little slower." />
                <FormSwitch name="semanticSearch" defaultChecked={s.semanticSearch} label="Semantic search (ORI)" hint="Find by meaning, not just words. Needs the one-time setup (SEMANTIC_SEARCH.md)." />
              </div>

              {/* AI provider — Groq (default) or Google Gemini (free tier, native
                  vision — the recommended Groq replacement). Selecting Gemini takes
                  effect once its key is set below; otherwise it stays on Groq. */}
              <div className="mt-1 max-w-xl space-y-2 border-t border-border/60 pt-3.5">
                <FieldLabel>AI provider</FieldLabel>
                <Select name="aiProvider" defaultValue={s.aiProvider}>
                  <option value="groq">Groq (fast; models retire often; no vision after 17 Jul)</option>
                  <option value="gemini">Google Gemini (free tier · reads scans · recommended)</option>
                </Select>
                <p className="text-[11px] text-fg-muted">
                  Powers document reading, Ask ORI, dictation polish and minutes. Gemini needs a free key (below) from aistudio.google.com — no card required.
                </p>
              </div>

              {/* In-app Gemini key */}
              <div className="mt-1 max-w-xl space-y-2">
                <FieldLabel>Gemini key (Google)</FieldLabel>
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
                <p className="text-[11px] text-fg-muted">
                  Free at aistudio.google.com/apikey. Never shown again; blank keeps the current key.
                </p>
              </div>

              {/* In-app Groq key — set/rotate without a redeploy */}
              <div className="mt-1 max-w-xl space-y-2 border-t border-border/60 pt-3.5">
                <FieldLabel>AI key (Groq)</FieldLabel>
                <div className="flex items-center gap-2 text-xs">
                  {groqKey.source === "settings" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success ring-1 ring-success/30">
                      <Check size={12} /> Key set here · ends &hellip;{groqKey.last4}
                    </span>
                  )}
                  {groqKey.source === "env" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/70 px-2.5 py-1 font-medium text-fg-muted ring-1 ring-border">
                      Using built-in key · ends &hellip;{groqKey.last4}
                    </span>
                  )}
                  {groqKey.source === "none" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 font-medium text-warn ring-1 ring-warn/30">
                      No key — AI runs on manual fallbacks
                    </span>
                  )}
                </div>
                <Input
                  name="groqApiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={groqKey.source === "settings" ? "Enter a new key to rotate it" : "Paste a Groq API key (gsk_…)"}
                />
                {groqKey.source === "settings" && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-danger">
                    <input type="checkbox" name="remove_groqApiKey" value="1" className="h-3.5 w-3.5 accent-[var(--accent)]" /> Remove the key set here (fall back to the built-in one)
                  </label>
                )}
                <p className="text-[11px] text-fg-muted">
                  Set or rotate the key here to fix AI instantly — overrides the built-in one. Never shown again; blank keeps the current key.
                </p>
              </div>

              {/* OCR.space scan-reading key — the cloud safety net that keeps scanned
                  documents auto-filing after the Groq vision shutdown (17 Jul 2026). */}
              <div className="mt-1 max-w-xl space-y-2 border-t border-border/60 pt-3.5">
                <FieldLabel>Scan-reading key (OCR.space)</FieldLabel>
                <div className="flex items-center gap-2 text-xs">
                  {ocrKey.source === "settings" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success ring-1 ring-success/30">
                      <Check size={12} /> Key set here · ends &hellip;{ocrKey.last4}
                    </span>
                  )}
                  {ocrKey.source === "env" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/70 px-2.5 py-1 font-medium text-fg-muted ring-1 ring-border">
                      Using built-in key · ends &hellip;{ocrKey.last4}
                    </span>
                  )}
                  {ocrKey.source === "none" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 font-medium text-warn ring-1 ring-warn/30">
                      No key — scans fall back to the slower built-in reader
                    </span>
                  )}
                </div>
                <Input
                  name="ocrSpaceApiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={ocrKey.source === "settings" ? "Enter a new key to rotate it" : "Paste an OCR.space API key"}
                />
                {ocrKey.source === "settings" && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-danger">
                    <input type="checkbox" name="remove_ocrSpaceApiKey" value="1" className="h-3.5 w-3.5 accent-[var(--accent)]" /> Remove the key set here (fall back to the built-in one)
                  </label>
                )}
                <p className="text-[11px] text-fg-muted">
                  Reads scanned documents and photos when the AI vision model is unavailable. Free at ocr.space/ocrapi (~25,000 pages/month). Never shown again; blank keeps the current key.
                </p>
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
        </section>

        {/* ───────────────────────── Automation ───────────────────────── */}
        <section data-group="automation" className="space-y-4">
          <SettingsCard id="automations" icon={<Wrench size={15} />} title="Automations" desc="How hands-off the system runs. Auto · Suggest · Off." keywords="automation rules auto suggest reactions hands-off">
            <AutomationSettings statuses={automationStatuses} recordsConfidence={recordsConfidence} />
          </SettingsCard>

          <SettingsCard id="meeting-tasks" icon={<CalendarCheck size={15} />} title="Meetings & scheduling" desc="Turn meetings into tasks and tune how they auto-advance and remind." keywords="meeting task schedule calendar event auto in progress reminder ping recurring">
            <form action={saveSettings} className="space-y-4">
              <input type="hidden" name="__keys" value="meetingTaskMode,meetingTaskCategory,autoAdvanceMeetingTasks,meetingTaskGraceMinutes,eventAttendeePings,recurringMeetingTaskMode,meetingFollowupPrompt" />
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
                hint="A push + a message in their Reminders channel, on top of the calendar's own alarm."
              />
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

          <SettingsCard id="tax-legal" icon={<Scale size={15} />} title="Tax & Legal" desc="Pause the area until you have real data. Resumes fresh." keywords="tax legal pause hide obligations statutory command centre">
            <form action={setCommandCentrePause} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.commandCentrePaused ? "Paused" : "Live"}</p>
                <p className="text-[11px] text-fg-muted">
                  {s.commandCentrePaused
                    ? "Hidden everywhere and dormant. Resume to start fresh from today."
                    : "Visible in navigation; recurring obligations can spawn tasks."}
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
                  <p className="mt-1 text-[11px] text-fg-muted">How long a task can sit at &ldquo;Not Started&rdquo;, untouched, before it&apos;s flagged. Shown to everyone.</p>
                </div>
                <div>
                  <FieldLabel>Raised by me — remind after (days)</FieldLabel>
                  <Input name="portalNudgeNoUpdateDays" type="number" min={0} max={90} defaultValue={s.portalNudgeNoUpdateDays} />
                  <p className="mt-1 text-[11px] text-fg-muted">How long a task someone raised can go without an update before it&apos;s flagged. Managers, directors &amp; admin only.</p>
                </div>
              </div>

              <div className="space-y-4 border-t border-border/60 pt-3.5">
                <div>
                  <FieldLabel>&ldquo;Not started&rdquo; wording</FieldLabel>
                  <Input name="portalNudgeNotStartedMsg" defaultValue={s.portalNudgeNotStartedMsg} placeholder="not started yet. Please take a look." />
                  <p className="mt-1 text-[11px] text-fg-muted">Appears right after the count — e.g. &ldquo;3 tasks &hellip;&rdquo;. Blank restores the default.</p>
                </div>
                <div>
                  <FieldLabel>&ldquo;No update&rdquo; wording</FieldLabel>
                  <Input name="portalNudgeNoUpdateMsg" defaultValue={s.portalNudgeNoUpdateMsg} placeholder="you raised with no recent update. Review or send a reminder." />
                  <p className="mt-1 text-[11px] text-fg-muted">Appears right after the count — e.g. &ldquo;2 tasks &hellip;&rdquo;. Blank restores the default.</p>
                </div>
              </div>
            </SettingsCard>

            <SaveBar />
          </form>

          <SettingsCard id="portal-permissions" icon={<ShieldCheck size={15} />} title="Roles & permissions" desc="Full control over what Staff, Managers, Admin & Directors can see and do." keywords="permissions roles staff manager admin hr director scope visibility capabilities create tasks manage complete delete events leave outbox insights requests tabs portal access">
            <PortalPermissionsEditor initial={portalPermsMatrix} action={savePortalPermissionsAction} />
          </SettingsCard>
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
                <p className="mt-1 text-[11px] text-fg-muted">
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
                <p className="text-[11px] text-fg-muted">
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
                <p className="text-[11px] text-fg-muted">
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
                <p className="text-[11px] text-fg-muted">{emailAuto.paused ? "Paused — nothing runs." : "Active."}</p>
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
                    <p className="text-[11px] text-fg-muted">{off ? "Off." : `On — ${c.onDescription}`}</p>
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
                <label className="text-[11px] text-fg-muted">
                  Send only between (from)
                  <select name="windowStartHour" defaultValue={String(emailAuto.windowStartHour)} className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-fg">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-fg-muted">
                  …and (to)
                  <select name="windowEndHour" defaultValue={String(emailAuto.windowEndHour)} className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-fg">
                    {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-fg-muted">
                  Daily email cap
                  <Input name="dailyCap" type="number" min={1} max={500} defaultValue={emailAuto.dailyCap} className="mt-1" />
                </label>
                <label className="text-[11px] text-fg-muted">
                  Don&apos;t re-chase within (days)
                  <Input name="cooldownDays" type="number" min={0} max={30} defaultValue={emailAuto.cooldownDays} className="mt-1" />
                </label>
                <label className="text-[11px] text-fg-muted col-span-2">
                  Send the weekly Director Brief on
                  <select name="briefDay" defaultValue={String(emailAuto.briefDay)} className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-fg">
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </label>
              </div>
              <Button type="submit" variant="secondary"><Save size={13} /> Save settings</Button>
            </form>

            <form action={sendDirectorBriefNow} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-sm font-medium">Send the Director Brief now</p>
                <p className="text-[11px] text-fg-muted">One-off — emails the current brief to you immediately (great for a test run).</p>
              </div>
              <Button type="submit" variant="secondary"><Save size={13} /> Send now</Button>
            </form>

            <form action={runEmailAutomationNow} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="text-sm font-medium">Run all automation now</p>
                <p className="text-[11px] text-fg-muted">
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

          {/* Dropbox inbox connector */}
          <SettingsCard id="dropbox" icon={<FolderSync size={15} />} title="Dropbox inbox" desc="Auto-pull files from a watched folder. Read-only." keywords="dropbox inbox folder sync files import" className="scroll-mt-24">
            <DropboxSettings status={dropboxStatus} />
          </SettingsCard>
        </section>

        {/* ───────────────────── Security & Access ───────────────────── */}
        <section data-group="security" className="space-y-4">
          {/* Owner sign-in */}
          <SettingsCard id="owner" icon={<KeyRound size={15} />} title="Owner sign-in" desc="Password & identity for the admin system." keywords="owner password sign-in identity admin login security">
            {sp.owner === "saved" && (
              <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Password changed.</p>
            )}
            {sp.owner === "wrong" && <p className="text-sm text-danger">Current password was wrong.</p>}
            {sp.owner === "short" && <p className="text-sm text-danger">New password must be at least 8 characters.</p>}
            {sp.owner === "identity" && <p className="text-sm text-danger">Your owner name/email didn&apos;t match. Enter the same one you sign in with.</p>}
            {sp.owner === "identity-saved" && <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Owner identity saved.</p>}

            <form action={adminSaveOwnerIdentity} className="grid grid-cols-1 items-end gap-3 border-b border-border/50 pb-4 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <FieldLabel>Owner name</FieldLabel>
                <Input name="ownerName" defaultValue={ownerIdentity.name ?? ""} placeholder="e.g. Pulin Manek" autoComplete="name" />
              </div>
              <div>
                <FieldLabel>Owner email</FieldLabel>
                <Input name="ownerEmail" type="email" defaultValue={ownerIdentity.email ?? ""} placeholder="admin@oracle.co.tz" autoComplete="email" />
              </div>
              <Button type="submit" variant="secondary">Save identity</Button>
              <p className="-mt-1 text-[11px] text-fg-subtle sm:col-span-3">
                When set, the Command Centre sign-in requires this name or email <span className="font-medium">and</span> the password. Leave both blank to sign in with the password alone.
              </p>
            </form>

            <form action={adminChangePassword} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              {(ownerIdentity.name || ownerIdentity.email) && (
                <div className="sm:col-span-3">
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
              <Button type="submit"><KeyRound size={13} /> Change password</Button>
            </form>
            <form action={adminLogout}>
              <button type="submit" className="text-xs font-medium text-danger hover:underline">
                Sign out on this device
              </button>
            </form>
          </SettingsCard>

          {/* Face ID / fingerprint */}
          <SettingsCard id="passkeys" icon={<ScanFace size={15} />} title="Face ID & fingerprint" desc="Sign in without a password. Biometric stays on device." keywords="passkey face id touch fingerprint biometric webauthn windows hello">
            <PasskeyManager initial={ownerPasskeys} begin={adminBeginPasskey} finish={adminFinishPasskey} remove={adminRemovePasskey} />
          </SettingsCard>

          {/* Staff portal access */}
          <SettingsCard id="portal" icon={<Users size={15} />} title="Staff portal access" desc="Give staff a /portal sign-in. Revoke any time." keywords="portal staff access password role manager director revoke outreach">
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

            {portalEnabled.length > 0 && (
              <div className="space-y-2">
                <FieldLabel>People with access</FieldLabel>
                {portalEnabled.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-bg-subtle/60 px-3 py-2.5 ring-1 ring-border">
                    <span className="min-w-0 grow text-sm font-medium truncate">{p.name}</span>
                    <span className="text-[11px] text-fg-subtle">
                      {p.lastLogin
                        ? `Last in ${new Date(p.lastLogin).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : "Never signed in"}
                    </span>
                    {/* Change role without resetting the password. */}
                    <form action={setPortalRole} className="flex items-center gap-1.5">
                      <input type="hidden" name="personId" value={p.id} />
                      <Select name="portalRole" defaultValue={p.role} className="h-8 text-xs">
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="hr">Admin</option>
                        <option value="director">Director</option>
                      </Select>
                      {/* Director scope: none = whole portfolio; one or more companies
                          = Company Director. Ignored server-side unless role Director. */}
                      <DirectorScopePicker companies={companies} selected={p.directorCompanyIds} />
                      <Button type="submit" variant="secondary" size="sm">Save</Button>
                    </form>
                    <form action={revokePortalAccess}>
                      <input type="hidden" name="personId" value={p.id} />
                      <button type="submit" className="text-xs font-medium text-danger hover:underline">Revoke</button>
                    </form>
                  </div>
                ))}
                <p className="text-[11px] text-fg-subtle">
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
                  <option value="staff">Staff — own tasks only</option>
                  <option value="manager">Manager — own + direct reports&apos; + own company&apos;s tasks, can complete</option>
                  <option value="hr">Admin — every company&apos;s tasks, can create across all</option>
                  <option value="director">Director — board view + create tasks/events</option>
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <FieldLabel>If Director — scope (optional)</FieldLabel>
                <DirectorScopePicker companies={companies} selected={[]} />
              </div>
              <div>
                <RevealPassword name="password" minLength={8} required placeholder="Password (min 8 characters)" />
              </div>
              <Button type="submit"><KeyRound size={13} /> Enable access</Button>
            </form>

            <form action={setDirectorOutreach} className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Director outreach</p>
                <p className="text-[11px] text-fg-muted">
                  {directorPaused
                    ? "Paused — directors can't draft messages/reminders right now."
                    : "Active — directors can draft messages/reminders (saved to Outbox first)."}
                </p>
              </div>
              <input type="hidden" name="paused" value={directorPaused ? "0" : "1"} />
              <Button type="submit" variant={directorPaused ? "primary" : "secondary"}>
                {directorPaused ? "Resume" : "Pause"}
              </Button>
            </form>
          </SettingsCard>
        </section>

        {/* ───────────────────── Notifications & More ───────────────────── */}
        <section data-group="alerts" className="space-y-4">
          {/* Notifications */}
          <SettingsCard id="notifications" icon={<Bell size={15} />} title="Notifications" desc="Device alerts for overdue, escalated & due-today tasks." keywords="notifications push alerts device overdue escalated reminders iphone">
            <NotificationSettings />
          </SettingsCard>

          {/* Quiet hours & batching — how non-urgent alerts behave */}
          <form action={saveSettings} className="space-y-4">
            <input type="hidden" name="__keys" value="quietHoursStart,quietHoursEnd,notifyDigest" />
            <input type="hidden" name="__section" value="alerts" />
            <SettingsCard id="quiet-hours" icon={<Bell size={15} />} title="Quiet hours & batching" desc="Hold routine alerts; urgent ones always go through." keywords="quiet hours batching digest notifications mute window">
              <div className="max-w-xl space-y-3">
                <div>
                  <p className="text-[11px] text-fg-muted">Hold routine alerts in this window (Dar es Salaam time). Blank = off; can wrap midnight.</p>
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
                <FormSwitch name="notifyDigest" defaultChecked={s.notifyDigest} label="Batch routine alerts into a digest" hint="Group everyday alerts into a summary. Urgent ones still buzz immediately." />
              </div>
            </SettingsCard>
            <SaveBar />
          </form>

          {/* Design */}
          <SettingsCard id="design" icon={<Palette size={15} />} title="Design" desc="The living Aurora gallery." keywords="design aurora gallery colours glass theme">
            <Link href="/design" className="btn-rim inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-muted">
              <Palette size={14} /> Open the design gallery <ArrowRight size={14} className="text-fg-muted" />
            </Link>
          </SettingsCard>

          {/* Maintenance / advanced */}
          <SettingsCard id="maintenance" icon={<Wrench size={15} />} title="Maintenance" desc="Rarely needed tidy-up tools. Safe to run." keywords="maintenance rebuild summaries resync advanced tools">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Rebuild task summaries</p>
                <p className="text-[11px] text-fg-muted">Only if a task&apos;s latest note looks wrong. Rebuilds the short &ldquo;latest note&rdquo; line on each task from its full update history.</p>
              </div>
              <ResyncLatestUpdateButton />
            </div>
          </SettingsCard>
        </section>
      </SettingsSections>
    </div>
  );
}
