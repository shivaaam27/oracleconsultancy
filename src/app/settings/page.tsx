import { PageHeader, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { ResyncLatestUpdateButton } from "@/components/resync-button";
import { NavSettings } from "@/components/nav-settings";
import { NotificationSettings } from "@/components/notification-settings";
import { getAppSettings, SWIPE_ACTIONS } from "@/lib/settings";
import { sb } from "@/db/supabase";
import { saveSettings, setPortalAccess, revokePortalAccess } from "./actions";
import { adminChangePassword, adminLogout } from "../login/actions";
import Link from "next/link";
import { Save, SlidersHorizontal, MapPin, Sparkles, MessageCircle, Check, LayoutGrid, Mic2, Bell, Hand, Palette, ArrowRight, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; portal?: string; owner?: string }>;
}) {
  const [s, sp, { data: peopleRows }] = await Promise.all([
    getAppSettings(),
    searchParams,
    sb
      .from("people")
      .select("id,name,portal_password_hash,portal_last_login_at")
      .eq("active", true)
      .order("name"),
  ]);
  const portalPeople = (peopleRows ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    enabled: Boolean(p.portal_password_hash),
    lastLogin: p.portal_last_login_at as string | null,
  }));
  const portalEnabled = portalPeople.filter((p) => p.enabled);

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Settings"
        sub="Live controls — changes take effect across the whole system."
        action={<ResyncLatestUpdateButton />}
      />

      {sp.saved && (
        <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2">
          <Check size={14} /> Settings saved.
        </div>
      )}

      <form action={saveSettings} className="space-y-5">
        {/* About you */}
        <div className="glass elevated rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={14} className="text-accent" /> About you
            </h2>
            <p className="text-xs text-fg-muted mt-1">Your name — used to greet you in the AUMIO assistant.</p>
          </div>
          <div className="max-w-xs">
            <FieldLabel>Your name</FieldLabel>
            <Input name="operatorName" defaultValue={s.operatorName} placeholder="e.g. Sunny" />
          </div>
        </div>

        {/* Risk rules */}
        <div className="glass elevated rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={14} className="text-accent" /> Risk rules
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              How the system decides when a task needs attention. Changing these instantly re-colours every task.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>

        {/* Location & weather */}
        <div className="glass elevated rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin size={14} className="text-accent" /> Location & weather
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Shown on the welcome screen. Coordinates drive the live weather (uses a free, keyless source).
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>

        {/* AI */}
        <div className="glass elevated rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={14} className="text-accent" /> AI assistance
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Master switch for all AI features (Ask, polish, drafting, meeting extraction). Turn off to run the
              system fully manually — everything keeps working without AI.
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="aiEnabled"
              defaultChecked={s.aiEnabled}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm">Enable AI features</span>
          </label>
        </div>

        {/* Voice */}
        <div className="glass elevated rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Mic2 size={14} className="text-accent" /> Voice intelligence
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Dictation language and trusted words used when AUMIO cleans rough speech into polished notes.
            </p>
          </div>
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
              <FieldLabel>AUMIO voice dictionary</FieldLabel>
              <Textarea
                name="voiceDictionary"
                rows={7}
                defaultValue={s.voiceDictionary}
                placeholder="Add names, companies, places, acronyms, and phrases AUMIO should preserve..."
              />
            </div>
          </div>
        </div>

        {/* Swipe actions */}
        <div className="glass elevated rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Hand size={14} className="text-accent" /> Swipe actions
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              What a left or right swipe does on a task row (AUMIO Home list). Applies as soon as you save.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>

        {/* Reminders (informational for now) */}
        <div className="glass elevated rounded-2xl p-5 space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={14} className="text-accent" /> Reminders
          </h2>
          <p className="text-xs text-fg-muted">
            Reminders go out on a single channel — <strong className="text-fg">Messages</strong>. Real sending
            (WhatsApp / email via API) will be added later; for now the Outbox prepares copy-ready drafts.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit"><Save size={13} /> Save changes</Button>
        </div>
      </form>

      {/* Owner sign-in — change the admin password or sign out on this device */}
      <div className="glass elevated rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={14} className="text-accent" /> Owner sign-in
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            The password that protects the whole admin system (everything except the staff portal).
          </p>
        </div>
        {sp.owner === "saved" && (
          <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Password changed.</p>
        )}
        {sp.owner === "wrong" && <p className="text-sm text-danger">Current password was wrong.</p>}
        {sp.owner === "short" && <p className="text-sm text-danger">New password must be at least 8 characters.</p>}
        <form action={adminChangePassword} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
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
      </div>

      {/* Staff portal access — lives outside the form; each row saves instantly */}
      <div className="glass elevated rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={14} className="text-accent" /> Staff portal access
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Give a staff member a sign-in for the portal at <strong className="text-fg">/portal</strong> — they see
            only their own tasks, can post updates, and nothing else. Set a password here and share it with them
            privately. Revoking locks them out immediately.
          </p>
        </div>

        {sp.portal === "saved" && (
          <p className="flex items-center gap-2 text-sm text-success"><Check size={14} /> Portal access saved.</p>
        )}
        {sp.portal === "revoked" && (
          <p className="text-sm text-fg-muted">Portal access revoked.</p>
        )}
        {sp.portal === "short" && (
          <p className="text-sm text-danger">Password must be at least 6 characters.</p>
        )}

        {portalEnabled.length > 0 && (
          <div className="space-y-2">
            {portalEnabled.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-bg-subtle/60 ring-1 ring-border px-3 py-2">
                <span className="text-sm font-medium grow">{p.name}</span>
                <span className="text-xs text-fg-subtle">
                  {p.lastLogin
                    ? `Last signed in ${new Date(p.lastLogin).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                    : "Never signed in"}
                </span>
                <form action={revokePortalAccess}>
                  <input type="hidden" name="personId" value={p.id} />
                  <button type="submit" className="text-xs font-medium text-danger hover:underline">Revoke</button>
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={setPortalAccess} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <FieldLabel>Person</FieldLabel>
            <Select name="personId" defaultValue="">
              <option value="" disabled>Choose a person…</option>
              {portalPeople.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.enabled ? " (has access — reset password)" : ""}</option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Access level</FieldLabel>
            <Select name="portalRole" defaultValue="staff">
              <option value="staff">Staff — own tasks only</option>
              <option value="manager">Manager — own + direct reports&apos; tasks, can complete</option>
            </Select>
          </div>
          <div>
            <FieldLabel>Password (min 6 characters)</FieldLabel>
            <Input name="password" type="text" minLength={6} required placeholder="e.g. shivam2026" />
          </div>
          <Button type="submit"><KeyRound size={13} /> Enable access</Button>
        </form>
      </div>

      {/* Navigation — lives outside the form; saves instantly on change */}
      <div className="glass elevated rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LayoutGrid size={14} className="text-accent" /> Navigation
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Choose which buttons appear in the bottom bar and what order they sit in. Changes save
            automatically and apply the next time the bar loads.
          </p>
        </div>
        <NavSettings />
      </div>

      {/* Notifications — lives outside the form; subscribes per-device instantly */}
      <div className="glass elevated rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Bell size={14} className="text-accent" /> Notifications
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            Get alerts on this device — even when AUMIO is closed — when tasks become overdue, are escalated,
            or are due today. Enable it on each device you want alerts on. On iPhone, add AUMIO to your Home
            Screen first.
          </p>
        </div>
        <NotificationSettings />
      </div>

      {/* Design system — the living gallery (moved here from the nav) */}
      <div className="glass elevated rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Palette size={14} className="text-accent" /> Design
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            The living Liquid Glass gallery — every colour, surface, control and gesture in one place.
          </p>
        </div>
        <Link href="/design" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg hover:bg-bg-muted btn-rim transition-colors">
          <Palette size={14} /> Open the design gallery <ArrowRight size={14} className="text-fg-muted" />
        </Link>
      </div>
    </div>
  );
}
