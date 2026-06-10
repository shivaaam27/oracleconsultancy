"use client";

import { useState } from "react";
import { CalendarDays, Download, Video, Copy, Check } from "lucide-react";

// Public "add to my calendar" actions for a shared event. No app auth — anyone
// with the link can save the event to their own calendar.
export function ShareActions({
  googleUrl,
  icsPath,
  meetLink,
}: {
  googleUrl: string;
  icsPath: string;
  meetLink: string | null;
}) {
  const [copied, setCopied] = useState(false);

  function copyPageLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors";

  return (
    <div className="flex flex-col gap-2.5">
      {meetLink && (
        <a href={meetLink} target="_blank" rel="noreferrer" className={`${btn} bg-accent text-accent-fg hover:bg-accent-hover`}>
          <Video size={16} /> Join with Google Meet
        </a>
      )}
      <a href={googleUrl} target="_blank" rel="noreferrer" className={`${btn} bg-bg-elev border border-border hover:bg-bg-muted`}>
        <CalendarDays size={16} /> Add to Google Calendar
      </a>
      <a href={icsPath} className={`${btn} bg-bg-elev border border-border hover:bg-bg-muted`}>
        <Download size={16} /> Add to Apple / Outlook (.ics)
      </a>
      <button onClick={copyPageLink} className={`${btn} text-fg-muted hover:text-fg`}>
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Link copied" : "Copy this link"}
      </button>
    </div>
  );
}
