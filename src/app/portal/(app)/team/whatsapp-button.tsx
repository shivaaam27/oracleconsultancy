"use client";
import { Button } from "@/components/ui";
import { MessageCircle } from "lucide-react";

/** Per-person "WhatsApp reminder" — the simple route: clicking opens WhatsApp
 *  (app or web) with a reminder of their open tasks pre-filled, and the sender
 *  taps send themselves. No message is sent by the system. */
export function WhatsAppButton({ href }: { href: string | null }) {
  if (!href) {
    return <span className="text-[11px] text-fg-subtle">No WhatsApp on file</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <Button size="sm" variant="secondary">
        <MessageCircle size={13} /> WhatsApp reminder
      </Button>
    </a>
  );
}
