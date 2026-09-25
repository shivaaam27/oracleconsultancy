"use client";

/**
 * Checkbox: the tick box (owner's component, Sept 2026, adapted).
 *
 * Built on Radix's checkbox like the prompt he supplied, with three changes
 * for Oracle:
 *  - `cn` comes from `@/lib/cn` (Oracle has no `@/lib/utils`), and the three sizes
 *    are a plain map rather than `class-variance-authority`, one dependency
 *    fewer for the same result;
 *  - the colours are Oracle tokens, not shadcn's (`--primary`/`--input` do not
 *    exist here): a hairline box that turns ink when ticked, in the Studio look
 *    and the Desk look alike;
 *  - a small, quick animation: the box gives under the finger, and the tick
 *    springs in rather than blinking on. Reduced motion switches both off.
 *
 * ⚠️ This lives in `components/ui/` beside the older `components/ui.tsx`.
 * `@/components/ui` still resolves to that FILE; this one is imported by its
 * full path, `@/components/ui/checkbox`.
 */
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: "size-4 rounded-[5px] [&_svg]:size-3",
  md: "size-[18px] rounded-[6px] [&_svg]:size-3",
  lg: "size-5 rounded-[6px] [&_svg]:size-3.5",
} as const;

export interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  size?: keyof typeof SIZES;
}

function Checkbox({ className, size = "md", ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group peer inline-flex shrink-0 items-center justify-center border border-border-strong bg-bg-elev text-bg-elev",
        "transition-[background-color,border-color,transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        "hover:border-fg-muted active:scale-[0.88] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/25 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-fg data-[state=checked]:bg-fg data-[state=indeterminate]:border-fg data-[state=indeterminate]:bg-fg",
        SIZES[size],
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator forceMount className="flex items-center justify-center text-current">
        {/* The tick springs in: a little under-size, then settles. `forceMount`
            keeps it in the tree so the way OUT can animate too. */}
        <span className="flex scale-50 items-center justify-center opacity-0 transition-[transform,opacity] duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] group-data-[state=checked]:scale-100 group-data-[state=checked]:opacity-100 group-data-[state=indeterminate]:scale-100 group-data-[state=indeterminate]:opacity-100 motion-reduce:transition-none">
          <Check strokeWidth={3} className="group-data-[state=indeterminate]:hidden" />
          <Minus strokeWidth={3} className="hidden group-data-[state=indeterminate]:block" />
        </span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
