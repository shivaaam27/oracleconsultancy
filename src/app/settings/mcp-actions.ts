"use server";

// Mint and revoke MCP access keys (Settings → Security & Access).
//
// A key is shown to the owner EXACTLY ONCE, at creation. Only its SHA-256 lands
// in the database, so a lost key cannot be recovered — it is revoked and replaced.
// See memory/mcp_stage1_read_only.md.

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/admin-auth";
import { sb } from "@/db/supabase";
import { generateKey, hashKey } from "@/lib/mcp/auth";
import { recordEvent } from "@/lib/system-events";

export type McpKeyRow = {
  id: number;
  label: string;
  personId: number | null;
  personName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Live keys, newest first. Never returns anything from which a key could be reconstructed. */
export async function listMcpKeys(): Promise<McpKeyRow[]> {
  if (!(await isAdminSession())) return [];
  const { data } = await sb
    .from("mcp_keys")
    .select("id,label,person_id,created_at,last_used_at,people(name)")
    .is("revoked_at", null)
    .order("id", { ascending: false });
  return (data ?? []).map((r) => {
    const person = Array.isArray(r.people) ? r.people[0] : r.people;
    return {
      id: r.id as number,
      label: (r.label as string) ?? "key",
      personId: (r.person_id as number | null) ?? null,
      personName: ((person as { name?: string } | null)?.name) ?? null,
      createdAt: r.created_at as string,
      lastUsedAt: (r.last_used_at as string | null) ?? null,
    };
  });
}

/**
 * Mint a key. `personId` null = the owner's own key (full command-centre reach);
 * otherwise the key inherits that staff member's portal role and scope.
 *
 * The plaintext comes back once, in this response, and is never stored.
 */
export async function createMcpKey(
  label: string,
  personId?: number | null,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const clean = (label ?? "").trim();
  if (!clean) return { ok: false, error: "Give the key a name so you can tell them apart." };

  try {
    const key = generateKey();
    const { error } = await sb.from("mcp_keys").insert({
      label: clean,
      key_hash: hashKey(key),
      person_id: personId ?? null,
      created_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    await recordEvent("mcp.key-created", "ok", { label: clean, personId: personId ?? null });
    revalidatePath("/settings");
    return { ok: true, key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the key." };
  }
}

/** Revoke immediately. The row is kept (so the audit trail survives) but the key
 *  stops working on the very next request — resolveCaller rejects a revoked key. */
export async function revokeMcpKey(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const { error } = await sb
    .from("mcp_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordEvent("mcp.key-revoked", "ok", { id });
  revalidatePath("/settings");
  return { ok: true };
}
