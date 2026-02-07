#!/usr/bin/env bash
set -euo pipefail

echo "🚀 DEPLOYING LIFE-MAP PIPELINE v1.0.0"

# Step 1: Validate environment & select correct Firebase project
# Replace 'life-map-pipeline' with your actual Firebase project ID
PROJECT_ID="life-map-pipeline"
CURRENT_PROJECT=$(firebase use | tail -n 1 | awk -F'"' ''{print $2}'')

if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
  echo "Error: Incorrect Firebase project. Expected '$PROJECT_ID', but currently using '$CURRENT_PROJECT'."
  echo "Run 'firebase use $PROJECT_ID' to switch."
  exit 1
fi

echo "▶ Using Firebase project: $PROJECT_ID"

# Step 2: Deploy all infrastructure components
echo "▶ Deploying Firestore rules..."
firebase deploy --only firestore:rules

echo "▶ Deploying Storage rules..."
firebase deploy --only storage

echo "▶ Deploying Cloud Functions..."
firebase deploy --only functions

echo "▶ Deploying Hosting (for Ops UI)..."
firebase deploy --only hosting

# Step 3: Run critical post-deploy smoke tests
# These scripts would need to be created in your 'scripts/' directory
echo "▶ Running post-deploy smoke tests..."

# Test 1: Can we ingest a new event?
echo "  - Smoke Test: Ingesting a test event..."
node scripts/test-event-ingestion.js || { echo "❌ Ingestion test failed"; exit 1; }

# Test 2: Does the pipeline process a batch of events correctly?
echo "  - Smoke Test: Processing an event batch..."
node scripts/test-batch-processing.js || { echo "❌ Batch processing test failed"; exit 1; }

# Test 3: Can we synthesize a chapter from recent events?
echo "  - Smoke Test: Synthesizing a new chapter..."
node scripts/test-chapter-synthesis.js || { echo "❌ Chapter synthesis test failed"; exit 1; }

# Test 4: Can we run a data continuity check to find gaps?
echo "  - Smoke Test: Verifying data continuity..."
node scripts/test-continuity-check.js || { echo "❌ Continuity check failed"; exit 1; }


# Step 4: Final declaration
echo "✅ DEPLOY COMPLETE — LIFE-MAP PIPELINE v1.0.0 IS LIVE AND HEALTHY."
