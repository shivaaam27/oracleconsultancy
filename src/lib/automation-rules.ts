// Client-safe registry for the automation control room. Each rule maps to one
// automation "kind"; the owner sets a mode per rule in Settings → Automations.
//   auto    = apply certain matches automatically (and suggest the fuzzy ones)
//   suggest = never apply automatically; always offer a one-click suggestion
//   off     = do nothing
// Stored in the settings table under `automation.mode.<kind>`; default "auto".

export type AutomationMode = "auto" | "suggest" | "off";
export const DEFAULT_AUTOMATION_MODE: AutomationMode = "auto";

export type AutomationRule = {
  kind: string;
  label: string;
  description: string;
  // Some rules can't be "suggested" (a created task can't be pre-staged), so they
  // only offer Auto / Off.
  supportsSuggest: boolean;
};

export const AUTOMATION_RULES: AutomationRule[] = [
  {
    kind: "compliance-verify",
    label: "Verify compliance documents",
    description: "When a filed document clearly matches a requirement, mark that requirement verified.",
    supportsSuggest: true,
  },
  {
    kind: "task-complete",
    label: "Complete fulfilled tasks",
    description: "When a document fulfils a task it’s linked to, mark the task complete.",
    supportsSuggest: true,
  },
  {
    kind: "pipeline-advance",
    label: "Advance applications",
    description: "Move a permit/visa/licence application forward when its document arrives or its driving task is completed.",
    supportsSuggest: true,
  },
  {
    kind: "onboarding-tick",
    label: "Tick onboarding & offboarding steps",
    description: "Tick a journey step when its document is collected, compliance is complete, or equipment is returned.",
    supportsSuggest: true,
  },
  {
    kind: "task-create",
    label: "Create renewal & notice tasks",
    description: "Create a task when a document is expiring/expired or a lease/insurance/contract nears its notice date.",
    supportsSuggest: true,
  },
  {
    kind: "records",
    label: "Fill records from documents",
    description: "When a document reads cleanly, fill blank profile fields and add facts on their own (every change is logged and can be undone). New shelves are always proposed, never auto-created.",
    supportsSuggest: true,
  },
];

export const MODE_LABEL: Record<AutomationMode, string> = {
  auto: "Auto",
  suggest: "Suggest",
  off: "Off",
};
