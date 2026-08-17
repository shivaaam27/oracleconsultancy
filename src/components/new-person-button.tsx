"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { PersonForm } from "./person-form";
import { useToast } from "./toast";
import { useContextActions } from "./context-actions";
import { useCreateParam } from "@/lib/use-create-param";

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
  const { toast } = useToast();

  useContextActions(
    "people",
    [{ id: "add-person", label: "Add person", icon: <UserPlus size={16} />, onClick: () => setOpen(true), primary: true, tone: "accent" }],
    []
  );

  // /people?new=1 — the global New menu's "Person".
  useCreateParam("1", () => setOpen(true));

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
            // Land on the new person's RECORD PAGE. This used to push `?person=<id>`,
            // which opened the old drawer over the list — so a moment after saving,
            // an overlay you never asked for appeared on top of you.
            router.push(`/people/${res.id}`);
          } else if (!res.ok) {
            toast(res.error, { tone: "danger" });
          }
        }}
      />
    </HrmsDialog>
  );
}
