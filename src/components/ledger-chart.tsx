"use client";

// THE CHART OF ACCOUNTS — the tree, and the form that edits it (Phase 1).
//
// ⚠️ Hand-built rather than `RecordList`, and this is the one place that is the
// right call: a chart of accounts is a TREE, and the two shells are built for
// flat lists. Everything else follows Desk — `data-list-row` for the rhythm,
// `data-list-head` for the column strip, hairlines to separate, one blue, no
// pills and no glass (DESIGN_SYSTEM.md §0).
//
// ⚠️ Imports `ledger-shared`, NEVER `ledger-accounts`. The latter pulls
// `@/db/supabase` into the browser bundle and every page dies with
// "SUPABASE_SERVICE_ROLE_KEY is not set". Server work goes through the actions.

import { useMemo, useState, useTransition } from "react";
import { BookOpen, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, FieldLabel, Input, Textarea } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { cn } from "@/lib/cn";
import {
  ACCOUNT_TYPES, DEFAULT_ROLES, DEFAULT_ROLE_LABELS, ROOT_TYPES,
  buildAccountTree, flattenTree, ledgerAmount, signedBalance,
  type GlAccount, type RootType,
} from "@/lib/ledger-shared";
import {
  archiveAccountAction, createAccountAction, deleteAccountAction,
  seedChartAction, updateAccountAction,
} from "@/app/ledger/actions";

type Balance = { debit: number; credit: number; entries: number };

