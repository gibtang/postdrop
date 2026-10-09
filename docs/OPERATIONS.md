# Postdrop operations

Live: **https://thepostdrop.dev** (apex + www → 66.70.190.82, TLS via Coolify's Traefik, Let's Encrypt).

## VPS layout (ubuntu@66.70.190.82)

Use `ssh -F ~/Dropbox/ssh/config vps` (plain `ubuntu@66.70.190.82` stopped resolving keys mid-session).

| Path / name | What |
|---|---|
| `/home/ubuntu/postdrop/src` | Deployed source (rsync target) |
| `/home/ubuntu/postdrop/secrets.env` | Mongo password, session secret, legacy owner password (600) |
| `/home/ubuntu/postdrop/secrets-b2.env` | B2 keys, bucket, Resend values (600) |
| `/home/ubuntu/postdrop/secrets-firebase.env` | Shared Firebase project `stork-ticker` creds (client build args + admin key) (600) |
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

- **Dashboard login**: Firebase (project `stork-ticker`, shared with agent-utils prod — ADR 0007). Sign in at `/login` with your stork-ticker email+password (Google button appears only if the provider is enabled there). Password login is disabled in production (`AUTH_MODE=firebase`); `owner-credentials.txt`/`OWNER_PASSWORD` are legacy no-ops.

- Recipient email notifications are **off**: no working mail credential. Chosen path: AWS SES in `eu-north-1` (console identities → verify `thepostdrop.dev`, DKIM CNAMEs via GoDaddy, `no-reply@` sender, SMTP/IAM creds) — or paste a valid Resend key. Either way: set `RESEND_API_KEY`-equivalent env + `RESEND_FROM`, swap transport in `lib/email.ts`, restart container.
- Deploy is a Coolify-network container, not a Coolify-managed resource — ADR 0006.
- Free tier: 100 MB total unpurged storage, 1 GB per file, links 1h–720h (default 7d).
