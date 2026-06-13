import "server-only";
import { cookies, headers } from "next/headers";
import { sb } from "@/db/supabase";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

/* ------------------------------------------------------------------ *
 * Passkeys / Face ID / fingerprint (WebAuthn).
 * We store only PUBLIC keys; the biometric never leaves the device.
 * person_id null = the owner (admin); otherwise a staff member.
 * ------------------------------------------------------------------ */

const RP_NAME = "Oracle Consultancy";
const CHALLENGE_COOKIE = "cos_webauthn";

export type RegScope = { kind: "admin" } | { kind: "person"; id: number; name: string };

/** Derive the Relying-Party ID + origin from the request (works on localhost + Vercel). */
async function rp(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const hostname = host.split(":")[0];
  const proto = h.get("x-forwarded-proto") ?? (hostname === "localhost" ? "http" : "https");
  return { rpID: hostname, origin: `${proto}://${host}` };
}

const encB64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const decB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

async function stashChallenge(challenge: string, personId: number | null): Promise<void> {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, JSON.stringify({ challenge, personId }), {
    httpOnly: true, sameSite: "strict", secure: true, maxAge: 300, path: "/",
  });
}
async function readChallenge(): Promise<{ challenge: string; personId: number | null } | null> {
  const raw = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function clearChallenge(): Promise<void> { (await cookies()).delete(CHALLENGE_COOKIE); }

type CredRow = { id: number; credential_id: string; transports: string | null; label: string | null; created_at: string; last_used_at: string | null };

/** List a scope's registered passkeys (for the management UI). */
export async function listCredentials(scope: RegScope): Promise<CredRow[]> {
  let q = sb.from("webauthn_credentials").select("id,credential_id,transports,label,created_at,last_used_at").order("created_at", { ascending: false });
  q = scope.kind === "admin" ? q.is("person_id", null) : q.eq("person_id", scope.id);
  const { data } = await q;
  return (data ?? []) as CredRow[];
}

export async function deleteCredential(id: number, scope: RegScope): Promise<void> {
  let q = sb.from("webauthn_credentials").delete().eq("id", id);
  q = scope.kind === "admin" ? q.is("person_id", null) : q.eq("person_id", scope.id);
  await q;
}

/** Step 1 of registration: options for the browser (and stash the challenge). */
export async function beginRegistration(scope: RegScope) {
  const { rpID } = await rp();
  const existing = await listCredentials(scope);
  const userID = new TextEncoder().encode(scope.kind === "admin" ? "owner" : `person:${scope.id}`);
  const userName = scope.kind === "admin" ? "Owner" : scope.name;
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID,
    userName,
    userDisplayName: userName,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: (c.transports?.split(",").filter(Boolean) as AuthenticatorTransportFuture[]) ?? undefined,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await stashChallenge(options.challenge, scope.kind === "admin" ? null : scope.id);
  return options;
}

/** Step 2 of registration: verify + store the public key. */
export async function finishRegistration(scope: RegScope, response: RegistrationResponseJSON, label: string | null): Promise<{ ok: boolean; error?: string }> {
  const stash = await readChallenge();
  if (!stash) return { ok: false, error: "Registration expired — please try again." };
  const { rpID, origin } = await rp();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response, expectedChallenge: stash.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not verify the passkey." };
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false, error: "Could not verify the passkey." };
  const { credential } = verification.registrationInfo;
  const personId = scope.kind === "admin" ? null : scope.id;
  const { error } = await sb.from("webauthn_credentials").insert({
    person_id: personId,
    credential_id: credential.id,
    public_key: encB64(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports?.join(",") ?? null,
    label,
    created_at: new Date().toISOString(),
  });
  await clearChallenge();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Step 1 of sign-in: discoverable authentication options. */
export async function beginAuthentication() {
  const { rpID } = await rp();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred", allowCredentials: [] });
  await stashChallenge(options.challenge, null);
  return options;
}

/** Step 2 of sign-in: verify the assertion; returns whose credential it is. */
export async function finishAuthentication(response: AuthenticationResponseJSON): Promise<{ ok: boolean; error?: string; personId?: number | null }> {
  const stash = await readChallenge();
  if (!stash) return { ok: false, error: "Sign-in expired — please try again." };
  const { rpID, origin } = await rp();
  const { data: cred } = await sb.from("webauthn_credentials").select("*").eq("credential_id", response.id).maybeSingle();
  if (!cred) return { ok: false, error: "This device isn't registered. Add a passkey from your profile first." };
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge: stash.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
      credential: {
        id: cred.credential_id as string,
        publicKey: decB64(cred.public_key as string),
        counter: Number(cred.counter ?? 0),
        transports: (cred.transports as string | null)?.split(",").filter(Boolean) as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not verify." };
  }
  if (!verification.verified) return { ok: false, error: "Could not verify the passkey." };
  await sb.from("webauthn_credentials").update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", cred.id);
  await clearChallenge();
  return { ok: true, personId: (cred.person_id as number | null) ?? null };
}
