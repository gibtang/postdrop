# Postdrop operations

Primary deploy (since 2026-11-18): **VPS self-host path below** — the Cloudflare Workers cutover (ADR 0013, live 2026-11-16) was reverted after Workers Free-plan 10ms CPU limits broke dashboard renders and server actions. Backing services: MongoDB Atlas (same cluster the Workers deploy used — no data split) + Backblaze B2.

Rollback: the Cloudflare `postdrop` worker still runs. Re-add the zone routes `thepostdrop.dev/*` + `www.thepostdrop.dev/*` (worker vars include `SWEEPER_DISABLED=1`; sweeper runs from the CF cron there). Note ADR 0013's "Workers primary" decision is superseded by this revert.

## B2 / storage notes (2026-11-18)

- Storage driver = `aws4fetch` (fetch-based SigV4). The AWS SDK v3 data plane cannot run on Workers (needs `node:fs` for shared INI config + node streams) and presigned HEAD is unsupported by B2 — the driver stays runtime-agnostic for both paths.
- `head()` = Range-GET (`bytes=0-0`); `readStoredHead()` = bounded Range-GET. Never `reader.cancel()` / `res.body.cancel()` an unconsumed undici body — it deadlocks Node's fetch and hangs the caller.
- B2 key layout in `credentials.md`: master key is S3-incompatible; bucket-scoped app key (…0003) 403s HEAD/range from Cloudflare egress; `postdrop-s3-allbuckets` (…0004) is live in prod secrets.
- Presigned PUT: expiry MUST be a query param (`X-Amz-Expires`), never a request header (aws4fetch signs leftover headers verbatim; B2 400s a signed header absent from the request).

## Rollback — Cloudflare Workers (retired primary, ADR 0013)

```bash
pnpm install                                   # repo root
cd apps/web
npx opennextjs-cloudflare build
CLOUDFLARE_API_TOKEN=<cf token> \
CLOUDFLARE_ACCOUNT_ID=<account id> \
  npx wrangler deploy                          # MUST be @opennextjs/cloudflare, not opennextjs/cloudflare
```

- Config in `apps/web/wrangler.jsonc` (cron `*/5 * * * *`, B2 S3 vars, `SWEEPER_DISABLED=1`).
- Deploying the WORKER does not change DNS while the worker routes are deleted; re-add `thepostdrop.dev/*` + `www.thepostdrop.dev/*` in the CF zone to roll traffic back.
- Known Workers-only issue: cron events log `Handler does not export a scheduled() function` despite the export — unresolved; the VPS sweeper covers expiry/purge on the primary path.

## VPS layout (ubuntu@66.70.190.82) — primary self-host path

Use `ssh -F ~/Dropbox/ssh/config vps` (plain `ubuntu@66.70.190.82` stopped resolving keys mid-session).

| Path / name | What |
|---|---|
| `/home/ubuntu/postdrop/src` | Deployed source (rsync target) |
| `/home/ubuntu/postdrop/secrets.env` | AUTH_SECRET, Google OAuth, SES, Telegram, PostHog values (600) |
| `/home/ubuntu/postdrop/secrets-b2.env` | B2 keys (all-buckets app key …0004), bucket, `MONGODB_URI` (Atlas, quoted — the URI contains `&`) (600) |
| container `postdrop-web` | Next.js standalone (binds 0.0.0.0:3000, Traefik labels) |
| B2 bucket | `postdrop-files-e0a33531d28c` (S3 endpoint `s3.us-east-005.backblazeb2.com`) |

`MONGODB_URI` points at MongoDB Atlas (cluster0.wudkk) — the same DB the Workers deploy used. The old local `postdrop-mongo` container/volume is gone; do not resurrect it.

Required env (see `apps/web/.env.example`): `MONGODB_URI`, `BASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST=true`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `SES_*` + `MAIL_FROM` (optional — unset means password signups auto-verify), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (5xx alerts), `ALERTS_ENDPOINT` (+ `ALERTS_PROJECT_KEY`, pending), `STORAGE_DRIVER=s3` + `S3_*`, `MAX_ARTIFACT_BYTES`, `QUOTA_BYTES`.

## Redeploy (from repo root on the Mac) — primary path

```bash
rsync -az --exclude node_modules --exclude .git --exclude '.next' --exclude '.open-next' --exclude '.wrangler' --exclude 'dist' \
  --exclude '.storage' --exclude 'tests' --exclude '.env' ./ \
  ubuntu@66.70.190.82:/home/ubuntu/postdrop/src/
ssh ubuntu@66.70.190.82 'bash /home/ubuntu/postdrop/run-web.sh'   # builds image, recreates container
```

`run-web.sh` is idempotent (docker build on the VPS — ADR 0006 deviation; this Coolify version fails to start dockerfile-built images). Verifies listen + Traefik routing before exiting.

## Agent usage

Remote MCP (no install) — point agents at `https://thepostdrop.dev/api/mcp` with `Authorization: Bearer <token>`. Tools: `upload_artifact`, `upload_artifact_from_url`, `list_artifacts`, `get_artifact`, `share_artifact`, `unshare_artifact`, `delete_artifact`.

REST (same token): `https://thepostdrop.dev/v1/*`.

## Known limitations

- **Dashboard login**: Auth.js v5 — Google OAuth + email/password (scrypt, email-verified before first credentials login; signup auto-verifies when SES is unconfigured). Firebase is gone (ADR 0010 supersedes 0007).
- Email (verification/reset) via Amazon SES (thepostdrop.dev identity, eu-north-1, aws4fetch); unset degrades gracefully with auto-verify.
- Limits: **5 MB per artifact** (`413 FILE_TOO_LARGE`), **500 MB per account** (`422 QUOTA_EXCEEDED`); 60 uploads/min per token (`429`). Format whitelist enforced server-side (`422 UNSUPPORTED_FORMAT`). No billing.
- No webhooks (removed with the pivot) — agents poll via MCP or REST.
- Sweeper runs in-process every 5 min (Node) or via CF cron (rollback path). Manual tick (session auth): `POST /api/sweeper/run` → `{expiredLinks, pastesPurged}`.
