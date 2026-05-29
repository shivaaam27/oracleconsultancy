/**
 * Derives a lightweight description of the page the operator is currently on,
 * so the COS assistant can answer "what's on this page" / "escalate this" style
 * questions. Resolved from the pathname only — no data fetch.
 */
export type PageContext = {
  label: string;
  taskCode?: string;
  companyId?: number;
};

export function derivePageContext(pathname: string): PageContext {
  const p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";

  if (p === "/") return { label: "Command centre (Overview, Companies, Tasks)" };
  if (p === "/task/new") return { label: "New task form" };

  const taskM = p.match(/^\/task\/([^/]+)$/);
  if (taskM) {
    const code = decodeURIComponent(taskM[1]);
    return { label: `Task ${code} detail`, taskCode: code };
  }

  if (p === "/companies") return { label: "Companies list" };
  const compM = p.match(/^\/companies\/(\d+)$/);
  if (compM) return { label: `Company detail (#${compM[1]})`, companyId: Number(compM[1]) };

  if (p === "/people") return { label: "People directory" };
  if (p === "/meeting") return { label: "Meeting Workspace" };
  if (p === "/outbox") return { label: "Outbox (reminder drafts)" };
  if (p === "/settings") return { label: "Settings" };
  if (p === "/registry") return { label: "Tasks registry table" };

  return { label: `Page ${p}` };
}
