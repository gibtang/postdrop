# Postdrop integration contract

Frozen integration contract for the artifact-sharing service (post-pivot, 2026-10-31). Domain language: see [`CONTEXT.md`](../CONTEXT.md). Decisions: see `docs/adr/`.

## Surfaces

| Surface | Path / package | Auth |
|---|---|---|
| REST API | `apps/web` `/v1/*` | `Authorization: Bearer pd_live_<64hex>` (Token) |
| Remote MCP | `apps/web` `/api/mcp` (streamable HTTP) | same bearer token |
| Dashboard | `/dashboard`, `/dashboard/tokens`, `/dashboard/links` | Auth.js v5 session (Google + email/password) |
| Public viewer | `/a/[token]` (+ `/a/[token]/raw`) | none — share link only |
| Secret paste | `/s`, `/s/[token]`, `/api/pastes` | none — zero-knowledge, key in URL fragment |
| CLI | `packages/cli` bin `postdrop` | `POSTDROP_TOKEN` env or `--token` |
| SDK | `packages/sdk` `@postdrop/sdk` | token passed to client |

## Data model (MongoDB, mongoose — `apps/web/lib/models.ts`)

- `users` — Auth.js adapter shape + `passwordHash` (null for Google-only), `createdAt`. email unique lowercase.
- `tokens` — `tokenId tok_*`, `userId` (= stringified `users._id`), `name`, `keyHash` (sha256), `keyPrefix`, `revokedAt`, `lastUsedAt`. Plaintext shown once at creation, never stored.
- `artifacts` — `artifactId art_*`, `userId`, `filename`, `contentType` (whitelisted), `size`, `storageKey`, `createdAt/updatedAt`.
- `share_links` — `linkId slnk_*`, `linkToken` (public URL segment `/a/<linkToken>`), `artifactId`, `userId`, `revokedAt`, `expiresAt`, `expiredAt`. Deleted with their artifact.
- `verification_tokens` — hashed, single-use, `purpose: verify|reset`.
- `events` — audit (`artifact_uploaded|edited|deleted`, `share_created|revoked`, `token_created|revoked`).
- `pastes` — zero-knowledge secret links (untouched by the pivot).

## Invariants

- Formats: strict whitelist (`lib/formats.ts`); non-renderable → `422 UNSUPPORTED_FORMAT` listing allowed extensions. HTML/SVG (+all raw share content) served with `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`, `nosniff`.
- Limits: `MAX_ARTIFACT_BYTES` (default 5 MB) → `413 FILE_TOO_LARGE`; `QUOTA_BYTES` (default 500 MB, sum of owned artifact sizes) → `422 QUOTA_EXCEEDED`. 60 uploads/min/token → `429`.
- Uploads >4.5 MB must use presign (ADR 0011): `POST /v1/uploads/presign` → client PUT → `POST /v1/uploads/complete`. Requires `STORAGE_DRIVER=s3`; disk driver answers `501 PRESIGN_UNAVAILABLE`.
- Dead share links (expired/revoked/artifact deleted) → uniform 404 on viewer + raw, no distinction.
- Foreign resources → 404 (no existence leak). Errors: `{error: {code, message}}`.

## Env contract (`apps/web/.env.example`)

`MONGODB_URI`, `BASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`/`RESEND_FROM` (optional — unset auto-verifies signups), `STORAGE_DRIVER` + `DISK_STORAGE_PATH` or `S3_*`, `MAX_ARTIFACT_BYTES`, `QUOTA_BYTES`, `SWEEPER_DISABLED`. Clients: `POSTDROP_TOKEN`, `POSTDROP_BASE_URL`. Nothing else is read.

## Deploy

Vercel primary (Atlas + B2); VPS labeled-container path documented in `docs/OPERATIONS.md` + ADR 0006. Background sweeper (5 min) marks expired share links and purges secret pastes.
