"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, Check, Factory, Loader2, Pencil, Star, Trash2, Undo2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { CocozuriRecipeSheet } from "@/components/cocozuri-recipe-sheet";
import type { CzStockItem, CzStockLocation } from "@/lib/cocozuri-stock-shared";
import type { CzItemCost, CzRecipe } from "@/lib/cocozuri-recipe-shared";
import {
  deleteRecipeAction, setRecipeDefaultAction, setRecipeStatusAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * What you can do to a recipe.
 *
 * ⚠️ MAKING IT ACTIVE IS THE DELIBERATE STEP, and the library re-checks the
 * rules when it happens — activating is the moment a recipe becomes something a
 * kitchen will follow, so it is not enough that the form let it be saved.
 * ------------------------------------------------------------------ */

export function CocozuriRecipeActions({
  recipe, items, locations, costs,
}: {
  recipe: CzRecipe;
  items: CzStockItem[];
  locations: CzStockLocation[];
  costs: Record<number, CzItemCost>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    start(() => {});
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin text-fg-subtle" />}

        <button type="button" onClick={() => setEditing(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
          <Pencil size={13} /> Edit
        </button>

        {/* ⚠️ THE HANDOFF THAT WAS MISSING. Reading a recipe and deciding to make
            it meant going to Production and finding the same recipe again in a
            dropdown. Only offered on an ACTIVE recipe, because a draft is not
            what the kitchen should be reaching for — `makeableRecipes()` would
            not list it anyway. */}
        {recipe.status === "active" && (
          <Link href={`/cocozuri/batches?new=1&recipe=${recipe.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
            <Factory size={13} /> Make this now
          </Link>
        )}

        {recipe.status !== "active" && (
          <button type="button"
            onClick={() => void run(`"${recipe.name}" is in use.`, () => setRecipeStatusAction(recipe.id, "active"))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
            <Check size={13} /> Put it into use
          </button>
        )}

        {recipe.status === "active" && !recipe.isDefault && (
          <button type="button"
            onClick={() => void run("This is now the one to use.", () => setRecipeDefaultAction(recipe.id))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg"
            title="The one the order form and production will reach for first">
            <Star size={13} /> Make it the one to use
          </button>
        )}

        {recipe.status === "active" && (
          <button type="button"
            onClick={() => void run("Taken out of use.", () => setRecipeStatusAction(recipe.id, "archived"))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-warn">
            <Archive size={13} /> Take it out of use
          </button>
        )}

        {recipe.status === "archived" && (
          <button type="button"
            onClick={() => void run("Back to a draft.", () => setRecipeStatusAction(recipe.id, "draft"))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
            <Undo2 size={13} /> Bring it back
          </button>
        )}

        <span className="grow" />

        {/* ⚠️ Archiving is the normal answer, so deleting is kept quiet and asks
            first. Once Stage 4 gives batches a recipe to point at, this must
            start refusing outright. */}
        <button type="button"
          onClick={() => {
            if (!window.confirm(`Remove "${recipe.name}"? Taking it out of use keeps the record; this does not.`)) return;
            void run("Recipe removed.", async () => {
              const res = await deleteRecipeAction(recipe.id);
              if (res.ok) router.push("/cocozuri/recipes");
              return res;
            });
          }}
          className="text-fg-subtle hover:text-danger" title="Remove this recipe">
          <Trash2 size={13} />
        </button>
      </div>

      {editing && (
        <CocozuriRecipeSheet
          recipe={recipe}
          items={items}
          locations={locations}
          costs={costs}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
