# Postdrop operations

Primary deploy: **Cloudflare Workers** (OpenNext; ADR 0013 — supersedes ADR 0006/VPS and the 2026-10-31 Vercel note). Backing services: MongoDB Atlas + Backblaze B2. The VPS below is the **retired self-host path** — containers still run but receive no traffic.

## Deploy — Cloudflare Workers (primary)

```bash
pnpm install                                   # repo root
cd apps/web
npx opennextjs-cloudflare build   # GA_MEASUREMENT_ID must be in env — see secrets note below
CLOUDFLARE_API_TOKEN=<cf token> \
CLOUDFLARE_ACCOUNT_ID=0af4eab452c61ba50b9b84753bf2a5aa \
  npx wrangler deploy
```

- Config lives in `apps/web/wrangler.jsonc` (name `postdrop`, cron `*/5 * * * *`, B2 S3 vars). Secrets via `npx wrangler secret put <NAME>`: `MONGODB_URI`, `MONGODB_DATABASE_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BASE_URL=https://thepostdrop.dev`, `AUTH_URL=https://thepostdrop.dev`, `AUTH_TRUST_HOST=true`, `AUTH_SECRET` (carried from the VPS `secrets.env`; Auth.js v5 requires it), `GA_MEASUREMENT_ID=G-M0YZL8SPXX` (must exist **at build time** too — the homepage is prerendered, so pass it to `opennextjs-cloudflare build` or the gtag snippet won't render; see issue #13), `ALERTS_ENDPOINT`, `ALERTS_PROJECT_KEY` (pending). SES values optional — unset auto-verifies signups.
- `thepostdrop.dev` is worker-routed in the Cloudflare zone (apex + www). `https://postdrop.gibtang.workers.dev` is the preview fallback.
- Verify after deploy: homepage 200 with `x-opennext: 1`; paste round trip (create → read → 410 burn) against `/api/pastes`; `/sitemap.xml` emits `https://thepostdrop.dev` (proves `BASE_URL`); `/api/auth/csrf` 200.

## VPS layout (ubuntu@66.70.190.82) — retired self-host path

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
- Deploy is a Coolify-network container on the VPS path — **retired 2026-11-15** (ADR 0013); containers remain up but unrouted, Atlas replaced the VPS Mongo. Decommission is pending.
- Limits: **5 MB per artifact** (`413 FILE_TOO_LARGE`), **500 MB per account** (`422 QUOTA_EXCEEDED`); 60 uploads/min per token (`429`). Format whitelist enforced server-side (`422 UNSUPPORTED_FORMAT`). No billing.
- No webhooks (removed with the pivot) — agents poll via MCP or REST.
- Manual sweeper tick (session auth): `POST /api/sweeper/run` → `{expiredLinks, pastesPurged}`.
