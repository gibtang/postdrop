#!/bin/bash
# Postdrop provisioning (v2) — Coolify "dockerfile" application.
# Dockerfile is a one-liner FROM postdrop-web:local (built on this host), so
# Coolify builds server-side without pulling from any registry.
set -euo pipefail
T=$(cat /home/ubuntu/.pd-coolify-token)
API=http://localhost:8000/api/v1
PROJ=m6x8uqeb70xqv0pw9tlekq6c
DEST=a62ehc5ryqtgv2ynv28y1p3h
SRV=ldwez3etrzuvhez7v5q6l029
BASE=/home/ubuntu/postdrop
set -a
source "$BASE/secrets.env"
source "$BASE/secrets-b2.env"
set +a

echo "== mongo"
if ! docker ps --format '{{.Names}}' | grep -q '^postdrop-mongo$'; then
  docker run -d --name postdrop-mongo --restart unless-stopped --network coolify \
    -v postdrop-mongo-data:/data/db \
    -e MONGO_INITDB_ROOT_USERNAME=postdrop \
    -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASSWORD" \
    mongo:7
else
  echo "mongo already running"
fi

echo "== remove previous app if any"
OLD_UUID=$(curl -s -H "Authorization: Bearer $T" "$API/applications" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d);const a=(j.data||j).find(x=>x.name==='postdrop');
  if(a){console.log(a.uuid)}
})")
if [ -n "${OLD_UUID:-}" ]; then
  echo "deleting $OLD_UUID"
  curl -s -X DELETE -H "Authorization: Bearer $T" "$API/applications/$OLD_UUID" | head -c 120; echo
  sleep 3
fi

echo "== create dockerfile app"
PAYLOAD=$(DOCKERFILE_B64=$(printf '%s' 'FROM postdrop-web:local' | base64) node -e "
const p={project_uuid:process.argv[1],environment_name:'production',server_uuid:process.argv[2],destination_uuid:process.argv[3],dockerfile:process.env.DOCKERFILE_B64,name:'postdrop',description:'Standalone agent-to-human file drop'};
process.stdout.write(JSON.stringify(p));
" "$PROJ" "$SRV" "$DEST")
APP_UUID=$(curl -s -w '\n%{http_code}' -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d "$PAYLOAD" "$API/applications/dockerfile" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const nl=d.lastIndexOf('\n');const code=d.slice(nl+1);const body=d.slice(0,nl);
  let j={};try{j=JSON.parse(body)}catch(e){console.error('HTTP '+code+' body: '+body.slice(0,200));process.exit(8)}
  if(!j.uuid){console.error('CREATE FAILED ('+code+'): '+JSON.stringify(j));process.exit(8)}
  console.log(j.uuid);
})")
echo "app: $APP_UUID"

echo "== envs"
ENVS_JSON=$(node -e "
const e={BASE_URL:'https://thepostdrop.dev',AUTH_MODE:'password',OWNER_EMAIL:'gibtang@gmail.com',OWNER_PASSWORD:process.env.OWNER_PASSWORD,SESSION_SECRET:process.env.SESSION_SECRET,MONGODB_URI:'mongodb://postdrop:'+process.env.MONGO_PASSWORD+'@postdrop-mongo:27017/postdrop?authSource=admin',STORAGE_DRIVER:'s3',S3_ENDPOINT:'https://s3.us-east-005.backblazeb2.com',S3_REGION:'us-east-005',S3_BUCKET:process.env.S3_BUCKET,S3_ACCESS_KEY_ID:process.env.S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY:process.env.S3_SECRET_ACCESS_KEY,RESEND_API_KEY:process.env.RESEND_API_KEY||'re_placeholder',RESEND_FROM:process.env.RESEND_FROM||'drops@thepostdrop.dev'};
process.stdout.write(JSON.stringify({data:Object.entries(e).map(([key,value])=>({key,value}))}));
")
curl -s -o /dev/null -w "envs: %{http_code}\n" -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d "$ENVS_JSON" "$API/applications/$APP_UUID/envs/bulk"

echo "== domains"
curl -s -o /dev/null -w "domains: %{http_code}\n" -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"domains":"https://thepostdrop.dev,https://www.thepostdrop.dev"}' "$API/applications/$APP_UUID"

echo "== start"
START=$(curl -s -X POST -H "Authorization: Bearer $T" "$API/applications/$APP_UUID/start")
echo "$START" | head -c 200; echo

echo "== wait for container"
for i in $(seq 1 24); do
  C=$(docker ps --format '{{.Names}} {{.Status}}' | grep -i "postdrop" | grep -v mongo || true)
  [ -n "$C" ] && echo "$C" && break
  sleep 5
done
[ -z "${C:-}" ] && { echo "container never appeared"; docker ps -a --format '{{.Names}} {{.Status}}' | head -20; exit 9; }

CN=$(echo "$C" | head -1 | cut -d' ' -f1)
echo "== in-container health"
docker exec "$CN" wget -qO- http://127.0.0.1:3000/login 2>/dev/null | head -c 120; echo
echo "APP_UUID=$APP_UUID" | sudo tee /home/ubuntu/postdrop/.app-uuid >/dev/null
echo "== done"
