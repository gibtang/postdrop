// `withSentryConfig` lives on the config subpath in this SDK version — the
// package root no longer exports it (named import from the root fails at
// config load, breaking both `next build` and the acceptance suite's
// `next start`).
import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

// Tolerates missing env at build time: no SENTRY_AUTH_TOKEN in CI, so source
// map upload stays disabled; runtime error capture works via the DSN alone.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  sourcemaps: {
    disable: true,
  },
});
