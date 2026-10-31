# Coolify-managed deployment replaced by labeled container on the Coolify network

> Update 2026-10-31: after the artifact-sharing pivot (ADR 0009) the primary deploy target for this workspace is **Vercel** (per global deploy policy); MongoDB Atlas + Backblaze B2 are the primary backing services. This ADR remains accurate as the **self-host path**: the labeled-container VPS setup below is the documented way to run Postdrop outside Vercel.

This Coolify version's deployment pipeline fails for `dockerfile`-type applications: the build succeeds (in a helper container, pulling `FROM localhost:5000/postdrop-web:local` from a host-local registry), but the rolling update then looks for an image tag `pq2ez…:latest` that the build never produced, so every deploy fails. `dockerfile` is also immutable via the PATCH API.

We decided to run the web container ourselves (`docker run` with the same Traefik labels every other app on this host uses — apex+www router, Let's Encrypt resolver, gzip+redirect middlewares) attached to the `coolify` network, and delete the broken Coolify application resource. Mongo runs as a sibling infra container on the same network.

Rejected alternatives: debugging Coolify's deployment job (unknown-version internals, no upgrade path verified) and pushing to GHCR (no valid GitHub credential). Consequence: the app is not visible as a Coolify resource in the panel — logs/restarts go through `docker`/`run-web.sh` — while proxying, TLS, and the host remain exactly as Coolify manages them for every other app. If Coolify is upgraded and dockerfile apps deploy correctly, `provision-vps.sh` + `run-web.sh` make the switch mechanical.
