"use client";

/**
 * A date FIELD for a server-action form: the calendar pop-over (DatePopover)
 * plus the hidden input the form submits. Replaces `<input type="date">`,
 * whose browser-drawn box and calendar match nothing else in COS.
 * Value in and out is "yyyy-mm-dd" (empty = no date), exactly what the native
 * input posted, so the action reading it does not change.
 */
import { useState } from "react";
import { DatePopover } from "./date-popover";
import { FIELD } from "./ui";
import { cn } from "@/lib/cn";

export function DateInput({ name, defaultValue = "", placeholder = "No date" }: { name: string; defaultValue?: string; placeholder?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <DatePopover
        value={value || null}
        label={value ? null : placeholder}
        onChange={(v) => setValue(v)}
        block
        triggerClassName={cn(FIELD, "justify-start text-left")}
      />
    </>
  );
}
