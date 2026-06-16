// Public surface of the automation module. SERVER-ONLY (pulls in the engine +
// categories). Client components must import the client-safe pieces directly from
// "@/lib/automation/meta" or "@/lib/automation/types" instead.

export { runDueAutomations } from "./engine";
export { getAutomationConfig, saveAutomationConfig, DEFAULTS } from "./config";
export type {
  AutomationConfig,
  AutomationRunSummary,
  CategoryRule,
  EmailCategory,
  RuleMode,
} from "./types";
export {
  CATEGORY_META,
  CATEGORY_LABELS,
  NATURAL_MODE,
  categoryMeta,
  labelForSource,
  type CategoryMeta,
  type CategorySchedule,
} from "./meta";
