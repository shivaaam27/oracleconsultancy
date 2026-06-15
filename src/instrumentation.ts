// Sentry server/edge initialisation + request-error capture.
// Runs automatically when the server starts. Stays inert if no DSN is set.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers and server actions.
export const onRequestError = Sentry.captureRequestError;
