#!/usr/bin/env bash
set -euo pipefail

echo "🎬 DEPLOYING REPLAY-ENGINE v1.0.0"

echo "▶ Validating environment..."
# This assumes 'replay-engine' is the configured Firebase project alias
firebase use replay-engine

echo "▶ Deploying Replay Engine services..."
# Deploys all rules and functions defined in the current firebase.json
firebase deploy --only firestore,storage,functions

echo "▶ Running post-deploy smoke tests..."

echo "  - Submitting test replay job"
node replay-engine/scripts/test-submit-job.js || exit 1

echo "  - Verifying render completion"
node replay-engine/scripts/test-render-verification.js || exit 1

echo "✅ DEPLOY COMPLETE — REPLAY ENGINE HEALTHY"
