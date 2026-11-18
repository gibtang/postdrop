# Postdrop operations

Primary deploy (since 2026-11-18): **VPS self-host path below** — Cloudflare Workers cutover (2026-11-16) reverted after Free-plan 10ms CPU limits broke dashboard renders and actions. Backing services: MongoDB Atlas (same cluster Workers used) + Backblaze B2. Worker `postdrop` still exists as instant rollback: re-add zone routes `thepostdrop.dev/*` + `www.thepostdrop.dev/*` (worker vars include `SWEEPER_DISABLED=1`).

## B2 / storage notes (2026-11-18)

- Storage driver = `aws4fetch` (fetch-based SigV4). The AWS SDK v3 data plane cannot run on Workers (needs `node:fs` + node streams) and presigned HEAD is unsupported by B2 — kept for both runtimes.
- `head()` = Range-GET (`bytes=0-0`); `readStoredHead()` = bounded Range-GET. Never `reader.cancel()` / `res.body.cancel()` an unconsumed undici body — it deadlocks Node's fetch.
- B2 key layout in `credentials.md`: master key is S3-incompatible; bucket-scoped app key 403s HEAD/range from CF egress; `postdrop-s3-allbuckets` (…0004) is live in prod secrets.
- Presigned PUT: expiry MUST be a query param (`X-Amz-Expires`), never a request header.

## VPS layout (ubuntu@66.70.190.82) — self-host path

Use `ssh -F ~/Dropbox/ssh/config vps` (plain `ubuntu@66.70.190.82` stopped resolving keys mid-session).

| Path / name | What |
|---|---|
| `/home/ubuntu/postdrop/src` | Deployed source (rsync target) |
| `/home/ubuntu/postdrop/secrets.env` | Mongo password, AUTH_SECRET (600) |
| `/home/ubuntu/postdrop/secrets-b2.env` | B2 keys, bucket, SES email values (600) |
| container `postdrop-web` | Next.js standalone (binds 0.0.0.0:3000, Traefik labels) |
| container `postdrop-mongo` | Mongo 7 on `coolify` network, volume `postdrop-mongo-data` |
| B2 bucket | `postdrop-files-e0a33531d28c` (S3 endpoint `s3.us-east-005.backblazeb2.com`) |

Required env (see `apps/web/.env.example`): `MONGODB_URI`, `BASE_URL`, `AUTH_SECRET`, `AUTH_URL` (pins the Auth.js base URL behind the proxy — without it OAuth redirects use `0.0.0.0:3000`), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `SES_*` + `MAIL_FROM` (optional — unset means password signups auto-verify), `STORAGE_DRIVER=s3` + `S3_*` (presigned uploads require s3), `MAX_ARTIFACT_BYTES`, `QUOTA_BYTES`.

## Redeploy (from repo root on the Mac) — self-host path

```bash
rsync -az --exclude node_modules --exclude .git --exclude '.next' --exclude 'dist' \
  --exclude '.storage' --exclude 'tests' --exclude '.env' ./ \
  ubuntu@66.70.190.82:/home/ubuntu/postdrop/src/
ssh ubuntu@66.70.190.82 'bash /home/ubuntu/postdrop/run-web.sh'   # builds image, recreates container
```

`run-web.sh` is idempotent. Provision from scratch: `provision-vps.sh` (mongo) + `run-web.sh`.

## Agent usage

Remote MCP (no install) — point agents at `https://thepostdrop.dev/api/mcp` with `Authorization: Bearer <token>`. Tools: `upload_artifact`, `upload_artifact_from_url`, `list_artifacts`, `get_artifact`, `share_artifact`, `unshare_artifact`, `delete_artifact`.

REST (same token): `https://thepostdrop.dev/v1/*`.

## Known limitations

- **Dashboard login**: Auth.js v5 — Google OAuth + email/password (scrypt, email-verified before first credentials login; signup auto-verifies when SES is unconfigured). Firebase is gone (ADR 0010 supersedes 0007).
- Email (verification/reset) via Amazon SES (thepostdrop.dev identity, eu-north-1); unset degrades gracefully with auto-verify.
- Deploy is a Coolify-network container on the VPS path, not a Coolify-managed resource — ADR 0006.
- Limits: **5 MB per artifact** (`413 FILE_TOO_LARGE`), **500 MB per account** (`422 QUOTA_EXCEEDED`); 60 uploads/min per token (`429`). Format whitelist enforced server-side (`422 UNSUPPORTED_FORMAT`). No billing.
- No webhooks (removed with the pivot) — agents poll via MCP or REST.
- Manual sweeper tick (session auth): `POST /api/sweeper/run` → `{expiredLinks, pastesPurged}`.
