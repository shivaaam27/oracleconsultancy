"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { UserPlus } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
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
    <HrmsDialog open={open} onOpenChange={setOpen} width={560} title="Add a new person">
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
    </HrmsDialog>
  );
}
