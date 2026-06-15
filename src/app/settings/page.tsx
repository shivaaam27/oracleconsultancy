import { PageHeader, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { ResyncLatestUpdateButton } from "@/components/resync-button";
import { NavSettings } from "@/components/nav-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { SettingsCard } from "@/components/settings-card";
import { SettingsNav } from "@/components/settings-nav";
import { getAppSettings, getEmailConfig, SWIPE_ACTIONS } from "@/lib/settings";
import { whatsAppConfigured } from "@/lib/whatsapp";
import { getGoogleStatus } from "@/lib/google";
import { signDocumentFile } from "@/lib/documents";
import { sb } from "@/db/supabase";
import { saveSettings, setPortalAccess, setPortalRole, revokePortalAccess, disconnectGoogleAction, setDirectorOutreach, setEmailAutomation, sendDirectorBriefNow, runEmailAutomationNow } from "./actions";
import { RevealPassword } from "@/components/reveal-password";
import { getAutomationConfig } from "@/lib/email-automation";
import { EmailStatus } from "./email-test";
import { adminChangePassword, adminLogout, adminSaveOwnerIdentity } from "../login/actions";
import { adminBeginPasskey, adminFinishPasskey, adminRemovePasskey } from "./passkey-actions";
import { getOwnerIdentity } from "@/lib/admin-auth";
import { listCredentials } from "@/lib/webauthn";
import { PasskeyManager } from "@/components/passkey-manager";
import Link from "next/link";
import { Save, SlidersHorizontal, MapPin, Sparkles, MessageCircle, Check, LayoutGrid, Mic2, Bell, Hand, Palette, ArrowRight, KeyRound, CalendarCheck, ScanFace, Mail, Users, Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; portal?: string; owner?: string; google?: string }>;
}) {
  const [s, sp, googleStatus, { data: peopleRows }, ownerIdentity] = await Promise.all([
    getAppSettings(),
    searchParams,
    getGoogleStatus(),
    sb
      .from("people")
      .select("id,name,portal_password_hash,portal_last_login_at,portal_role")
      .eq("active", true)
      .order("name"),
    getOwnerIdentity(),
  ]);
  const ownerPasskeys = await listCredentials({ kind: "admin" });
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
  }));
  const portalEnabled = portalPeople.filter((p) => p.enabled);
  const { data: dirKill } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
  const directorPaused = (dirKill?.value as string | null) === "1";
  const whatsAppOn = whatsAppConfigured();
  const emailAuto = await getAutomationConfig();
  const { data: tmRow } = await sb.from("settings").select("value").eq("key", "email.testMode").maybeSingle();
  const emailTestMode = (tmRow?.value as string | null) === "1";

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

      <div className="mt-5 lg:grid lg:grid-cols-[11rem_1fr] lg:gap-6">
        <SettingsNav />

        <div className="min-w-0 space-y-4">
          {/* About you */}
          <form action={saveSettings} className="space-y-4">
            <SettingsCard id="about" icon={<Sparkles size={15} />} title="About you" desc="Your name — used to greet you in the Oracle Intelligence assistant.">
              <div className="max-w-xs">
                <FieldLabel>Your name</FieldLabel>
                <Input name="operatorName" defaultValue={s.operatorName} placeholder="e.g. Sunny" />
              </div>
            </SettingsCard>

            {/* Email sending */}
            <SettingsCard id="email" icon={<Mail size={15} />} title="Email sending" desc="The name and address your outgoing email (e.g. calendar invites) is sent from. You can change this any time.">
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
                  Added to the bottom of every email the system sends. Your normal Gmail signature is
                  not included on these messages, so set it here. Leave blank to use the sender name and
                  address.
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
                  Embedded inline at the foot of each email (PNG/JPG). It always renders for the
                  recipient. Use a wide image up to ~360px; transparent PNG looks best.
                </p>
              </div>
            </SettingsCard>

            {/* Risk rules */}
            <SettingsCard id="risk" icon={<SlidersHorizontal size={15} />} title="Risk rules" desc="How the system decides when a task needs attention. Changing these instantly re-colours every task.">
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

            {/* Location & weather */}
            <SettingsCard id="location" icon={<MapPin size={15} />} title="Location & weather" desc="Shown on the welcome screen. Coordinates drive the live weather (uses a free, keyless source).">
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

            {/* AI */}
            <SettingsCard id="ai" icon={<Sparkles size={15} />} title="AI assistance" desc="Master switch for all AI features (Ask, polish, drafting, meeting extraction). Turn off to run the system fully manually — everything keeps working without AI.">
              <label className="flex cursor-pointer select-none items-center gap-3">
                <input
                  type="checkbox"
                  name="aiEnabled"
                  defaultChecked={s.aiEnabled}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-sm">Enable AI features</span>
              </label>
            </SettingsCard>

            {/* Voice */}
            <SettingsCard id="voice" icon={<Mic2 size={15} />} title="Voice intelligence" desc="Dictation language and trusted words used when Oracle Intelligence cleans rough speech into polished notes.">
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
                  <FieldLabel>Oracle Intelligence voice dictionary</FieldLabel>
                  <Textarea
                    name="voiceDictionary"
                    rows={7}
                    defaultValue={s.voiceDictionary}
                    placeholder="Add names, companies, places, acronyms, and phrases Oracle Intelligence should preserve..."
                  />
                </div>
              </div>
            </SettingsCard>

            {/* Swipe actions */}
            <SettingsCard id="swipe" icon={<Hand size={15} />} title="Swipe actions" desc="What a left or right swipe does on a task row (Oracle Consultancy Home list). Applies as soon as you save.">
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

            {/* Messaging status */}
            <SettingsCard id="messaging" icon={<MessageCircle size={15} />} title="Messaging" desc={`Email sending is ${emailCfg ? "connected" : "not connected"}. Until a channel is connected, the Outbox prepares copy-ready drafts with one-tap send links.`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">WhatsApp (Cloud API)</p>
                  <p className="text-[11px] text-fg-muted">
                    {whatsAppOn
                      ? "Connected — proactive messages send via approved templates; replies (within 24h) send as text."
                      : "Not connected — messages fall back to one-tap wa.me links. Add WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID in Vercel."}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${whatsAppOn ? "bg-success-soft text-success" : "bg-bg-muted text-fg-muted"}`}>
                  {whatsAppOn ? "Connected" : "Not set up"}
                </span>
              </div>
            </SettingsCard>

            <div className="sticky bottom-3 z-10 flex justify-end">
              <Button type="submit" className="shadow-lg"><Save size={13} /> Save changes</Button>
            </div>
          </form>

          {/* Google Calendar connection */}
          <SettingsCard id="google" icon={<CalendarCheck size={15} />} title="Google Calendar" desc="Connect a Google account so events created in COS appear in guests' calendars automatically and generate real Google Meet links. When connected, invites are sent through Google; otherwise they go out as email invitations.">
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

          {/* Email automation */}
          <SettingsCard id="email-automation" icon={<Mail size={15} />} title="Email automation" desc={`Scheduled email reminders. Each runs once a day inside the send window (08:00–18:00).${emailCfg ? "" : " Email isn't connected yet, so these prepare Outbox drafts you send with one tap."}`} className="scroll-mt-24">
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

            {([
              { key: "overdue", label: "Overdue-task reminders", on: "Prepares a daily reminder draft per person with overdue work." },
              { key: "renewals", label: "Document / permit renewals", on: "Prepares a daily renewal nudge for each expiring or expired document." },
              { key: "directorBrief", label: "Weekly Director Brief (to you)", on: "Auto-sends the portfolio brief to your inbox each Monday." },
              { key: "lifecycle", label: "Probation & leave reminders (to you)", on: "Auto-sends a daily HR summary (probations ending, leave to approve)." },
            ] as const).map((c) => {
              const off = emailAuto.categories[c.key].mode === "off";
              return (
                <form key={c.key} action={setEmailAutomation} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-[11px] text-fg-muted">{off ? "Off." : `On — ${c.on}`}</p>
                  </div>
                  <input type="hidden" name="field" value={c.key} />
                  <input type="hidden" name="value" value={off ? "1" : "0"} />
                  <Button type="submit" variant={off ? "primary" : "secondary"}>{off ? "Turn on" : "Turn off"}</Button>
                </form>
              );
            })}

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

          {/* Owner sign-in */}
          <SettingsCard id="owner" icon={<KeyRound size={15} />} title="Owner sign-in" desc="The password that protects the whole admin system (everything except the staff portal).">
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
          <SettingsCard id="passkeys" icon={<ScanFace size={15} />} title="Face ID & fingerprint" desc="Add this device so you can sign in to the Command Centre with Face ID, Touch ID, or your fingerprint — no password to type. Your biometric never leaves the device; we only store a key.">
            <PasskeyManager initial={ownerPasskeys} begin={adminBeginPasskey} finish={adminFinishPasskey} remove={adminRemovePasskey} />
          </SettingsCard>

          {/* Staff portal access */}
          <SettingsCard id="portal" icon={<Users size={15} />} title="Staff portal access" desc={<>Give a staff member a sign-in for the portal at <strong className="text-fg">/portal</strong> — they see only their own tasks, can post updates, and nothing else. Set a password here and share it with them privately. Revoking locks them out immediately.</>}>
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
                        <option value="hr">HR / Admin</option>
                        <option value="director">Director</option>
                      </Select>
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
                  <option value="hr">HR / Admin — every company&apos;s tasks, can create across all</option>
                  <option value="director">Director — board view + create tasks/events across all companies</option>
                </Select>
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

          {/* Navigation */}
          <SettingsCard id="navigation" icon={<LayoutGrid size={15} />} title="Navigation" desc="Pin the pages you use most so they appear first in Search (the ⌘K command menu). Changes save automatically. The floating bottom bar itself stays the same.">
            <NavSettings />
          </SettingsCard>

          {/* Notifications */}
          <SettingsCard id="notifications" icon={<Bell size={15} />} title="Notifications" desc="Get alerts on this device — even when Oracle Consultancy is closed — when tasks become overdue, are escalated, or are due today. Enable it on each device you want alerts on. On iPhone, add Oracle Consultancy to your Home Screen first.">
            <NotificationSettings />
          </SettingsCard>

          {/* Design */}
          <SettingsCard id="design" icon={<Palette size={15} />} title="Design" desc="The living Liquid Glass gallery — every colour, surface, control and gesture in one place.">
            <Link href="/design" className="btn-rim inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-muted">
              <Palette size={14} /> Open the design gallery <ArrowRight size={14} className="text-fg-muted" />
            </Link>
          </SettingsCard>

          {/* Maintenance / advanced */}
          <SettingsCard id="maintenance" icon={<Wrench size={15} />} title="Maintenance" desc="Rarely needed. Safe to run any time — these tidy-up tools never change your tasks or notes.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Rebuild task summaries</p>
                <p className="text-[11px] text-fg-muted">Only if a task&apos;s latest note looks wrong. Rebuilds the short &ldquo;latest note&rdquo; line on each task from its full update history.</p>
              </div>
              <ResyncLatestUpdateButton />
            </div>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
