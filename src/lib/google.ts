// Google account connection (OAuth) for Calendar + Meet. Server-only.
//
// Setup (one-time, owner in Google Cloud Console): create a project → enable the
// Google Calendar API → OAuth consent screen = Internal → create an OAuth Client
// ID (Web app) with redirect URIs pointing at /api/google/callback → put the
// Client ID/Secret in env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Then click
// "Connect Google" in Settings once to grant access; we store the refresh token.
//
// Degrades gracefully: when not configured/connected, callers fall back to the
// .ics email path — exactly like getEmailConfig/getGroqKey.

import { google } from "googleapis";
import { sb } from "@/db/supabase";

// Use the OAuth2 client type as googleapis itself exposes it, to avoid a
// dual-package clash with a second copy of google-auth-library.
export type GoogleAuthClient = InstanceType<typeof google.auth.OAuth2>;

// Create/update events and their Meet conference data. Plus the connected
// account's email so Settings can show "Connected as …".
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

const REFRESH_TOKEN_KEY = "google.refreshToken";
const EMAIL_KEY = "google.connectedEmail";

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Redirect URI must exactly match one registered on the OAuth client. */
export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/google/callback`;
}

export function oauthClient(origin: string): GoogleAuthClient {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(origin)
  );
}

/** Consent URL — offline + prompt=consent so we always receive a refresh token. */
export function buildAuthUrl(origin: string): string {
  return oauthClient(origin).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });
}

async function readSetting(key: string): Promise<string | null> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | null) ?? null;
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  if (value == null) {
    await sb.from("settings").delete().eq("key", key);
    return;
  }
  await sb.from("settings").upsert({ key, value }, { onConflict: "key" });
}

/** Stored after a successful connect; the long-lived key we re-use to send. */
export async function saveGoogleConnection(refreshToken: string, email: string | null): Promise<void> {
  await writeSetting(REFRESH_TOKEN_KEY, refreshToken);
  await writeSetting(EMAIL_KEY, email);
}

export async function disconnectGoogle(): Promise<void> {
  await writeSetting(REFRESH_TOKEN_KEY, null);
  await writeSetting(EMAIL_KEY, null);
}

export async function getGoogleStatus(): Promise<{ configured: boolean; connected: boolean; email: string | null }> {
  if (!isGoogleConfigured()) return { configured: false, connected: false, email: null };
  const token = await readSetting(REFRESH_TOKEN_KEY);
  return { configured: true, connected: !!token, email: await readSetting(EMAIL_KEY) };
}

/**
 * An OAuth client primed with the stored refresh token, ready for API calls.
 * Returns null when not configured or not connected (caller falls back to email).
 * The redirect/origin is irrelevant for refresh-token use, so any value works.
 */
export async function getAuthorizedClient(): Promise<GoogleAuthClient | null> {
  if (!isGoogleConfigured()) return null;
  const refreshToken = await readSetting(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
