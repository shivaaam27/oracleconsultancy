"use client";

import { useRouter } from "next/navigation";
import { TableShell, Th, Td, Badge } from "./ui";
import { ChevronRight } from "lucide-react";

type CompanyKpi = {
  id: number;
  name: string;
  total: number;
  open: number;
  overdue: number;
  blocked: number;
  critical: number;
  completed: number;
  riskScore: number;
};

export function CompanyBreakdownTable({
  companies,
  isHub = false,
}: {
  companies: CompanyKpi[];
  /** When true, clicking a row navigates to the hub companies tab instead of /companies/[id]. */
  isHub?: boolean;
}) {
  const router = useRouter();

  return (
    <TableShell>
      <table className="w-full">
        <thead>
          <tr>
            <Th>Company</Th>
            <Th align="right">Total</Th>
            <Th align="right">Open</Th>
            <Th align="right">Overdue</Th>
            <Th align="right">Blocked</Th>
            <Th align="right">Critical</Th>
            <Th align="right">Done</Th>
            <Th align="right">Risk</Th>
            <Th> </Th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr
              key={c.id}
              onClick={() => router.push(isHub ? `/?tab=companies&co=${c.id}` : `/companies/${c.id}`)}
              className="hover:bg-bg-subtle transition-colors cursor-pointer group"
            >
              <Td>
                <span className="font-medium group-hover:text-accent transition-colors">
                  {c.name}
                </span>
              </Td>
              <Td align="right">{c.total}</Td>
              <Td align="right">{c.open}</Td>
              <Td align="right" className={c.overdue ? "text-danger font-medium" : "text-fg-subtle"}>
                {c.overdue || "—"}
              </Td>
              <Td align="right" className={c.blocked ? "text-warn" : "text-fg-subtle"}>
                {c.blocked || "—"}
              </Td>
              <Td align="right" className={c.critical ? "text-danger font-medium" : "text-fg-subtle"}>
                {c.critical || "—"}
              </Td>
              <Td align="right" className={c.completed ? "text-success" : "text-fg-subtle"}>
                {c.completed || "—"}
              </Td>
              <Td align="right">
                <Badge tone={c.riskScore > 50 ? "danger" : c.riskScore > 20 ? "warn" : "success"}>
                  {c.riskScore}
                </Badge>
              </Td>
              <Td>
                <ChevronRight
                  size={13}
                  className="text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
