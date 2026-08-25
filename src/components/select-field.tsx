"use client";

import { useState } from "react";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";

/**
 * A `FluidSelect` that can live inside an ordinary server-action form.
 *
 * ⚠️ COS DOES NOT USE NATIVE `<select>` — its popup mis-renders (see
 * CLAUDE.md). But FluidSelect is a button, not a form control, so on its own it
 * submits nothing. This pairs it with a hidden input carrying the name, which
 * is the same trick `FormSwitch` uses for the iPhone toggle.
 */
export function SelectField({
  name,
  options,
  defaultValue = "",
  placeholder,
  className,
}: {
  name: string;
  options: FluidOption[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      {/* ⚠️ `w-full` BELONGS ON THE WRAPPER, NOT THE BUTTON. FluidSelect's outer
          span is `inline-block`, so the button's own `w-full` resolves against
          a shrink-wrapped parent and the control comes out the width of its
          longest option — which is why a form of these sat ragged beside
          full-width text fields. */}
      <FluidSelect
        value={value}
        options={options}
        onSelect={setValue}
        placeholder={placeholder}
        className={className ?? "w-full"}
      />
      <input type="hidden" name={name} value={value} />
    </>
  );
}
