PROJECT_NAME="asset-factory"
VERSION="v1.0.0-final"
STAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
set +e

pushd life-map-pipeline/functions
pnpm install || true
pnpm build || true
popd
firebase use --add || true
firebase deploy || true

URL="https://asset-factory.web.app"
curl -s "$URL" | grep -q "Asset" || { echo "FAIL"; read; exit 1; }

cat > LOCK.md <<EOF
ASSET FACTORY LOCKED
$STAMP
EOF

git add .; git commit -m "lock(asset-factory)" || true
git tag "asset-factory-$VERSION" || true
git push --tags || true
read