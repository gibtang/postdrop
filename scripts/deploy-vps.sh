#!/bin/bash
# Postdrop deploy on VPS. Run: bash /home/ubuntu/postdrop/deploy.sh
# Prereqs (created by mac-side rsync): /home/ubuntu/postdrop/src (source), /home/ubuntu/postdrop/secrets-b2.env
set -euo pipefail
BASE=/home/ubuntu/postdrop
cd "$BASE"

echo "== building image"
docker build -t postdrop-web:local src

echo "== secrets"
if [ ! -f secrets.env ]; then
  MONGO_PW=$(openssl rand -hex 16)
  AUTH_SEC=$(openssl rand -base64 32)
  cat > secrets.env <<EOF
MONGO_PASSWORD=$MONGO_PW
AUTH_SECRET=$AUTH_SEC
# Google OAuth client (console.cloud.google.com → OAuth client); required for login
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
  chmod 600 secrets.env
fi
source secrets.env
source secrets-b2.env

echo "== compose file"
cat > docker-compose.yml <<EOF
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      - MONGO_INITDB_ROOT_USERNAME=postdrop
      - MONGO_INITDB_ROOT_PASSWORD=$MONGO_PASSWORD
    volumes:
      - postdrop-mongo-data:/data/db
  web:
    image: postdrop-web:local
    restart: unless-stopped
    depends_on:
      - mongo
    environment:
      - BASE_URL=https://thepostdrop.dev
      - AUTH_SECRET=$AUTH_SECRET
      - AUTH_TRUST_HOST=true
      - GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
      - GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
      - MONGODB_URI=mongodb://postdrop:$MONGO_PASSWORD@mongo:27017/postdrop?authSource=admin
      - STORAGE_DRIVER=s3
      - S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
      - S3_REGION=us-east-005
      - S3_BUCKET=$S3_BUCKET
      - S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
      - S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY
      - RESEND_API_KEY=$RESEND_API_KEY
      - RESEND_FROM=$RESEND_FROM
    networks:
      - default
      - coolify
    labels:
      - traefik.docker.network=coolify
      - traefik.enable=true
      - traefik.http.middlewares.postdrop-gzip.compress=true
      - traefik.http.middlewares.postdrop-redirect.redirectscheme.scheme=https
      - traefik.http.routers.postdrop-http.entrypoints=http
      - traefik.http.routers.postdrop-http.middlewares=postdrop-redirect
      - traefik.http.routers.postdrop-http.rule=Host(\`thepostdrop.dev\`) || Host(\`www.thepostdrop.dev\`)
      - traefik.http.routers.postdrop-http.service=postdrop-web-svc
      - traefik.http.routers.postdrop-https.entrypoints=https
      - traefik.http.routers.postdrop-https.middlewares=postdrop-gzip
      - traefik.http.routers.postdrop-https.rule=Host(\`thepostdrop.dev\`) || Host(\`www.thepostdrop.dev\`)
      - traefik.http.routers.postdrop-https.service=postdrop-web-svc
      - traefik.http.routers.postdrop-https.tls=true
      - traefik.http.routers.postdrop-https.tls.certresolver=letsencrypt
      - traefik.http.services.postdrop-web-svc.loadbalancer.server.port=3000
volumes:
  postdrop-mongo-data:
networks:
  coolify:
    external: true
EOF

echo "== coolify resources"
T=$(cat /home/ubuntu/.pd-coolify-token)
API=http://localhost:8000/api/v1
PROJ_UUID=$(curl -s -H "Authorization: Bearer $T" "$API/projects" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const p=j.find(x=>x.name==='postdrop');if(p){console.log(p.uuid)}else{process.exit(7)}})" || {
  curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"name":"postdrop","description":"Standalone agent-to-human file drop"}' "$API/projects" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).uuid))"
})
echo "project: $PROJ_UUID"

APP_UUID=$(curl -s -H "Authorization: Bearer $T" "$API/applications" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const a=(j.data||j).find(x=>x.name==='postdrop');if(a){console.log(a.uuid)}else{process.exit(7)}})" || {
  node -e "
const fs=require('fs');
const payload={project_uuid:process.argv[1],server_uuid:'ldwez3etrzuvhez7v5q6l029',destination_uuid:'a62ehc5ryqtgv2ynv28y1p3h',docker_compose_raw:fs.readFileSync('$BASE/docker-compose.yml','utf8'),name:'postdrop',description:'Standalone agent-to-human file drop'};
process.stdout.write(JSON.stringify(payload));
" "$PROJ_UUID" | curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d @- "$API/applications/dockercompose" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);if(!j.uuid){console.error(JSON.stringify(j));process.exit(8)}console.log(j.uuid)})"
})
echo "app: $APP_UUID"

echo "== deploy"
curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d "{\"uuid\":\"$APP_UUID\"}" "$API/deploy" | head -c 300
echo
echo "== done"
