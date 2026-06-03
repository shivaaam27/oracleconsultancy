import { FileText, Clock, Ban, Flame, User, Sparkles, StickyNote, type LucideIcon } from "lucide-react";
import type { PageContext } from "./page-context";

export type Suggestion = { label: string; q: string; icon: LucideIcon };

/** Group-wide default prompts when no page-specific context applies. */
export const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Plan my day", q: "Plan my day", icon: Sparkles },
  { label: "What's overdue this week?", q: "What's overdue this week?", icon: Clock },
  { label: "Weekly digest for the group", q: "Give me this week's digest", icon: FileText },
  { label: "Who has the most critical tasks?", q: "Who has the most critical tasks?", icon: Flame },
];

/**
 * Page- and subsection-aware starter prompts. Shared between the AskCOS chat
 * home and the floating suggestion reveal so both stay in lock-step.
 */
export function suggestionsFor(pageContext?: PageContext): Suggestion[] {
  const code = pageContext?.taskCode;
  if (code) return [
    { label: `Summarise ${code}`, q: `Summarise ${code}`, icon: FileText },
    { label: `Latest on ${code}`, q: `What's the latest update on ${code}?`, icon: Clock },
    { label: `Who owns ${code}?`, q: `Who is accountable for ${code}?`, icon: User },
    { label: `Draft a follow-up`, q: `Draft a follow-up message for ${code}`, icon: Sparkles },
  ];
  if (pageContext?.companyId) return [
    { label: "What's blocking this company?", q: "What's blocking this company?", icon: Ban },
    { label: "Overdue here", q: "What's overdue for this company?", icon: Clock },
    { label: "Summarise this company", q: "Give me a summary of this company", icon: FileText },
    { label: "Who's overloaded?", q: "Who has the most open tasks in this company?", icon: Flame },
  ];
  // Tasks view — adapt to any active filter (e.g. "overdue · High").
  if (pageContext?.section === "tasks") {
    const f = pageContext.filterSummary;
    if (f) return [
      { label: "Summarise these", q: `Summarise the tasks filtered by ${f}`, icon: FileText },
      { label: "Draft follow-ups", q: `Draft follow-up messages for the ${f} tasks`, icon: Sparkles },
      { label: "Who owns these?", q: `Who is accountable for the ${f} tasks?`, icon: User },
      { label: "What's overdue this week?", q: "What's overdue this week?", icon: Clock },
    ];
    return [
      { label: "What's overdue this week?", q: "What's overdue this week?", icon: Clock },
      { label: "Who has the most critical tasks?", q: "Who has the most critical tasks?", icon: Flame },
      { label: "What's blocking us?", q: "What's blocking us right now?", icon: Ban },
      { label: "Weekly digest", q: "Weekly digest for the group", icon: FileText },
    ];
  }
  // Workbook — prompts for the active workspace.
  if (pageContext?.section === "workbook") {
    if (pageContext.tab === "notes") return [
      { label: "Summarise my notes", q: "Summarise my recent notes", icon: FileText },
      { label: "Turn a note into tasks", q: "Turn my latest note into action items", icon: Sparkles },
      { label: "What did we decide?", q: "What decisions are recorded in my notes?", icon: StickyNote },
      { label: "Weekly digest", q: "Weekly digest for the group", icon: Clock },
    ];
    if (pageContext.tab === "todo") return [
      { label: "What's due today?", q: "What to-dos are due today?", icon: Clock },
      { label: "What's overdue?", q: "What's overdue across my to-dos and tasks?", icon: Flame },
      { label: "Plan my day", q: "Help me plan my day from my to-dos", icon: Sparkles },
      { label: "Weekly digest", q: "Weekly digest for the group", icon: FileText },
    ];
    return [
      { label: "Summarise the last meeting", q: "Summarise my most recent meeting", icon: FileText },
      { label: "Extract action items", q: "Extract action items from my latest meeting", icon: Sparkles },
      { label: "Any risks raised?", q: "What risks were raised in recent meetings?", icon: Ban },
      { label: "Draft a follow-up", q: "Draft a follow-up from the last meeting", icon: Clock },
    ];
  }
  return DEFAULT_SUGGESTIONS;
}
