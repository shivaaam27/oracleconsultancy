import { Card, PageHeader, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { ResyncLatestUpdateButton } from "@/components/resync-button";
import { NavSettings } from "@/components/nav-settings";
import { getAppSettings } from "@/lib/settings";
import { saveSettings } from "./actions";
import { Save, SlidersHorizontal, MapPin, Sparkles, MessageCircle, Check, LayoutGrid, Mic2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const [s, sp] = await Promise.all([getAppSettings(), searchParams]);

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
        {/* Risk rules */}
        <Card className="p-5 space-y-4">
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
        </Card>

        {/* Location & weather */}
        <Card className="p-5 space-y-4">
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
        </Card>

        {/* AI */}
        <Card className="p-5 space-y-4">
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
        </Card>

        {/* Voice */}
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Mic2 size={14} className="text-accent" /> Voice intelligence
            </h2>
            <p className="text-xs text-fg-muted mt-1">
              Dictation language and trusted words used when COS cleans rough speech into polished notes.
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
              <FieldLabel>COS voice dictionary</FieldLabel>
              <Textarea
                name="voiceDictionary"
                rows={7}
                defaultValue={s.voiceDictionary}
                placeholder="Add names, companies, places, acronyms, and phrases COS should preserve..."
              />
            </div>
          </div>
        </Card>

        {/* Reminders (informational for now) */}
        <Card className="p-5 space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={14} className="text-accent" /> Reminders
          </h2>
          <p className="text-xs text-fg-muted">
            Reminders go out on a single channel — <strong className="text-fg">Messages</strong>. Real sending
            (WhatsApp / email via API) will be added later; for now the Outbox prepares copy-ready drafts.
          </p>
        </Card>

        <div className="flex justify-end">
          <Button type="submit"><Save size={13} /> Save changes</Button>
        </div>
      </form>

      {/* Navigation — lives outside the form; saves instantly on change */}
      <Card className="p-5 space-y-4">
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
      </Card>
    </div>
  );
}
