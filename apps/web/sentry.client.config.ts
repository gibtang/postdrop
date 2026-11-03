import * as Sentry from "@sentry/nextjs";

// Guard: no DSN → skip init entirely (must never crash build or boot).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
