// Browser-side Sentry init. Captures unhandled errors in the user's browser.
// Inert unless NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});

// Lets Sentry tie errors to the page the user was navigating to.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
