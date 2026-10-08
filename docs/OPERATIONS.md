# Postdrop operations

Live: **https://thepostdrop.dev** (apex + www → 66.70.190.82, TLS via Coolify's Traefik, Let's Encrypt).

## VPS layout (ubuntu@66.70.190.82)

| Path / name | What |
|---|---|
| `/home/ubuntu/postdrop/src` | Deployed source (rsync target) |
| `/home/ubuntu/postdrop/secrets.env` | Mongo password, session secret, owner password (600) |
| `/home/ubuntu/postdrop/secrets-b2.env` | B2 keys, bucket, Resend values (600) |
| `/home/ubuntu/postdrop/owner-credentials.txt` | Dashboard login for Gibson (600 — read then delete) |
| container `postdrop-web` | Next.js standalone (binds 0.0.0.0:3000, Traefik labels) |
| container `postdrop-mongo` | Mongo 7 on `coolify` network, volume `postdrop-mongo-data` |
| container `postdrop-registry` | localhost:5000 registry (buildkit workaround, may be removed) |
| B2 bucket | `postdrop-files-e0a33531d28c` (S3 endpoint `s3.us-east-005.backblazeb2.com`) |

## Redeploy (from repo root on the Mac)

```bash
rsync -az --exclude node_modules --exclude .git --exclude '.next' --exclude 'dist' \
  --exclude '.storage' --exclude 'tests' --exclude '.env' ./ \
  ubuntu@66.70.190.82:/home/ubuntu/postdrop/src/
ssh ubuntu@66.70.190.82 'bash /home/ubuntu/postdrop/run-web.sh'   # builds image, recreates container
```

`run-web.sh` is idempotent. Provision from scratch: `provision-vps.sh` (mongo) + `run-web.sh`.

## Agent usage

```bash
export POSTDROP_API_KEY=pd_live_…        # dashboard → Agents → New agent (show once)
export POSTDROP_BASE_URL=https://thepostdrop.dev
postdrop drop ./file.pdf --to person@example.com
postdrop check drop_…          # status + reply + edit
postdrop edit-download drop_… [dest]
```

MCP: `npx postdrop-mcp` (after npm publish) with `POSTDROP_API_KEY` env.

## Known limitations

- Recipient email notifications are **off**: the reused Resend key is dead. New key → set `RESEND_API_KEY` + `RESEND_FROM`, restart container.
- Deploy is a Coolify-network container, not a Coolify-managed resource — ADR 0006.
- Free tier: 100 MB total unpurged storage, 1 GB per file, links 1h–720h (default 7d).
