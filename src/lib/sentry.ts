// Optional error reporting. If SENTRY_DSN is set and @sentry/nextjs is
// installed, errors get forwarded. Otherwise this is a no-op so the app
// runs fine without telemetry.

let sentry: { captureException: (e: unknown, ctx?: Record<string, unknown>) => void } | null = null;
let tried = false;

async function load() {
  if (tried) return;
  tried = true;
  if (!process.env.SENTRY_DSN) return;
  try {
    // Indirect specifier so TS doesn't require the module at build time.
    const spec = "@sentry/nextjs";
    const mod = (await import(/* webpackIgnore: true */ spec).catch(() => null)) as
      | { captureException?: (e: unknown, ctx?: unknown) => void }
      | null;
    if (mod?.captureException) {
      sentry = { captureException: (e, ctx) => mod.captureException!(e, ctx as never) };
    }
  } catch {
    // ignore
  }
}

export async function reportError(err: unknown, context?: Record<string, unknown>) {
  await load();
  if (sentry) {
    try {
      sentry.captureException(err, { extra: context });
    } catch {
      // swallow — telemetry must never crash the request
    }
  }
  // Always log to server console so it surfaces in Vercel logs.
  // eslint-disable-next-line no-console
  console.error("[cos-error]", err, context ?? {});
}
