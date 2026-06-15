// Server-side Sentry init. Inert unless SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  // Error monitoring only for now — no performance tracing (keeps quota/cost low).
  tracesSampleRate: 0,
});
