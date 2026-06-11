"use client";

import { Bot } from "lucide-react";
import { Button } from "@/components/ui";
import { askAssistant } from "@/lib/assistant-bridge";

export function PlanMyDayButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => askAssistant("Plan my day")}
    >
      <Bot size={13} /> Plan my day
    </Button>
  );
}
