// Next.js instrumentation hook (App Router): wires the Sentry server/edge
// SDKs, captures every unhandled server error via onRequestError, and pages
// via Telegram for 5xx-class failures.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);

  const { notifyErrorAfter } = await import("./lib/error-notify");
  const [error, request] = args;
  notifyErrorAfter({
    error,
    source: "server/request",
    status: 500,
    details: {
      path: "path" in request ? String(request.path) : undefined,
      method: "method" in request ? String(request.method) : undefined,
    },
  });
}
