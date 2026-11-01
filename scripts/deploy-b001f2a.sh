#!/bin/bash
# Deploy the postdrop landing/API copy fix to thepostdrop.dev
#
# WHERE TO RUN: on your Mac, from your local checkout of github.com/gibtang/postdrop.
#
# REQUIREMENTS (check these before running - not verified by this script):
#   - SSH config at ~/Dropbox/ssh/config defining host alias "vps"
#     (docs/OPERATIONS.md notes plain ubuntu@66.70.190.82 stopped resolving
#     keys mid-session, so everything below uses the config alias)
#   - VPS files /home/ubuntu/postdrop/secrets.env, secrets-b2.env and
#     run-web.sh already in place (this script never reads, prints or changes them)
#
# WHAT THIS DOES / SCOPE:
#   - Deploys exactly commit b001f2a63ff2de2d4a9b3cf2570b74bf3e72696e
#     (the reviewed, tested fix: 45/45 tests, clean build), pinned by full
#     hash - not "whatever main currently is"
#   - Exports that exact revision with git archive into a temp dir, so no
#     uncommitted changes, untracked files or local edits in your checkout
#     can leak into the deploy. Your checkout itself is left untouched
#     (no checkout, pull or reset is performed)
#   - rsyncs the export to /home/ubuntu/postdrop/src, then run-web.sh rebuilds
#     the postdrop-web image and recreates ONLY the postdrop-web container
#     (same Traefik labels/domains; postdrop-mongo and all other apps on the
#     host are untouched)
#   - Excludes local env/secret files from the sync: .env and .env.* are all
#     excluded except the tracked .env.example template; secrets*.env excluded
#   - Prints no secrets; the only value echoed is the pinned revision hash
set -euo pipefail

REV=b001f2a63ff2de2d4a9b3cf2570b74bf3e72696e
git fetch origin main
git cat-file -e "$REV^{commit}" || { echo "ABORT: commit $REV not found locally" >&2; exit 1; }
echo "deploying pinned revision: $REV"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive "$REV" | tar -x -C "$TMP"

rsync -az -e "ssh -F $HOME/Dropbox/ssh/config" \
  --exclude node_modules --exclude .git --exclude '.next' --exclude 'dist' \
  --exclude '.storage' --exclude 'tests' \
  --exclude '.env' \
  --include '.env.example' --exclude '.env.*' \
  --exclude 'secrets*.env' \
  "$TMP/" vps:/home/ubuntu/postdrop/src/

ssh -F "$HOME/Dropbox/ssh/config" vps 'bash /home/ubuntu/postdrop/run-web.sh'

# Verify: expect 1 (new homepage copy live)
curl -s https://thepostdrop.dev/ | grep -c 'Up to 5 MB per artifact'
