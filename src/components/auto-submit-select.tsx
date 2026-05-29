"use client";

import type { ComponentProps } from "react";

/**
 * A native <select> that submits its enclosing form on change — so filters
 * apply instantly with no "Apply" button (the macOS instant-feedback feel).
 */
export function AutoSubmitSelect(p: ComponentProps<"select">) {
  return (
    <select
      {...p}
      onChange={(e) => {
        p.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
