#!/usr/bin/env bash
set -euo pipefail

echo "🚀 DEPLOYING LIFE-MAP-PIPELINE v1.0.0"

echo "▶ Validating environment..."
firebase use asset-factory # Assuming a single project for all URAI components

echo "▶ Deploying Firestore rules..."
firebase deploy --only firestore:rules --config=life-map-pipeline/firebase.json

echo "▶ Deploying Storage rules..."
firebase deploy --only storage --config=life-map-pipeline/firebase.json

echo "▶ Deploying Cloud Functions..."
firebase deploy --only functions:processLifeMapEvent --config=life-map-pipeline/firebase.json

echo "▶ Running post-deploy smoke tests..."

echo "  - Verifying event ingestion trigger"
node life-map-pipeline/scripts/test-event-ingestion.js || exit 1

echo "  - Verifying Life-Map completion and versioning"
node life-map-pipeline/scripts/test-lifemap-completion.js || exit 1

echo "✅ DEPLOY COMPLETE — LIFE-MAP-PIPELINE HEALTHY"
