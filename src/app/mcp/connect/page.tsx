// /mcp/connect — the screen Claude sends you to when you press "Connect".
//
// This is the OAuth authorization endpoint (advertised in the RFC 8414 metadata
// document). It is a real page rather than a raw route handler so it can use the
// Aurora kit and the same sign-in shell as /login: a consent screen that looks
// foreign is a consent screen people click through without reading.
//
// ⚠️ It must be OUTSIDE the admin gate in src/proxy.ts — whoever arrives here is
// by definition not yet signed in to this browser.
//
// Order matters: validate the client and the redirect URI BEFORE anything else,
// and if either is wrong, render an error rather than redirecting. Bouncing to an
// unvalidated address is how authorization codes reach the wrong hands.

import { AuthShell } from "@/components/auth-shell";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import { getClient, redirectAllowed, DEFAULT_SCOPE } from "@/lib/mcp/oauth";
import { ConnectForm, type ConnectParams } from "./connect-form";

export const metadata = { title: "Connect an assistant — Oracle Consultancy" };
export const dynamic = "force-dynamic";

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <AuthShell kicker="Oracle Consultancy Limited" title="Connection request">
      <div className="space-y-2 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="text-fg-muted">{detail}</p>
      </div>
    </AuthShell>
  );
}

export default async function McpConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const clientId = one("client_id");
  const redirectUri = one("redirect_uri");
  const responseType = one("response_type") || "code";

  if (!clientId || !redirectUri) {
    return <Problem title="Something's missing" detail="This link is incomplete. Start the connection again from Claude." />;
  }

  const client = await getClient(clientId);
  if (!client) {
    return <Problem title="We don't recognise that assistant" detail="Start the connection again from Claude, and it will introduce itself first." />;
  }
  if (!redirectAllowed(client, redirectUri)) {
    // Exact match failed. Never redirect to an address we haven't approved.
    return (
      <Problem
        title="That return address doesn't match"
        detail="For your safety we won't send anything back to an address this assistant didn't register. Start again from Claude."
      />
    );
  }
  if (responseType !== "code") {
    return <Problem title="Unsupported request" detail="This server only issues authorization codes." />;
  }

  const params: ConnectParams = {
    clientId,
    clientName: client.clientName,
    redirectUri,
    codeChallenge: one("code_challenge"),
    codeChallengeMethod: one("code_challenge_method") || "S256",
    state: one("state"),
    scope: one("scope") || DEFAULT_SCOPE,
    resource: one("resource") || null,
  };

  // If this browser already has a session, skip straight to "Approve".
  const [owner, staff] = await Promise.all([isAdminSession(), getPortalPerson()]);
  const signedInAs = owner
    ? ({ kind: "owner", name: "the owner" } as const)
    : staff
      ? ({ kind: "staff", name: staff.name } as const)
      : null;

  return (
    <AuthShell kicker="Oracle Consultancy Limited" title="Connect an assistant">
      <ConnectForm params={params} signedInAs={signedInAs} />
    </AuthShell>
  );
}
