"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/* A masked password input with a show/hide toggle — so the owner can type a
 * portal password privately but reveal it to read out / share when needed.
 * Matches the shared <Input> styling (global input theme + these classes). */
export function RevealPassword({
  name = "password",
  placeholder,
  minLength = 8,
  required = false,
}: {
  name?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        minLength={minLength}
        required={required}
        placeholder={placeholder}
        autoComplete="new-password"
        className="w-full h-9 rounded-lg px-3 pr-9 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
