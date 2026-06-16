// The category registry — one ordered list the engine loops over. To add a new
// automation: write a category file exporting a CategoryDef, add its meta entry in
// meta.ts, add its key to EmailCategory in types.ts, and list it here. Nothing
// else needs touching — Settings, the snapshot panel and the engine all derive
// from these three.

import type { CategoryDef } from "./runtime";
import { overdueCategory } from "./categories/overdue";
import { renewalsCategory } from "./categories/renewals";
import { directorBriefCategory } from "./categories/director-brief";
import { morningDigestCategory } from "./categories/morning-digest";
import { lifecycleCategory } from "./categories/lifecycle";
import { boardPackCategory } from "./categories/board-pack";

export const REGISTRY: CategoryDef[] = [
  overdueCategory,
  renewalsCategory,
  directorBriefCategory,
  morningDigestCategory,
  lifecycleCategory,
  boardPackCategory,
];
