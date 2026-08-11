"use server";

// The approval step of the MCP sign-in.
//
// This is the ONE place a Claude connection is granted. It signs the person in
// (or uses the session they already have), mints a single-use authorization code
// and hands control back to the client's callback.
//
// Everything security-relevant is re-checked HERE, never trusted from the form:
// the client, the redirect URI, PKCE, and the audience. The hidden fields in the
// page are conveniences for carrying state across the round trip, not evidence.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAdminSession, ownerIdentifierMatches, verifyAdminPassword, getOwnerIdentity } from "@/lib/admin-auth";
import { findPortalPersonByIdentifier, getPortalPerson, portalPersonById, verifyPassword } from "@/lib/portal-auth";
import { callerIp, lockMessage, loginLockState, recordLoginFailure, recordLoginSuccess } from "@/lib/login-throttle";
import { getClient, issueCode, redirectAllowed, DEFAULT_SCOPE } from "@/lib/mcp/oauth";
import { recordEvent } from "@/lib/system-events";

export type ConnectState = { error: string } | null;

/** Build the client's callback URL, carrying `state` and `iss` (RFC 9207). */
function callbackUrl(base: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

/** This deployment's public origin — behind Vercel that is the forwarded host. */
async function currentIssuer(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export async function approveConnection(_prev: ConnectState, fd: FormData): Promise<ConnectState> {
  const clientId = String(fd.get("client_id") ?? "");
  const redirectUri = String(fd.get("redirect_uri") ?? "");
  const codeChallenge = String(fd.get("code_challenge") ?? "");
  const codeChallengeMethod = String(fd.get("code_challenge_method") ?? "S256");
  const state = String(fd.get("state") ?? "");
  const scope = String(fd.get("scope") ?? "") || DEFAULT_SCOPE;
  const resource = String(fd.get("resource") ?? "") || null;
  const who = String(fd.get("who") ?? "owner");
  // Recomputed here rather than read from the form. `iss` is how the client
  // confirms the response came from the server it started with (RFC 9207), so it
  // should be something we assert, not something the round trip carried for us.
  const issuer = await currentIssuer();

  // Re-validate the client and callback. If either is wrong we render an error
  // and redirect NOWHERE — an unvalidated redirect target is how codes get
  // delivered to an attacker.
  const client = await getClient(clientId);
  if (!client) return { error: "That connection request isn't recognised. Start again from Claude." };
  if (!redirectAllowed(client, redirectUri)) {
    return { error: "That connection request has an address we don't recognise. Start again from Claude." };
  }
  // PKCE is required, and only S256 is accepted.
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    redirect(callbackUrl(redirectUri, { error: "invalid_request", error_description: "PKCE (S256) is required.", state, iss: issuer }));
  }

  /* -------- who is approving? -------- */
  let personId: number | null = null;
  let approverName = "Owner";

  if (who === "staff") {
    const identifier = String(fd.get("identifier") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const existing = await getPortalPerson();

    if (existing && !identifier && !password) {
      personId = existing.id;
      approverName = existing.name;
    } else {
      if (!identifier || !password) return { error: "Enter your name/email and password." };
      const key = `mcp-connect:${identifier.toLowerCase()}:${await callerIp()}`;
      const lock = loginLockState(key);
      if (lock.locked) return { error: lockMessage(lock.retryAfterSec) };

      const person = await findPortalPersonByIdentifier(identifier);
      if (!person || !person.active || !verifyPassword(password, person.portal_password_hash as string)) {
        recordLoginFailure(key);
        return { error: "Sign-in details not recognised. Check with your administrator." };
      }
      recordLoginSuccess(key);
      personId = person.id as number;
      // The login candidate row carries only what authentication needs, so the
      // display name for the audit line is fetched separately.
      approverName = (await portalPersonById(personId))?.name ?? "Staff";
    }
  } else {
    // The owner. An existing command-centre session counts; otherwise the same
    // password (and identity second factor, when set) as /login.
    if (!(await isAdminSession())) {
      const password = String(fd.get("password") ?? "");
      const identifier = String(fd.get("identifier") ?? "").trim();
      if (!password) return { error: "Enter your password." };

      const key = `mcp-connect:owner:${await callerIp()}`;
      const lock = loginLockState(key);
      if (lock.locked) return { error: lockMessage(lock.retryAfterSec) };

      // Identity is a required second factor only when the owner has set one.
      const identity = await getOwnerIdentity();
      const identityRequired = Boolean(identity.name || identity.email);
      if (identityRequired && !(await ownerIdentifierMatches(identifier))) {
        recordLoginFailure(key);
        return { error: "Those details aren't recognised." };
      }
      if (!(await verifyAdminPassword(password))) {
        recordLoginFailure(key);
        return { error: "Those details aren't recognised." };
      }
      recordLoginSuccess(key);
    }
    personId = null; // null = the owner, exactly as in mcp_keys
  }

  /* -------- mint the code -------- */
  let code: string;
  try {
    code = await issueCode({
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      resource,
      personId,
    });
  } catch {
    return { error: "Something went wrong issuing the connection. Try again." };
  }

  await recordEvent("mcp.oauth.approve", "ok", { client: client.clientName, approver: approverName });

  // Back to Claude. `iss` lets the client confirm the response came from the
  // server it started with (RFC 9207).
  redirect(callbackUrl(redirectUri, { code, state, iss: issuer }));
}

/** "No, don't connect." Tells the client plainly rather than leaving it hanging. */
export async function denyConnection(fd: FormData): Promise<void> {
  const clientId = String(fd.get("client_id") ?? "");
  const redirectUri = String(fd.get("redirect_uri") ?? "");
  const state = String(fd.get("state") ?? "");

  const client = await getClient(clientId);
  if (!client || !redirectAllowed(client, redirectUri)) redirect("/");
  const issuer = await currentIssuer();

  redirect(callbackUrl(redirectUri, { error: "access_denied", error_description: "The request was declined.", state, iss: issuer }));
}
