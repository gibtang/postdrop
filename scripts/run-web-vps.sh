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
docker build -t postdrop-web:local src > /tmp/build.log 2>&1
tail -1 /tmp/build.log

echo "== container"
docker rm -f postdrop-web >/dev/null 2>&1 || true
docker run -d --name postdrop-web --restart unless-stopped --network coolify \
  -e BASE_URL="https://thepostdrop.dev" \
  -e HOSTNAME=0.0.0.0 \
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
  -e RESEND_API_KEY="$RESEND_API_KEY" \
  -e RESEND_FROM="$RESEND_FROM" \
  -l traefik.docker.network=coolify \
  -l traefik.enable=true \
  -l traefik.http.middlewares.postdrop-gzip.compress=true \
  -l traefik.http.middlewares.postdrop-redirect.redirectscheme.scheme=https \
  -l traefik.http.routers.postdrop-http.entrypoints=http \
  -l traefik.http.routers.postdrop-http.middlewares=postdrop-redirect \
  -l "traefik.http.routers.postdrop-http.rule=Host(\`thepostdrop.dev\`) || Host(\`www.thepostdrop.dev\`)" \
  -l traefik.http.routers.postdrop-http.service=postdrop-web-svc \
  -l traefik.http.routers.postdrop-https.entrypoints=https \
  -l traefik.http.routers.postdrop-https.middlewares=postdrop-gzip \
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

echo "== cleanup broken coolify app resource"
T=$(cat /home/ubuntu/.pd-coolify-token)
AU=$(curl -s -H "Authorization: Bearer $T" "http://localhost:8000/api/v1/applications" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d);const a=(j.data||j).find(x=>x.name==='postdrop');
  if(a)console.log(a.uuid);})")
[ -n "${AU:-}" ] && curl -s -X DELETE -H "Authorization: Bearer $T" "http://localhost:8000/api/v1/applications/$AU" | head -c 100; echo
echo "== done"
