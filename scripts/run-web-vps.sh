#!/bin/bash
# Postdrop web: run directly on the coolify network behind coolify-proxy (traefik).
# Reason: this Coolify version fails to start dockerfile-built images (tag mismatch).
# See docs/adr/0006-coolify-deploy-deviation.md.
set -euo pipefail
BASE=/home/ubuntu/postdrop
cd "$BASE"
set -a
source secrets.env
source secrets-b2.env
set +a

echo "== image"
docker build -t postdrop-web:local src \
  --build-arg NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY:-}" \
  --build-arg NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST:-}" \
  --build-arg GA_MEASUREMENT_ID="${GA_MEASUREMENT_ID:-}" \
  > /tmp/build.log 2>&1
tail -1 /tmp/build.log

echo "== container"
docker rm -f postdrop-web >/dev/null 2>&1 || true
docker run -d --name postdrop-web --restart unless-stopped --network coolify \
  -e BASE_URL="https://thepostdrop.dev" \
  -e HOSTNAME=0.0.0.0 \
  -e AUTH_URL="https://thepostdrop.dev" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e AUTH_TRUST_HOST=true \
  -e GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -e GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  -e MONGODB_URI="mongodb://postdrop:$MONGO_PASSWORD@postdrop-mongo:27017/postdrop?authSource=admin" \
  -e STORAGE_DRIVER=s3 \
  -e S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com" \
  -e S3_REGION="us-east-005" \
  -e S3_BUCKET="$S3_BUCKET" \
  -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e SES_ACCESS_KEY_ID="$SES_ACCESS_KEY_ID" \
  -e SES_SECRET_ACCESS_KEY="$SES_SECRET_ACCESS_KEY" \
  -e SES_REGION="eu-north-1" \
  -e MAIL_FROM="no-reply@thepostdrop.dev" \
  -e NEXT_PUBLIC_POSTHOG_KEY="$NEXT_PUBLIC_POSTHOG_KEY" \
  -e NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST:-https://us.i.posthog.com}" \
  -e GA_MEASUREMENT_ID="${GA_MEASUREMENT_ID:-}" \
  -l traefik.docker.network=coolify \
  -l traefik.enable=true \
  -l traefik.http.middlewares.postdrop-gzip.compress=true \
  -l traefik.http.middlewares.postdrop-redirect.redirectscheme.scheme=https \
  -l traefik.http.middlewares.postdrop-redirect.redirectscheme.permanent=true \
  -l "traefik.http.middlewares.postdrop-www.redirectregex.regex=^https://www\\.thepostdrop\\.dev/(.*)" \
  -l "traefik.http.middlewares.postdrop-www.redirectregex.replacement=https://thepostdrop.dev/\$1" \
  -l traefik.http.middlewares.postdrop-www.redirectregex.permanent=true \
  -l traefik.http.routers.postdrop-http.entrypoints=http \
  -l traefik.http.routers.postdrop-http.middlewares=postdrop-redirect \
  -l "traefik.http.routers.postdrop-http.rule=Host(\`thepostdrop.dev\`) || Host(\`www.thepostdrop.dev\`)" \
  -l traefik.http.routers.postdrop-http.service=postdrop-web-svc \
  -l traefik.http.routers.postdrop-https.entrypoints=https \
  -l traefik.http.routers.postdrop-https.middlewares=postdrop-gzip,postdrop-www \
  -l "traefik.http.routers.postdrop-https.rule=Host(\`thepostdrop.dev\`) || Host(\`www.thepostdrop.dev\`)" \
  -l traefik.http.routers.postdrop-https.service=postdrop-web-svc \
  -l traefik.http.routers.postdrop-https.tls=true \
  -l traefik.http.routers.postdrop-https.tls.certresolver=letsencrypt \
  -l traefik.http.services.postdrop-web-svc.loadbalancer.server.port=3000 \
  postdrop-web:local

echo "== wait for listen"
for i in $(seq 1 24); do
  H=$(docker exec postdrop-web wget -qO- http://127.0.0.1:3000/login 2>/dev/null | head -c 60 || true)
  [ -n "$H" ] && echo "up: $H" && break
  sleep 5
done
[ -z "${H:-}" ] && { echo "web never answered"; docker logs --tail 30 postdrop-web; exit 9; }

echo "== via traefik (host loopback, SNI thepostdrop.dev)"
curl -sk --resolve thepostdrop.dev:443:127.0.0.1 -o /dev/null -w "login: %{http_code}\n" "https://thepostdrop.dev/login"
curl -sk --resolve thepostdrop.dev:443:127.0.0.1 -o /dev/null -w "me(unauth): %{http_code}\n" "https://thepostdrop.dev/v1/me"
echo "== done"
