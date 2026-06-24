#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export NEXT_TELEMETRY_DISABLED=1
export CI=1

echo "== URAI Asset Factory Cloud Shell proof =="
echo "repo: $ROOT"

echo "== disk before cleanup =="
df -h . "$HOME" || true

echo "== cleanup low-disk build/cache artifacts =="
rm -rf \
  node_modules/.cache \
  functions/node_modules/.cache functions/lib \
  life-map-pipeline/functions/node_modules/.cache life-map-pipeline/functions/lib \
  assetfactory-studio/.next assetfactory-studio/node_modules/.cache \
  image_asset_generator/output image_asset_generator/dist \
  "$HOME/.npm/_cacache" \
  "$HOME/.cache/node/corepack" \
  "$HOME/.cache/ms-playwright" \
  /tmp/next-* /tmp/playwright-* 2>/dev/null || true

npm cache clean --force || true
pnpm store prune || true

echo "== disk after cleanup =="
df -h . "$HOME" || true

echo "== provider readiness =="
node scripts/provider-readiness.mjs

echo "== image pipeline =="
npm run image:manifest
npm run image:generate
npm run image:validate
npm run image:export

echo "== Asset Factory local art proof complete =="
