#!/bin/bash
# Postdrop: push built image to host-local registry, repoint app, redeploy.
set -euo pipefail
T=$(cat /home/ubuntu/.pd-coolify-token)
API=http://localhost:8000/api/v1
AU=$(cat /home/ubuntu/postdrop/.app-uuid 2>/dev/null || true)
if [ -z "${AU:-}" ]; then
  AU=$(curl -s -H "Authorization: Bearer $T" "$API/applications" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d);const a=(j.data||j).find(x=>x.name==='postdrop');
  if(a)console.log(a.uuid);else process.exit(6);})")
fi
echo "app: $AU"

echo "== registry"
if ! docker ps --format '{{.Names}}' | grep -q '^postdrop-registry$'; then
  docker run -d --name postdrop-registry --restart unless-stopped -p 127.0.0.1:5000:5000 registry:2
fi
docker tag postdrop-web:local localhost:5000/postdrop-web:local
docker push localhost:5000/postdrop-web:local | tail -1

echo "== repoint dockerfile"
DF=$(printf '%s' 'FROM localhost:5000/postdrop-web:local' | base64)
CODE=$(curl -s -o /tmp/patch-res.json -w '%{http_code}' -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d "{\"dockerfile\":\"$DF\"}" "$API/applications/$AU")
echo "patch: $CODE $(head -c 150 /tmp/patch-res.json)"

echo "== start"
curl -s -X POST -H "Authorization: Bearer $T" "$API/applications/$AU/start" | head -c 150; echo
echo "== wait"
for i in $(seq 1 36); do
  ST=$(curl -s -H "Authorization: Bearer $T" "$API/deployments?application_uuid=$AU" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{const j=JSON.parse(d);const x=(j.data||j)[0];console.log(x?(x.finished_at?'DONE '+x.status:'RUNNING '+x.status):'none')}catch(e){console.log('parse')}})")
  echo "t=$((i*10))s: $ST"
  case "$ST" in DONE*) break;; esac
  sleep 10
done
docker ps --format '{{.Names}} {{.Status}}' | grep -i postdrop
CN=$(docker ps --format '{{.Names}}' | grep -i postdrop | grep -v mongo | grep -v registry | head -1)
[ -n "$CN" ] && docker exec "$CN" wget -qO- http://127.0.0.1:3000/login 2>/dev/null | head -c 100; echo
