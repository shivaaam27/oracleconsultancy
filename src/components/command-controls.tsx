"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Sparkles, Send, Mail, ArrowUpRight, ShieldCheck, Zap, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { Button, Switch } from "@/components/ui";
import { CockpitModule } from "@/components/cockpit-module";
import {
  setAutomationPausedAction,
  setDirectorOutreachPausedAction,
  setAiEnabledAction,
  setEmailTestModeAction,
  runAutomationsNowAction,
  sendBriefNowAction,
} from "@/app/_hub/control-actions";

export type CommandControlsState = {
  /** Email automation master pause (true = the whole engine is held). */
  automationPaused: boolean;
  /** How many email-automation categories are switched on. */
  automationRulesOn: number;
  /** Director outreach governance kill-switch (true = held). */
  directorOutreachPaused: boolean;
  /** AI (ORI) master switch. */
  aiEnabled: boolean;
  /** Whether an email provider is wired (Gmail/Resend env present). */
  emailConnected: boolean;
  /** Whether automation email is in test mode (everything to the owner). */
  emailTestMode: boolean;
};

function Lever({
  icon,
  label,
  on,
  onText,
  offText,
  busy,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onText: string;
  offText: string;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={on}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition-all active:scale-[0.98] disabled:cursor-wait",
        on
          ? "bg-success-soft/25 ring-success/25 hover:ring-success/40"
          : "bg-warn-soft/25 ring-warn/25 hover:ring-warn/40",
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
          on ? "bg-success-soft/60 text-success ring-success/25" : "bg-warn-soft/60 text-warn ring-warn/25",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight">{label}</span>
        <span className={cn("mt-0.5 block truncate text-[11px] font-medium", on ? "text-success" : "text-warn")}>
          {on ? onText : offText}
        </span>
      </span>
      <Switch on={on} busy={busy} />
    </button>
  );
}

export function CommandControls({ state }: { state: CommandControlsState }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  // Drive from optimistic local state. `on` everywhere means "running / enabled".
  const [autoOn, setAutoOn] = useState(!state.automationPaused);
  const [dirOn, setDirOn] = useState(!state.directorOutreachPaused);
  const [aiOn, setAiOn] = useState(state.aiEnabled);
  const [testMode, setTestMode] = useState(state.emailTestMode);
  const [busy, setBusy] = useState<string | null>(null);

  // Fire-and-report quick actions (run automations / send brief) — no toggle state,
  // just a result message.
  function fire(key: string, action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(key);
    startTransition(async () => {
      const res = await action();
      setBusy(null);
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      toast(res.message, { tone: "success", duration: 4000 });
      router.refresh();
    });
  }

  function run(
    key: string,
    next: boolean,
    setLocal: (v: boolean) => void,
    prev: boolean,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okMsg: string,
  ) {
    setLocal(next);
    setBusy(key);
    startTransition(async () => {
      const res = await action();
      setBusy(null);
      if (!res.ok) {
        setLocal(prev);
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      toast(okMsg, { tone: next ? "success" : "default", duration: 3000 });
      router.refresh();
    });
  }

  const anyHeld = !autoOn || !dirOn;

  return (
    <CockpitModule
      glass
      icon={<SlidersHorizontal size={13} />}
      title={
        <>
          Controls
          {anyHeld && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-warn-soft/60 px-1.5 py-0.5 text-[10px] font-semibold text-warn ring-1 ring-warn/20">
              held
            </span>
          )}
        </>
      }
      action={
        <Link
          href="/settings#email-automation"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-accent"
        >
          Manage <ArrowUpRight size={12} />
        </Link>
      }
    >
      <p className="mt-1 text-xs text-fg-muted">The levers that run your operation. One tap to hold or release.</p>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Lever
          icon={<SlidersHorizontal size={17} />}
          label="Automations"
          on={autoOn}
          onText={state.automationRulesOn > 0 ? `Active · ${state.automationRulesOn} on` : "Active · none on"}
          offText="Paused — nothing sends"
          busy={busy === "auto"}
          onToggle={() =>
            run("auto", !autoOn, setAutoOn, autoOn, () => setAutomationPausedAction(autoOn), autoOn ? "Automations paused." : "Automations resumed.")
          }
        />

        <Lever
          icon={<Send size={17} />}
          label="Director outreach"
          on={dirOn}
          onText="Active — directors can message"
          offText="Paused — outreach blocked"
          busy={busy === "dir"}
          onToggle={() =>
            run("dir", !dirOn, setDirOn, dirOn, () => setDirectorOutreachPausedAction(dirOn), dirOn ? "Director outreach paused." : "Director outreach resumed.")
          }
        />

        <Lever
          icon={<Sparkles size={17} />}
          label="AI (ORI)"
          on={aiOn}
          onText="On — assistance enabled"
          offText="Off — manual only"
          busy={busy === "ai"}
          onToggle={() =>
            run("ai", !aiOn, setAiOn, aiOn, () => setAiEnabledAction(!aiOn), aiOn ? "AI switched off." : "AI switched on.")
          }
        />

        {/* Email wiring — read-only status, links to setup. */}
        <Link
          href="/settings#email-automation"
          className={cn(
            "group flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition-all hover:-translate-y-0.5",
            state.emailConnected ? "bg-bg-subtle/50 ring-border/60 hover:ring-accent/30" : "bg-warn-soft/25 ring-warn/25 hover:ring-warn/40",
          )}
        >
          <span
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
              state.emailConnected ? "bg-accent-soft/70 text-accent ring-accent/20" : "bg-warn-soft/60 text-warn ring-warn/25",
            )}
          >
            {state.emailConnected ? <Mail size={17} /> : <ShieldCheck size={17} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium leading-tight">Email</span>
            <span className={cn("mt-0.5 block truncate text-[11px] font-medium", state.emailConnected ? "text-fg-muted" : "text-warn")}>
              {state.emailConnected ? (state.emailTestMode ? "Connected · test mode" : "Connected") : "Not set up — tap to wire"}
            </span>
          </span>
          <ArrowUpRight size={15} className="shrink-0 text-fg-subtle transition-colors group-hover:text-accent" />
        </Link>
      </div>

      {/* Quick actions — fire the engine on demand + email test mode. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button type="button" variant="secondary" size="sm" loading={busy === "run"} onClick={() => fire("run", runAutomationsNowAction)}>
          {busy === "run" ? null : <Zap size={13} />} Run automations now
        </Button>
        <Button type="button" variant="secondary" size="sm" loading={busy === "brief"} onClick={() => fire("brief", sendBriefNowAction)}>
          {busy === "brief" ? null : <FileText size={13} />} Send Brief now
        </Button>

        {state.emailConnected && (
          <button
            type="button"
            onClick={() =>
              run(
                "test",
                !testMode,
                setTestMode,
                testMode,
                () => setEmailTestModeAction(!testMode),
                !testMode ? "Test mode on — automation email comes only to you." : "Test mode off — emails go to real recipients.",
              )
            }
            disabled={busy === "test"}
            title="When on, all automation email is redirected to you instead of staff/clients."
            className={cn(
              "ml-auto inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-xs font-medium ring-1 transition-colors disabled:cursor-wait",
              testMode ? "bg-warn-soft/40 text-warn ring-warn/30" : "bg-bg-subtle/60 text-fg-muted ring-border/60 hover:text-fg",
            )}
          >
            Test mode
            <Switch on={testMode} busy={busy === "test"} size="sm" />
          </button>
        )}
      </div>
    </CockpitModule>
  );
}
