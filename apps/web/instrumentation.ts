import { createReporter } from "@simple-alerts/nextjs";

// Simple Alerts server-error reporter: no-op unless ALERTS_* env vars set.
const alertsOnRequestError =
  process.env.ALERTS_ENDPOINT && process.env.ALERTS_PROJECT_KEY
    ? createReporter({
        endpoint: process.env.ALERTS_ENDPOINT,
        projectKey: process.env.ALERTS_PROJECT_KEY,
      }).onRequestError
    : async () => {};

// Next.js instrumentation hook (App Router): wires the Sentry server/edge
// SDKs, captures every unhandled server error via onRequestError, and pages
// via Telegram for 5xx-class failures.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // In-process 5-min sweeper (VPS path). Workers runs it via cron instead;
    // set SWEEPER_DISABLED=1 there.
    const { startSweeper } = await import("./lib/sweeper");
    startSweeper();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  const [error, request] = args;

  await Promise.allSettled([
    (async () => {
      const { captureRequestError } = await import("@sentry/nextjs");
      captureRequestError(...args);

      const { notifyErrorAfter } = await import("./lib/error-notify");
      notifyErrorAfter({
        error,
        source: "server/request",
        status: 500,
        details: {
          path: "path" in request ? String(request.path) : undefined,
          method: "method" in request ? String(request.method) : undefined,
        },
      });
    })(),
    (async () => {
      await alertsOnRequestError(...args);
    })(),
  ]);
}
