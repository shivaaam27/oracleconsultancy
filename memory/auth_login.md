---
name: auth-login
description: "Sign-in screen (StudioSignIn), owner identity, and Face ID/fingerprint passkeys (WebAuthn)"
metadata:
  node_type: memory
  type: project
---

# Sign-in and auth

## The sign-in screen — `StudioSignIn`

`src/components/studio/auth/studio-sign-in.tsx` is the ONE sign-in screen, served
at **both** `/login` and `/portal/login`, so whichever address a device lands on
it offers both ways in. (`/portal/login` used to be staff-only, and a stale staff
cookie kept sending the owner there with no Administrator option. The proxy now
sends only a VALID token to the portal.)

- **Staff | Administrator** is a two-option segmented switch, both visible. The
  choice is remembered on the device (`localStorage` `cos.signin.as`), so the
  owner lands on Administrator every time.
- Staff: identifier + password → `portalLogin` (`src/app/portal/actions.ts`).
  Administrator: name/email + password → `adminLogin`; first run (no owner hash
  yet) shows `adminSetup` instead (`src/app/login/actions.ts`).
- Face ID / fingerprint sits beside the password as a peer. A device that has
  used a passkey before gets that button first (`PASSKEY_USED_KEY`).
- Desk: split screen with the dark brand panel (`AuthFrame`). Phone: the form
  alone. On a computer the cursor waits in the first empty box; on a phone
  nothing is focused, so the keyboard does not jump up.
- Both pages also mount `ForgetOfflineNotes` (clears the offline notes copy);
  `/portal/login` adds `PortalSessionRestore` (re-mints a staff session from the
  remember token when an installed app dropped the cookie).
- `AuthFrame` is reused by the MCP consent screen (`studio-consent.tsx`,
  `/mcp/connect`) so it looks like Oracle, not a stranger's page.
- The old `auth-tabs.tsx` and `auth-shell.tsx` are gone.

## Sessions

- Owner: signed HttpOnly cookie `cos_admin` (`src/lib/admin-auth.ts`).
- Staff: signed HttpOnly cookie `cos_portal` (`src/lib/portal-auth.ts`).
- Both sign with `PORTAL_SESSION_SECRET`; the `secret()` derivation must stay
  identical in `src/proxy.ts`, `admin-auth.ts` and `portal-auth.ts`.
- Passwords are scrypt (`scrypt:<salt>:<hash>`, `hashPassword`/`verifyPassword`
  in `portal-auth.ts`, used for the owner too). See `security.md` for the open
  items on hash cost and login throttling.

## Owner identity (optional second factor)

`admin-auth.ts`: `getOwnerIdentity` / `setOwnerIdentity` /
`ownerIdentifierMatches` (settings `v2.ownerName`, `v2.ownerEmail`). When set,
the Administrator side must type a matching name or email; blank = password
only, never a lockout. Edited in Settings → Security & Access → Owner sign-in
(`adminSaveOwnerIdentity`).

## Passkeys — Face ID / fingerprint (WebAuthn)

- `@simplewebauthn/server` + `@simplewebauthn/browser` (v13). Table
  `webauthn_credentials`: `person_id` null = owner, else staff; stores only the
  PUBLIC key.
- `src/lib/webauthn.ts`: rpID/origin from request headers (localhost + Vercel);
  challenge in the 5-minute HttpOnly cookie `cos_webauthn`; discoverable
  credentials (resident key required).
- Sign in: `src/app/login/passkey-actions.ts` + `passkey-login-button.tsx`
  (inside `StudioSignIn`). Sets the admin or portal cookie by the credential's
  owner. Also offers conditional-UI autofill (`useBrowserAutofill`).
- Register (must be signed in), both via `components/passkey-manager.tsx`:
  - owner — Settings → **Face ID & fingerprint** (`#passkeys`,
    `settings/passkey-actions.ts`);
  - staff, managers, directors — `/portal/profile` → **Sign-in & app** card
    (`portal/passkey-actions.ts`).
- Needs HTTPS or localhost. The embedded preview has no biometric hardware, so
  the ceremony can only be tested on a real device.
