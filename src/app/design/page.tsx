"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, AlertOctagon, Clock, ExternalLink, Hand, Palette } from "lucide-react";
import { Button, Badge, Card } from "@/components/ui";
import { SwipeRow } from "@/components/swipe-row";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { triggerHaptic } from "@/lib/use-long-press";

/**
 * /design — the living Liquid Glass gallery. A single place to see every token,
 * surface, control and interaction the design system offers, so the look stays
 * consistent and can be improved deliberately. Pairs with DESIGN_SYSTEM.md.
 */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-fg-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, varName, fg }: { name: string; varName: string; fg?: boolean }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="h-12" style={{ background: `hsl(var(${varName}))` }} />
      <div className="px-2 py-1.5">
        <div className="text-[11px] font-medium">{name}</div>
        <div className="text-[10px] text-fg-subtle font-mono truncate">{varName}</div>
      </div>
      {fg && <div className="sr-only">fg</div>}
    </div>
  );
}

export default function DesignPage() {
  const [peekOpen, setPeekOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [log, setLog] = useState<string>("");

  const peekActions: PeekAction[] = [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => setLog("Peek → Open") },
    { label: "Complete", icon: <CheckCircle2 size={15} />, onClick: () => setLog("Peek → Complete") },
    { label: "Escalate", icon: <AlertOctagon size={15} />, tone: "danger", onClick: () => setLog("Peek → Escalate") },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <header className="wash-accent rounded-2xl border border-border p-5 elevated">
        <div className="flex items-center gap-2 text-accent">
          <Palette size={18} />
          <span className="text-xs font-semibold uppercase tracking-wide">Design system</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Liquid Glass gallery</h1>
        <p className="text-sm text-fg-muted mt-1 max-w-prose">
          Every surface, control and gesture in one place. Use it to keep the look consistent —
          and to try ideas before rolling them out. Full notes live in <code className="text-xs">DESIGN_SYSTEM.md</code>.
        </p>
      </header>

      {/* Colour tokens */}
      <Section title="Colour" hint="Accent is the only tint — reserved for primary actions and focus.">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Swatch name="Accent" varName="--accent" />
          <Swatch name="Background" varName="--bg" />
          <Swatch name="Elevated" varName="--bg-elev" />
          <Swatch name="Muted" varName="--bg-muted" />
          <Swatch name="Success" varName="--success" />
          <Swatch name="Danger" varName="--danger" />
        </div>
      </Section>

      {/* Surfaces — the three tiers */}
      <Section title="Surfaces" hint="Three tiers: glass chrome floats; elevated holds content; wash tints a header.">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="glass rounded-xl p-4">
            <div className="text-sm font-medium">Tier 1 · Glass</div>
            <p className="text-xs text-fg-muted mt-1">Floating navigation & overlays only. Never on content.</p>
          </div>
          <div className="elevated bg-bg-elev rounded-xl p-4 border border-border">
            <div className="text-sm font-medium">Tier 2 · Elevated</div>
            <p className="text-xs text-fg-muted mt-1">Solid cards and tables — where you read and work.</p>
          </div>
          <div className="wash-accent rounded-xl p-4 border border-border">
            <div className="text-sm font-medium">Tier 3 · Wash</div>
            <p className="text-xs text-fg-muted mt-1">A soft accent gradient for section headers.</p>
          </div>
        </div>
      </Section>

      {/* Radii */}
      <Section title="Corner radius" hint="A concentric ladder — outer shells rounder than inner controls.">
        <div className="flex flex-wrap items-end gap-3">
          {[
            ["sm", "rounded-md"], ["md", "rounded-lg"], ["lg", "rounded-xl"],
            ["xl", "rounded-2xl"],
          ].map(([name, cls]) => (
            <div key={name} className="text-center">
              <div className={`w-16 h-16 bg-bg-muted border border-border ${cls}`} />
              <div className="text-[10px] text-fg-subtle mt-1 font-mono">{cls}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-soft">Danger soft</Button>
          <Button variant="primary" loading>Saving</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Button size="xs">XS</Button>
          <Button size="sm">SM</Button>
          <Button size="md">MD</Button>
          <Button size="lg">LG</Button>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">On track</Badge>
          <Badge tone="warn">Due soon</Badge>
          <Badge tone="danger">Overdue</Badge>
          <Badge tone="info">In progress</Badge>
        </div>
      </Section>

      {/* Dropdowns */}
      <Section title="Dropdowns" hint="One fluid glass popover behind filters and inline edits — check-marked, spring pop-in.">
        <FluidSelect
          value={pick}
          onSelect={setPick}
          placeholder="All Companies"
          options={[
            { value: "", label: "All Companies" },
            { value: "DS", label: "Dar Spices", dot: "#e0533d" },
            { value: "CC", label: "Cocozuri Chocolat", dot: "#b07a3b" },
            { value: "TG", label: "Terra Green", dot: "#3fae6a" },
          ]}
        />
      </Section>

      {/* Interactions */}
      <Section title="Interactions" hint="Swipe a row, long-press the card, or open the snooze chooser.">
        <Card className="p-0 overflow-hidden">
          <SwipeRow
            rightLabel="Complete"
            leftLabel="Escalate"
            onSwipeRight={() => { triggerHaptic(); setLog("Swiped right → Complete"); }}
            onSwipeLeft={() => { triggerHaptic(); setLog("Swiped left → Escalate"); }}
            onTap={() => setLog("Tapped row")}
          >
            <div className="px-4 py-3 bg-bg-elev select-none">
              <div className="text-sm font-medium">Swipe me</div>
              <div className="text-xs text-fg-muted">→ Complete · ← Escalate (haptic on Android)</div>
            </div>
          </SwipeRow>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPeekOpen(true)}>
            <Hand size={15} /> Open peek preview
          </Button>
          <Button variant="secondary" onClick={() => setSnoozeOpen(true)}>
            <Clock size={15} /> Open snooze chooser
          </Button>
        </div>

        {log && (
          <div className="text-xs text-fg-muted inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-2.5 py-1.5">
            <Sparkles size={12} className="text-accent" /> {log}
          </div>
        )}
      </Section>

      <p className="text-xs text-fg-subtle pt-2 border-t border-border">
        To extend the system: reuse these primitives, tint only primary actions, keep glass on the
        floating layer, and re-test with Reduce Transparency / Contrast / Motion. See DESIGN_SYSTEM.md.
      </p>

      <PeekPreview
        open={peekOpen}
        onClose={() => setPeekOpen(false)}
        onOpen={() => setLog("Peek card → Open")}
        title="Camera and Printer Issues"
        subtitle="CO01-008 · Dar Spices · Not Started"
        body="Printer issues solved by pairing the smartphone with printer wifi. A temporary fix until Gofiber resolve it."
        actions={peekActions}
      />

      <SnoozeSheet
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        onPick={(iso) => setLog(`Snooze → ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`)}
        label="Snooze until…"
      />
    </div>
  );
}
