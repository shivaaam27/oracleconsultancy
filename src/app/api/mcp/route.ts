// /api/mcp — the door an AI assistant walks through to reach COS.
//
// Speaks the Model Context Protocol over Streamable HTTP (the current transport;
// SSE is legacy). Authentication is an `Authorization: Bearer <key>` header
// resolved by lib/mcp/auth.ts; the tools come from lib/mcp/registry.ts.
//
// ⚠️ This route MUST be excluded from the admin gate in src/proxy.ts. It does its
// own authentication and has no browser cookie — left inside the gate, every
// request is redirected to /login and no assistant can ever connect.
//
// STAGE 2: reads, plus safe writes. Nothing here sends, spends or deletes — see
// memory/mcp_stage2_safe_writes.md.

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { resolveCaller, callerName, callerStamp, type McpCaller } from "@/lib/mcp/auth";
import { toolsFor, callerMayUse, companyNamesFor, MCP_TOOLS } from "@/lib/mcp/registry";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { revalidateTag } from "next/cache";
import { invalidateAllTasks } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cache resolved callers for the life of one request only. `withMcpAuth` verifies
 *  the token, then the handler needs the same caller again to build its tools —
 *  this avoids a second database round trip without holding identity any longer
 *  than the request that presented it. */
const inFlight = new Map<string, McpCaller>();

/**
 * Build the MCP server for ONE caller.
 *
 * Deliberately per-request: the tools registered are exactly the tools this
 * caller may use, so a tool they can't call never reaches the model's context at
 * all. Each handler then re-checks anyway — see below.
 */
function serverFor(caller: McpCaller, companies: string[]) {
  return createMcpHandler(
    (server: McpServer) => {
      for (const tool of toolsFor(caller)) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.schema,
            // Tell the client which tools change things. `destructiveHint: false`
            // is the honest answer everywhere here: stage 2 creates and amends,
            // and nothing it can do deletes or sends.
            annotations: {
              readOnlyHint: !tool.write,
              destructiveHint: false,
              openWorldHint: false,
            },
          },
          async (args: unknown) => {
            // SECOND check, and the one that actually protects anything. The
            // filtered list above is prompt hygiene; a key can be pointed at a
            // tool name directly, so permission is verified here at the point of
            // execution too. Never remove this because the tool "isn't offered".
            const live = MCP_TOOLS.find((t) => t.name === tool.name);
            if (!live || !callerMayUse(live, caller)) {
              return { content: [{ type: "text" as const, text: "Not permitted." }], isError: true };
            }
            try {
              const result = await live.run((args ?? {}) as Record<string, unknown>, caller);
              if (live.write) await afterWrite(live.name, caller, result);
              return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 1) }] };
            } catch (err) {
              reportError(err, { route: "api/mcp", tool: tool.name });
              // Report the failure to the assistant rather than throwing: it can
              // then tell the user plainly instead of the whole turn dying.
              return {
                content: [{
                  type: "text" as const,
                  text: `Tool ${tool.name} failed: ${err instanceof Error ? err.message : String(err)}`,
                }],
                isError: true,
              };
            }
          },
        );
      }
    },
    {
      serverInfo: { name: "cos-system", version: "2.0.0" },
      instructions:
        "Oracle Consultancy's Chief-of-Staff system (COS). " +
        (companies.length
          ? `Companies you can see: ${companies.join(", ")}. `
          : "") +
        "Task codes look like DS-001 (a two-letter company prefix and a number). 'Open' means any " +
        "status except Completed and Closed. Dates you send are yyyy-mm-dd and times are Dar es " +
        "Salaam (EAT, UTC+3). Reach for search_cos when you don't know which list something lives in. " +
        "\n\nWHAT YOU CAN CHANGE. Most tools read. The rest change real records: raise tasks, post " +
        "updates, complete and close them, archive them, change several at once, put meetings in the " +
        "diary, file documents, hand out equipment. Before any of them, be sure of the details — the " +
        "company, the person, the date — and ASK rather than guess. A task on the wrong company is " +
        "worse than a question, and nothing here is urgent enough to guess at. " +
        "\n\nTWO THINGS YOU CANNOT DO. **You cannot delete anything.** When someone asks you to get " +
        "rid of a task or a document, archive it — that keeps the record and its history while taking " +
        "it out of the way — and tell them that's what you did. Deleting for real is done in COS by " +
        "hand. **You cannot send a message.** draft_message SAVES A DRAFT in the Outbox for a person " +
        "to send; say so every time, so nobody believes a message went out when it didn't. " +
        "\n\nTHE ONE EXCEPTION: creating a meeting or event DOES email an invitation to attendees who " +
        "have an email address. That is real post going to real people, so check the time, the date " +
        "and the guest list before you call it, and afterwards say who was invited. Use " +
        "sendInvitations: false if they only want it pencilled in. " +
        "\n\nAFTERWARDS. Tell the person exactly what you changed and quote the task code or id you " +
        "got back. Every change is stamped with your key's name and shows in the timeline. If you get " +
        "it wrong, undo_last_change reverses your own last change for ten minutes — except a bulk " +
        "change, which has no single undo, so read those back carefully.",
    },
  );
}

