# 0013 — Primary deploy moved to Cloudflare Workers (OpenNext)

Date: 2026-11-15/16 · Status: accepted (prod since 2026-11-15) · Supersedes the deploy-target decisions in ADR 0006 (Coolify/VPS) and the 2026-10-31 "Vercel primary" update.

## Context

The app is a Next.js 15 dashboard + public viewer + API. It outgrew the VPS labeled-container path (ADR 0006): manual rsync + `run-web.sh`, Mongo on the same VPS, no managed TLS story beyond Coolify's Traefik. The workspace-wide 2026-11-15 policy prefers Cloudflare Workers (`@opennextjs/cloudflare`) for my-files web apps.

## Decision

- **Runtime:** Cloudflare Worker `postdrop`, OpenNext (`@opennextjs/cloudflare`), `apps/web/wrangler.jsonc` + `apps/web/worker-entry.ts` (wraps the OpenNext default fetch export and adds a `scheduled()` handler).
- **Driver:** `mongoose` removed. `apps/web/lib/db.ts` keeps a cached `MongoClient` against MongoDB Atlas; `apps/web/lib/models.ts` is a mongoose-free shim preserving the old model API (`findOne`, `find`, `create`, `updateOne`, `findOneAndUpdate({new})`, `aggregate`, `.lean()`, `doc.save()`).
- **Sweeper:** Coolify-side cron replaced by the Worker cron trigger `*/5 * * * *` calling `sweeperTick()` directly.
- **Storage:** unchanged — Backblaze B2 (`postdrop-files-e0a33531d28c`, S3 endpoint `https://s3.us-east-005.backblazeb2.com` — exact values in `wrangler.jsonc`) through the existing S3 driver. No data migration; R2 was considered and dropped (commit `611b965`).
- **DNS:** `thepostdrop.dev` zone on Cloudflare, apex + www worker-routed to `postdrop`. `workers.dev` preview URL exists as fallback.
- **Config:** non-secret config in `wrangler.jsonc` vars; secrets via `wrangler secret put` (Mongo Atlas URI, Google OAuth client, B2 app keys, `AUTH_SECRET`/`AUTH_URL`/`BASE_URL`/`AUTH_TRUST_HOST`, `ALERTS_ENDPOINT`).

## Consequences

- Deploy = build + `wrangler deploy` from the Mac (see `docs/OPERATIONS.md`). No CI pipeline yet.
- The VPS containers (`postdrop-web`, `postdrop-mongo`) are retired: they still run but receive no traffic; Atlas is the source of truth for Mongo data. Decommission (stop containers, remove Traefik labels) is a separate cleanup task.
- Docs/CONTRACT-era Vercel statements are historical.
