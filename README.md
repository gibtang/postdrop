# Postdrop

Open-source (Apache-2.0) sharing service for agent-made artifacts: your agents upload web-renderable files (CLI, MCP, or REST) with a bearer token, and anyone opens them through a public share link — no install, no login, no download.

**Web-renderable only:** PNG · JPEG · GIF · WebP · AVIF · SVG · PDF · MP4 · WebM · MP3 · WAV · OGG · TXT · MD · HTML · JSON · CSV — everything else is rejected at upload with the allowed list. Active formats (HTML/SVG) are served inside a sandboxed CSP so they can't touch the app. Limits: 5 MB per artifact (uploads >4.5 MB go direct-to-bucket via presigned PUT), 500 MB per account.

## How it works

1. Sign in at the dashboard (Google or email/password — email verification required for password accounts).
2. Create a **token** (shown once, stored hashed).
3. Agents publish artifacts and mint share links:

```bash
export POSTDROP_TOKEN=pd_live_…
npx postdrop-cli upload report.pdf --name "Q4 report"   # → prints a share URL
npx postdrop-cli share art_… --expires 2026-12-31T00:00:00Z
npx postdrop-cli list
```

MCP: point any agent at `BASE_URL/api/mcp` with an `Authorization: Bearer <token>` header — tools: `upload_artifact`, `upload_artifact_from_url`, `list_artifacts`, `get_artifact`, `share_artifact`, `unshare_artifact`, `delete_artifact`.

REST: same verbs under `/v1` (`POST /v1/artifacts`, `GET /v1/artifacts`, `PATCH /v1/artifacts/:id`, `DELETE /v1/artifacts/:id`, `POST /v1/artifacts/:id/share`, …). Errors are `{error: {code, message}}`.

Share links are view-only, unguessable, and can carry an expiry. Agents and humans open the same URL.

## Layout

- `apps/web` — Next.js 15: REST API (`/v1`), remote MCP (`/api/mcp`), dashboard, public viewer (`/a/[token]`), zero-knowledge secret paste (`/s`)
- `packages/sdk` — `postdrop-sdk`, the API client (used by the CLI; usable standalone)
- `packages/cli` — `postdrop` bin

## Self-hosting

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in values
pnpm --filter @postdrop/web build
pnpm --filter @postdrop/web start
```

- **MongoDB** — any Mongo 6+ (Atlas free tier works)
- **Storage** — `STORAGE_DRIVER=disk` for dev; `s3` for Backblaze B2 or any S3-compatible endpoint. B2 requires `forcePathStyle`-compatible endpoints (already configured). Bucket CORS must allow PUT from your dashboard origin for >4.5 MB uploads.
- **Auth** — set `GOOGLE_CLIENT_ID`/`SECRET` (Google Cloud console → OAuth client). Transactional email: SES (`SES_ACCESS_KEY_ID`/`SES_SECRET_ACCESS_KEY`, `MAIL_FROM`). SES is optional: unset it means password signups are auto-verified and reset/verification email is unavailable.
- **VPS/Coolify** — see `docs/OPERATIONS.md` and ADR 0006 (labeled-container path).

## Docs

- [`CONTEXT.md`](./CONTEXT.md) — domain glossary (User, Token, Artifact, Share Link, …)
- [`docs/adr/`](./docs/adr/) — decision records (pivot, auth, presigned uploads, deploy paths)
- [`docs/CONTRACT.md`](./docs/CONTRACT.md) — integration contract (env, data model, surfaces)

## Tests

```bash
pnpm build && pnpm test   # acceptance suite: boots the app on mongodb-memory-server + disk storage
```
