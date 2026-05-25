import { generateDrafts } from "@/lib/outbox-gen";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { OutboxCard } from "./outbox-card";
import Link from "next/link";
import { Send, MessageCircle, Mail, Phone, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const sp = await searchParams;
  const channel = (sp.channel?.toUpperCase() as "WHATSAPP" | "EMAIL" | "SMS") || "WHATSAPP";
  const drafts = await generateDrafts(channel);

  const totalTasks = drafts.reduce((acc, d) => acc + d.tasks.length, 0);

  const tabs = [
    { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
    { key: "EMAIL", label: "Email", icon: Mail },
    { key: "SMS", label: "SMS", icon: Phone },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outbox"
        sub={
          <span>
            {drafts.length} recipients · {totalTasks} tasks ready to remind
          </span>
        }
        action={
          <div className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Send size={12} /> Drafts regenerate live from open tasks
          </div>
        }
      />

      <div className="inline-flex bg-bg-subtle border border-border rounded-md p-1 gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = channel === t.key;
          return (
            <Link
              key={t.key}
              href={`/outbox?channel=${t.key.toLowerCase()}`}
              className={`px-3 py-1.5 text-sm rounded-md inline-flex items-center gap-1.5 transition-colors ${
                active ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Icon size={13} /> {t.label}
            </Link>
          );
        })}
      </div>

      {drafts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox size={32} />}
            title="No drafts to generate."
            hint="There are no open tasks assigned to anyone right now."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map((d) => (
            <OutboxCard key={d.recipientName} draft={d} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}
