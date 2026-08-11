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
// STAGE 1 IS READ-ONLY. See memory/mcp_stage1_read_only.md.

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { resolveCaller, callerName, type McpCaller } from "@/lib/mcp/auth";
import { toolsFor, callerMayUse, companyNamesFor, MCP_TOOLS } from "@/lib/mcp/registry";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";

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
          { title: tool.title, description: tool.description, inputSchema: tool.schema },
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
      serverInfo: { name: "cos-system", version: "1.0.0" },
      instructions:
        "Oracle Consultancy's Chief-of-Staff system (COS). " +
        (companies.length
          ? `Companies you can see: ${companies.join(", ")}. `
          : "") +
        "Every tool here is READ-ONLY — you can look at anything you are shown, but you cannot " +
        "change, create or delete anything; say so plainly if asked to. Task codes look like " +
        "DS-001 (a two-letter company prefix and a number). 'Open' means any status except " +
        "Completed and Closed. Dates you send are yyyy-mm-dd and times shown are Dar es Salaam " +
        "(EAT, UTC+3). Reach for search_cos when you don't know which list something lives in.",
    },
  );
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
  { required: true },
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