export function LedgerChart({
  companyId, companyName, accounts, balances, health,
}: {
  companyId: number;
  companyName: string;
  accounts: GlAccount[];
  balances: Record<number, Balance>;
  health: { ok: boolean; debit: number; credit: number; difference: number };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GlAccount | "new" | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => (showArchived ? accounts : accounts.filter((a) => !a.archived)),
    [accounts, showArchived],
  );

  // The tree, and each account's total INCLUDING everything beneath it — worked
  // out here, never stored (rule 3).
  const rows = useMemo(() => {
    const tree = buildAccountTree(visible);
    const flat = flattenTree(tree);
    const totals = new Map<number, Balance>();
    const walk = (id: number, children: number[]): Balance => {
      const own = balances[id] ?? { debit: 0, credit: 0, entries: 0 };
      const t = { ...own };
      for (const c of children) {
        const sub = totals.get(c) ?? { debit: 0, credit: 0, entries: 0 };
        t.debit += sub.debit; t.credit += sub.credit; t.entries += sub.entries;
      }
      totals.set(id, t);
      return t;
    };
    // Children first, so a parent can add up what is already worked out.
    const post = (nodes: ReturnType<typeof buildAccountTree>): void => {
      for (const n of nodes) {
        post(n.children);
        walk(n.account.id, n.children.map((c) => c.account.id));
      }
    };
    post(tree);

    // Hide anything inside a collapsed heading.
    const hidden = new Set<number>();
    for (const n of flat) {
      if (n.account.parentId !== null && (hidden.has(n.account.parentId) || collapsed.has(n.account.parentId))) {
        hidden.add(n.account.id);
      }
    }
    return flat
      .filter((n) => !hidden.has(n.account.id))
      .map((n) => ({ ...n, total: totals.get(n.account.id) ?? { debit: 0, credit: 0, entries: 0 } }));
  }, [visible, balances, collapsed]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not work.");
      else setEditing(null);
    });
  };

  const toggle = (id: number) => setCollapsed((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* ── nothing yet: offer the template ─────────────────────────────────── */
  if (accounts.length === 0) {
    return (
      <>
        {error && <Problem>{error}</Problem>}
        <div className="rounded-xl border border-border bg-bg-elev p-8">
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title={`${companyName} has no chart of accounts yet`}
            hint="Start from the standard chart — assets, liabilities, equity, income and expenses, with the Tanzanian tax accounts already in place. You can rename, add and archive anything afterwards."
            action={
              <Button onClick={() => run(() => seedChartAction(companyId))} loading={pending}>
                Set up the chart of accounts
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {error && <Problem>{error}</Problem>}

      {/* ⚠️ THE ALARM. Every voucher is checked before it is written, so this
          should always be quiet. If it is not, something reached gl_entries
          without going through postVoucher — worth stopping to find. */}
      {!health.ok && (
        <div className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-base text-danger">
          <strong>The books do not balance.</strong> Debits {ledgerAmount(health.debit)} against credits{" "}
          {ledgerAmount(health.credit)} — out by {ledgerAmount(Math.abs(health.difference))}. Every voucher is
          checked before it is written, so this means something was posted another way. Do not carry on
          until it is found.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <button
            type="button"
            onClick={() => setCollapsed(new Set(accounts.filter((a) => a.isGroup).map((a) => a.id)))}
            className="hover:text-fg"
          >
            Collapse all
          </button>
          <span className="text-fg-subtle">·</span>
          <button type="button" onClick={() => setCollapsed(new Set())} className="hover:text-fg">
            Expand all
          </button>
          <span className="text-fg-subtle">·</span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Show archived
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => run(() => seedChartAction(companyId))} loading={pending}>
            Top up from template
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Account
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-base">
            <thead>
              <tr data-list-head className="border-b border-border text-left">
                <Th className="w-[42%]">Account</Th>
                <Th>Type</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account: a, depth, total }) => {
                const hasKids = accounts.some((x) => x.parentId === a.id);
                const isShut = collapsed.has(a.id);
                const signed = signedBalance(a.rootType, total.debit, total.credit);
                return (
                  <tr
                    key={a.id}
                    data-list-row
                    onClick={() => setEditing(a)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 last:border-0 hover:bg-bg-muted/60",
                      a.archived && "opacity-55",
                    )}
                  >
                    <Td>
                      <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
                        {hasKids ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggle(a.id); }}
                            className="-ml-1 rounded p-0.5 text-fg-subtle hover:text-fg"
                            aria-label={isShut ? "Expand" : "Collapse"}
                          >
                            {isShut ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        ) : (
                          <span className="w-[18px]" aria-hidden />
                        )}
                        <span className="tabular text-fg-subtle">{a.number}</span>
                        <span className={cn("truncate", a.isGroup && "font-medium")}>{a.name}</span>
                        {a.defaultFor && (
                          <Badge tone="accent">
                            {DEFAULT_ROLE_LABELS[a.defaultFor as never] ?? a.defaultFor}
                          </Badge>
                        )}
                        {a.archived && <Badge>archived</Badge>}
                      </span>
                    </Td>
                    <Td className="text-fg-muted">
                      {a.isGroup ? "Heading" : (a.accountType ?? a.rootType)}
                      {a.currency && <span className="ml-1 text-fg-subtle">· {a.currency}</span>}
                    </Td>
                    <Td className="tabular text-right text-fg-muted">{ledgerAmount(total.debit)}</Td>
                    <Td className="tabular text-right text-fg-muted">{ledgerAmount(total.credit)}</Td>
                    <Td className={cn("tabular text-right", signed < 0 && "text-danger")}>
                      {ledgerAmount(signed)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-1.5 text-sm text-fg-subtle">
          {rows.length} of {accounts.length} shown · a balance is worked out from the entries every time this page
          loads, never stored
        </div>
      </div>

      {editing && (
        <AccountSheet
          key={editing === "new" ? "new" : editing.id}
          account={editing === "new" ? null : editing}
          accounts={accounts}
          balances={balances}
          busy={pending}
          onClose={() => { setEditing(null); setError(null); }}
          onSave={(fields) => run(() =>
            editing === "new"
              ? createAccountAction({ companyId, ...fields })
              : updateAccountAction(editing.id, fields))}
          onArchive={(archived) => editing !== "new" && run(() => archiveAccountAction(editing.id, archived))}
          onDelete={() => editing !== "new" && run(() => deleteAccountAction(editing.id))}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the form ───── */

type Fields = {
  number: string;
  name: string;
  parentId: number | null;
  rootType: string;
  accountType: string | null;
  isGroup: boolean;
  currency: string | null;
  defaultFor: string | null;
  notes: string | null;
};

function AccountSheet({
  account, accounts, balances, busy, onClose, onSave, onArchive, onDelete,
}: {
  account: GlAccount | null;
  accounts: GlAccount[];
  balances: Record<number, Balance>;
  busy: boolean;
  onClose: () => void;
  onSave: (f: Fields) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState<Fields>({
    number: account?.number ?? "",
    name: account?.name ?? "",
    parentId: account?.parentId ?? null,
    rootType: account?.rootType ?? "Expense",
    accountType: account?.accountType ?? null,
    isGroup: account?.isGroup ?? false,
    currency: account?.currency ?? null,
    defaultFor: account?.defaultFor ?? null,
    notes: account?.notes ?? null,
  });
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((s) => ({ ...s, [k]: v }));

  const posted = account ? (balances[account.id]?.entries ?? 0) : 0;

  // Only groups of the SAME root type can hold this account — the rule the
  // server enforces, shown here so the drop-down cannot offer a refusal.
  const parents = accounts.filter(
    (a) => a.isGroup && a.rootType === f.rootType && a.id !== account?.id && !a.archived,
  );
  const claimed = new Set(
    accounts.filter((a) => a.defaultFor && a.id !== account?.id).map((a) => a.defaultFor!),
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={account ? `${account.number} · ${account.name}` : "New account"}
      icon={<BookOpen className="h-4 w-4" />}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-fg-subtle">
            {posted > 0 ? `${posted} posting${posted === 1 ? "" : "s"}` : "No postings yet"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(f)} loading={busy}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Number</FieldLabel>
          <Input value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="6340" />
        </div>
        <div>
          <FieldLabel>Name</FieldLabel>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Office supplies" />
        </div>

        <div>
          <FieldLabel>Kind</FieldLabel>
          <FluidSelect
            value={f.rootType}
            options={ROOT_TYPES.map((r) => ({ value: r, label: r }))}
            onSelect={(v) => {
              // Changing the root moves it out of its old parent's branch.
              set("rootType", v as RootType);
              set("parentId", null);
            }}
          />
          {posted > 0 && (
            <p className="mt-1 text-xs text-fg-subtle">
              ⚠️ Frozen — this account has postings, so changing its kind would change every past report.
            </p>
          )}
        </div>
        <div>
          <FieldLabel>Filed under</FieldLabel>
          <FluidSelect
            value={f.parentId === null ? "" : String(f.parentId)}
            options={[{ value: "", label: "— top level —" },
              ...parents.map((p) => ({ value: String(p.id), label: `${p.number} · ${p.name}` }))]}
            onSelect={(v) => set("parentId", v === "" ? null : Number(v))}
            placeholder="— top level —"
          />
        </div>

        <div>
          <FieldLabel>What sort of account</FieldLabel>
          <FluidSelect
            value={f.accountType ?? ""}
            options={[{ value: "", label: "— none —" }, ...ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))]}
            onSelect={(v) => set("accountType", v || null)}
            placeholder="— none —"
          />
        </div>
        <div>
          <FieldLabel>Currency</FieldLabel>
          <Input
            value={f.currency ?? ""}
            onChange={(e) => set("currency", e.target.value.toUpperCase() || null)}
            placeholder="TZS (leave blank)"
          />
          <p className="mt-1 text-xs text-fg-subtle">
            Only for an account genuinely held in another money — a dollar bank account. The books are still
            kept in shillings.
          </p>
        </div>

        <label className="col-span-full flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2">
          <input
            type="checkbox"
            checked={f.isGroup}
            onChange={(e) => set("isGroup", e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
            disabled={posted > 0}
          />
          <span className="text-base">
            This is a heading
            <span className="block text-xs text-fg-subtle">
              A heading holds other accounts and takes no postings of its own. Its total is the sum of
              everything beneath it.
            </span>
          </span>
        </label>

        <div className="col-span-full">
          <FieldLabel>Its job in the system</FieldLabel>
          <FluidSelect
            value={f.defaultFor ?? ""}
            options={[
              { value: "", label: "— none —" },
              ...DEFAULT_ROLES.filter((r) => !claimed.has(r) || r === account?.defaultFor)
                .map((r) => ({ value: r, label: DEFAULT_ROLE_LABELS[r] })),
            ]}
            onSelect={(v) => set("defaultFor", v || null)}
            placeholder="— none —"
          />
          <p className="mt-1 text-xs text-fg-subtle">
            How the system finds this account without being told its number — so when an invoice starts
            posting itself, it asks for &ldquo;the debtors account&rdquo; and gets this one. One account per job.
          </p>
        </div>

        <div className="col-span-full">
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            rows={2}
            value={f.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            placeholder="What belongs in here, and what does not."
          />
        </div>

        {account && (
          <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={() => onArchive(!account.archived)} loading={busy}>
              {account.archived ? "Bring back into use" : "Archive"}
            </Button>
            <span className="text-xs text-fg-subtle">
              {account.archived
                ? "It is closed to new postings; what it already holds still counts."
                : "Stops new postings. Everything already posted still counts and still shows."}
            </span>
            {posted === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-danger"
                onClick={onDelete}
                loading={busy}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ────────────────────────────────────────────────────────────── bits ────── */

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-base text-danger">
      {children}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
