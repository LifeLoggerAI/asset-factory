#!/usr/bin/env bash

set -e

API_KEY="${ASSET_FACTORY_API_KEY}"
BASE_URL="http://localhost:8080"
TEST_TOPIC="Determinism Test Topic"

echo "🧪 Starting Determinism Test..."

# Run job 1
JOB1=$(curl -s -X POST "$BASE_URL/v1/jobs" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"topic\":\"$TEST_TOPIC\"}" | jq -r '.jobId')

echo "Job 1: $JOB1"

# Run job 2
JOB2=$(curl -s -X POST "$BASE_URL/v1/jobs" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"topic\":\"$TEST_TOPIC\"}" | jq -r '.jobId')

echo "Job 2: $JOB2"

echo "⏳ Waiting for completion..."

wait_for_completion() {
  JOB=$1
  while true; do
    STATUS=$(curl -s "$BASE_URL/v1/jobs/$JOB" -H "X-API-Key: $API_KEY" | jq -r '.status')
    if [[ "$STATUS" == "completed" ]]; then
      break
    fi
    sleep 1
  done
}

wait_for_completion $JOB1
wait_for_completion $JOB2

echo "⬇ Downloading bundles..."

curl -s "$BASE_URL/v1/jobs/$JOB1/download" -H "X-API-Key: $API_KEY" -o bundle1.zip
curl -s "$BASE_URL/v1/jobs/$JOB2/download" -H "X-API-Key: $API_KEY" -o bundle2.zip

HASH1=$(sha256sum bundle1.zip | awk '{print $1}')
HASH2=$(sha256sum bundle2.zip | awk '{print $1}')

echo "Bundle 1 Hash: $HASH1"
echo "Bundle 2 Hash: $HASH2"

if [[ "$HASH1" == "$HASH2" ]]; then
  echo "✅ Deterministic: PASS"
else
  echo "❌ Deterministic: FAIL"
  exit 1
fi
