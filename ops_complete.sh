#!/usr/bin/env bash
set -euo pipefail

echo "🔒 VERIFYING ASSET-FACTORY OPS STATUS"

firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only functions
firebase deploy --only hosting

echo "▶ Smoke test: integrity scan"
node scripts/integrity-scan.js

echo "▶ Smoke test: deterministic regen"
node scripts/determinism-test.js

echo "✅ ASSET-FACTORY IS LIVE, HEALTHY, AND SEALED"
