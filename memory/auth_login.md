---
name: auth-login
description: "Login screen redesign + owner identity + Face ID/fingerprint passkeys (WebAuthn), June 2026"
metadata:
  node_type: memory
  type: project
---

# Login & auth (June 2026)

## Login screen (`/login`)
One screen, two tabs via `src/app/login/auth-tabs.tsx`: **Staff Login** (default) | **Administrator**, sliding-pill indicator. Staff tab = portal form (identifier+password, "Remember me", "No access yet" note); Administrator = owner form (now Name/email + password). Shared `AuthShell` (`components/auth-shell.tsx`) now: logo image `public/logo-source.png` in a gradient-framed white tile + accent halo, big "Oracle Consultancy", optional title/subtitle, entrance motion, "secure sign-in" footer. `/portal/login` still exists and shares the shell.

## Owner identity (optional 2nd factor on Administrator)
`admin-auth.ts`: `getOwnerIdentity`/`setOwnerIdentity`/`ownerIdentifierMatches` (settings keys `v2.ownerName`,`v2.ownerEmail`). `adminLogin` now checks the typed Name/email matches IF configured (blank = password-only, **no lockout**). Editor in Settings → Owner sign-in (`adminSaveOwnerIdentity`).

## Passkeys — Face ID / fingerprint (WebAuthn)
Deps: `@simplewebauthn/server@13` + `@simplewebauthn/browser@13`. Table **`webauthn_credentials`** (migration **0062_married_goblin_queen.sql**, APPLIED): person_id null = owner, else staff; stores only the PUBLIC key (biometric never leaves device).
- `lib/webauthn.ts`: rp() derives rpID/origin from headers (localhost + Vercel); challenge stashed in httpOnly cookie `cos_webauthn` (5min). `beginRegistration`/`finishRegistration` (residentKey required = discoverable), `beginAuthentication`/`finishAuthentication` (allowCredentials=[] → discoverable; looks up cred → returns personId), `listCredentials`/`deleteCredential`.
- Login: `app/login/passkey-actions.ts` (startPasskeyLogin/completePasskeyLogin → sets admin or portal cookie by credential scope) + `passkey-login-button.tsx` ("Sign in with Face ID or fingerprint", discoverable, works for owner AND staff). Mounted in auth-tabs.
- Register (must be signed in): owner in **Settings → Face ID & fingerprint** (`settings/passkey-actions.ts`); staff in **/portal/profile → Sign in faster** (`portal/passkey-actions.ts`). Both use generic `components/passkey-manager.tsx` (add/list/remove, device-label guess).
- **NOT live-tested**: the embedded preview has no biometric hardware, so the ceremony can't run there; renders + tsc clean + no console errors. Needs HTTPS (Vercel) or localhost; iOS needs the site added to Home Screen for platform authenticator.

All pushed (login redesign commit 7de13bc; passkeys + owner-identity in the follow-up).
