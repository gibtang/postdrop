# Postdrop integration contract (frozen by integrator)

Agents: read this fully before writing code. Your slice owns ONLY the paths listed. Do not run builds/tests/lint; the integrator runs them after merge. Do not add dependencies; everything needed is installed. TypeScript strict mode everywhere.

## Ownership map

- **core** agent: `apps/web/lib/**`, `apps/web/app/api/**`, `apps/web/app/v1/**`, `apps/web/middleware.ts`
- **ui** agent: `apps/web/app/**` (pages/layouts NOT under api/ or v1/), `apps/web/components/**`, `apps/web/app/globals.css` additions
- **clients** agent: `packages/sdk/**`, `packages/cli/**`, `packages/mcp/**`
- Integrator: root configs, Dockerfile, `.env*`, `tests/**`, docs

## Runtime

Node 20, Next.js 15 App Router (apps/web), pnpm workspaces. All server code ESM-friendly, TS strict. Validation with zod on every external input. No TODO/stub/mock — every code path real or the function is not written.

## Environment contract (see .env.example)

- `AUTH_MODE`: `password` (v1) | `firebase` (reserved — module seam only, do not implement)
- `STORAGE_DRIVER`: `disk` (default) | `s3` (S3-compatible: R2 or B2 via endpoint)
- `BASE_URL`: public origin — **`https://thepostdrop.dev`**
- `MONGODB_URI`, `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`
- `DISK_STORAGE_PATH` (disk driver); `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (s3 driver, forcePathStyle=true)

## Data model (mongoose, apps/web/lib/models)

- `Account { accountId: "acct_"+32hex, email unique, passwordHash?, tier: "free", createdAt }`
- `Agent { agentId: "agnt_"+32hex, accountId, name, keyHash: sha256 hex, keyPrefix: "pd_live_"+6hex, revokedAt?, createdAt }` — idx `{accountId}`
- `Drop { dropId: "drop_"+32hex, accountId, agentId, recipientEmail, filename, sizeBytes, mimeType, storageKey, status: "pending"|"answered"|"expired", linkTokenHash: sha256 hex unique, replyText?, editStorageKey?, editFilename?, editSizeBytes?, editMimeType?, expiresAt, answeredAt?, notifiedAt?, purgedAt?, createdAt }`
  - idx: `{agentId, createdAt:-1}`, `{linkTokenHash}` unique, `{status, expiresAt}` for sweeper
- Purge = set content fields null + `purgedAt: now`; row (tombstone) persists forever per ADR 0003.

## Storage interface (lib/storage/index.ts)

`putStream(key, body: ReadableStream, opts {contentType, contentLength?})`, `getStream(key): ReadableStream`, `remove(key)`. Drivers: `disk.ts` (write to DISK_STORAGE_PATH, stream from fs), `s3.ts` (@aws-sdk/client-s3, GetObjectCommand Body→stream, forcePathStyle). Keys: `drops/<dropId>/original-<filename-sanitized>`, `drops/<dropId>/edit-<filename-sanitized>`.

## Auth

- Agent key: `Authorization: Bearer pd_live_<64hex>`. Lookup: sha256(token) → Agent (not revoked). **Every** /v1 query filters by that agentId. Foreign/unauthorized → **404** (never 403 — no existence leak). Quota/space problems → 403 with `{error:{code}}`.
- Owner session: AUTH_MODE=password → POST /api/auth/login {email,password} verifies bcrypt hash, sets HttpOnly signed cookie `pd_session` (HMAC SESSION_SECRET, 7d). lib/owner-auth.ts exports `requireOwner(): Promise<Account>` used by /api/* routes. Seed owner: env `OWNER_EMAIL`+`OWNER_PASSWORD` auto-provision Account on first login if account table empty.
- Firebase mode: lib/owner-auth.ts keeps a seam (`if (process.env.AUTH_MODE === "firebase") throw not-implemented`); do not build it.

## API — agent-facing /v1 (Bearer key)

- `POST /v1/drops` — **raw binary body** (stream, do not buffer fully), headers: `x-filename`, `x-recipient-email`, `x-ttl-hours` (int 1–720, default 168). Response 201 `{dropId, linkUrl, expiresAt, filename, sizeBytes}`. Errors: 401, 403 `{error:{code:"QUOTA_EXCEEDED"}}` (free cap: total unpurged storage 100 MB), 413 (per-file > 1 GB), 422 (bad email/ttl). Sends Resend email to recipient (fire-and-forget; email failure must NOT fail the request; record notifiedAt only on success). `linkUrl = BASE_URL + "/l/" + token`.
- `GET /v1/drops?limit≤100&cursor` → `{drops:[{dropId,status,recipientEmail,filename,sizeBytes,expiresAt,createdAt,hasReply,hasEdit}], nextCursor?}`
- `GET /v1/drops/:id` → single summary | 404
- `GET /v1/drops/:id/result` → `{dropId,status,replyText?,edit?:{filename,sizeBytes}}` | 404
- `GET /v1/drops/:id/edit` → binary stream, Content-Disposition attachment | 404
- `POST /v1/drops/:id/revoke` → expires NOW + immediate purge → `{dropId,status:"expired"}` | 404

## API — owner /api (session cookie)

`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/agents`, `POST /api/agents {name}` → returns **plaintext key once**, `DELETE /api/agents/:id`, `GET /api/drops` (all account agents, summary list), `DELETE /api/drops/:id` (purge now), `GET /api/drops/:id/file` → original download stream (owner, scope-checked via accountId), `GET /api/usage` → `{tier:"free", storageBytes, capBytes:104857600}`.

## API — public link /l/:token

Every route: hash token → Drop; missing → 404; `expired` or `expiresAt < now` → **410** + purge-on-access. Success paths:
- `GET /l/:token` → Link page HTML (ui agent)
- `GET /l/:token/meta` → JSON `{filename,sizeBytes,mimeType,expiresAt,agentName?}`
- `GET /l/:token/file` → original download stream
- `POST /l/:token/reply {text ≤10_000}` → `{status:"answered"}` (idempotent, overwrite allowed)
- `POST /l/:token/edit` — raw binary body, headers `x-filename` → `{status:"answered"}` (replaces prior edit)
Reply/edit sets status answered + answeredAt.

## Expiry sweeper

lib/sweeper.ts: setInterval 5 min (skip in test env via `SWEEPER_DISABLED`) — find `status != "expired" && expiresAt < now` → purge each. Also instrument: purge on 410 access.

## Clients (packages)

- **sdk** (`@postdrop/sdk`, tsc→dist): `PostdropClient({baseUrl, apiKey})`: `send(file: string|Buffer|ReadableStream, {recipientEmail, ttlHours?, filename?})`, `get(id)`, `result(id)`, `downloadEdit(id, destPath?)`, `revoke(id)`, `list(opts?)`. Streams via native fetch + FormData-free raw body.
- **cli** (`postdrop-cli`, bin `postdrop`, commander): `postdrop drop <file> --to <email> [--ttl 168]` prints linkUrl; `postdrop check <dropId>` prints status + reply/edit; `postdrop edit-download <dropId> [dest]`. Env `POSTDROP_API_KEY`, `POSTDROP_BASE_URL` (default https://thepostdrop.dev).
- **mcp** (`postdrop-mcp`, @modelcontextprotocol/sdk stdio server): tools `postdrop_send {file_path, recipient_email, ttl_hours?}`, `postdrop_check {drop_id}` (returns status, replyText, edit presence). Same envs. Minimal MCP version handshake per SDK defaults.

## UI direction (ui agent)

Stripe-clean: Inter font, white/slate-50 surfaces, slate-900 text, single blurple accent (#635bff), 8px spacing rhythm, crisp 1px borders (slate-200), rounded-lg, generous whitespace, no shadows heavier than sm. Dashboard: left sidebar (Drops, Agents, Usage), content table for drops (filename, agent, recipient, status pill, expiry countdown, row actions: Download, Revoke, Delete). Agents page: list + "New agent" dialog → show-once key reveal with copy button. Usage: storage meter bar. Link page: centered card (file icon, filename, size, from agent, expiry), Download button primary, Reply textarea, Edit file input, success states. Password fields always have show/hide eye toggle. No marketing site.

## Acceptance test map (integrator will implement in tests/)

A: whole loop real file via /v1 + /l; B: zero-setup evidence doc; C: clients e2e against running server; D: foreign key 404 on drops/:id, result, edit; expired link 410 + purged content fields; revoke purges; E: pricing page copy constants only; F: quota 403 after cap.
