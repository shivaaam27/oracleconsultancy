"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/** Shared centred dialog/drawer for HRMS forms. Mirrors the Documents DocDialog. */
export function HrmsDialog({
  open, onOpenChange, title, children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm
          data-[state=open]:animate-in data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(560px,calc(100vw-2rem))] max-h-[85vh]
          -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl
          bg-bg-elev border border-border shadow-2xl outline-none
          data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:zoom-out-95">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close"
                className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors">
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>
          <div className="p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
