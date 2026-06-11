import { Bell, LogOut, Settings2, UserRound } from "lucide-react";
import { DevicePushToggle } from "@/components/device-push-toggle";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { AccessibilityControls } from "@/components/portal-prefs";
import { getPortalPerson } from "@/lib/portal-auth";
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
