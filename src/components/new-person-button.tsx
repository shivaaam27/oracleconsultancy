"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { UserPlus, X } from "lucide-react";
import { PersonForm } from "./person-form";
import { useToast } from "./toast";
import { useContextActions } from "./context-actions";

export function NewPersonButton({
  companies,
  peopleList,
  departments = [],
  sites = [],
  roles = [],
}: {
  companies: Array<{ id: number; name: string }>;
  peopleList: Array<{ id: number; name: string; active: boolean }>;
  departments?: string[];
  sites?: string[];
  roles?: string[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { toast } = useToast();

  useContextActions(
    "people",
    [{ id: "add-person", label: "Add person", icon: <UserPlus size={16} />, onClick: () => setOpen(true), primary: true, tone: "accent" }],
    []
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm
          data-[state=open]:animate-in data-[state=open]:fade-in-0
          data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[51] w-[min(560px,calc(100vw-2rem))] max-h-[85vh]
            -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl
            glass glass-menu elevated outline-none
            data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
            data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">Add a new person</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>
          <div className="p-5">
            <PersonForm
              mode="create"
              companies={companies}
              peopleList={peopleList}
              departments={departments}
              sites={sites}
              roles={roles}
              onCancel={() => setOpen(false)}
              onComplete={(res) => {
                if (res.ok && res.id) {
                  toast("Person added.", { tone: "success" });
                  setOpen(false);
                  // Open the new person's drawer immediately so the user lands on their record
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("person", String(res.id));
                  router.push(`${pathname}?${params.toString()}`, { scroll: false });
                } else if (!res.ok) {
                  toast(res.error, { tone: "danger" });
                }
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