/**
 * Housekeeping after a write: bust the caches the browser reads from, and record
 * the change in system events so there's a trail beyond the row itself.
 *
 * Best-effort by design — the write already committed, so a failure here must not
 * turn a successful change into an error the assistant reports as a failure.
 */
async function afterWrite(tool: string, caller: McpCaller, result: unknown): Promise<void> {
  const ok = !!(result as { ok?: boolean } | null)?.ok;
  try {
    revalidateTag("tasks", { expire: 0 }); invalidateAllTasks();
    revalidateTag("outbox", { expire: 0 });
    revalidateTag("people", { expire: 0 });
  } catch { /* cache busting is not worth failing a committed write over */ }
  try {
    await recordEvent("mcp.write", ok ? "ok" : "error", {
      tool,
      by: callerStamp(caller),
      ...(ok ? {} : { error: (result as { error?: string } | null)?.error ?? "refused" }),
    });
  } catch { /* the audit row is the timeline's job; this is a bonus */ }
}

/** Verify the bearer token. Returning undefined makes mcp-handler answer 401 with
 *  the WWW-Authenticate challenge, which is also the contract OAuth needs in
 *  stage 3 — so this shape doesn't change when sign-in arrives. */
async function verifyToken(_req: Request, bearer?: string) {
  const caller = await resolveCaller(bearer);
  if (!caller || !bearer) return undefined;
  inFlight.set(bearer, caller);
  return {
    token: bearer,
    clientId: `mcp-key-${caller.keyId}`,
    scopes: [] as string[],
    extra: { kind: caller.kind, name: callerName(caller) },
  };
}

const handler = withMcpAuth(
  async (req: Request) => {
    const bearer = req.auth?.token;
    const caller = bearer ? inFlight.get(bearer) : undefined;
    if (!caller) return new Response("Unauthorised.", { status: 401 });
    try {
      const companies = await companyNamesFor(caller);
      return await serverFor(caller, companies)(req);
    } finally {
      if (bearer) inFlight.delete(bearer);
    }
  },
  verifyToken,
  {
    required: true,
    // THE CONTRACT THAT STARTS THE SIGN-IN (stage 3). An unauthenticated request
    // must come back 401 with a WWW-Authenticate header naming the
    // protected-resource document — that pointer is the ONLY way claude.ai and
    // the phone learn where to send you to sign in. Without it they simply report
    // that the server refused them.
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  },
);

export async function POST(req: Request): Promise<Response> {
  try {
    return await handler(req);
  } catch (err) {
    reportError(err, { route: "api/mcp" });
    await recordEvent("mcp.request", "error", { message: String(err) });
    return new Response("MCP request failed.", { status: 500 });
  }
}

// Streamable HTTP also uses GET (for the server→client stream) and DELETE (to end
// a session). Hand all three to the same handler.
export const GET = POST;
export const DELETE = POST;
