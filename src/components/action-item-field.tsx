"use client";

import { useState } from "react";
import { PolishedInput } from "./polished-input";
import { SimilarTasks } from "./similar-tasks";

export function ActionItemField({
  name,
  defaultValue = "",
  required,
  placeholder,
  excludeId,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  excludeId?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="space-y-3">
      <PolishedInput
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        onValueChange={setValue}
      />
      <SimilarTasks query={value} excludeId={excludeId} />
    </div>
  );
}
