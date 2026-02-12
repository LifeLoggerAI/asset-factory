#!/usr/bin/env bash

set -e

BASE_URL="http://localhost:8080"
BAD_KEY="invalid_key"

echo "🔐 Testing API Key Enforcement..."

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/v1/jobs" \
  -H "X-API-Key: $BAD_KEY" \
  -H "Content-Type: application/json" \
  -d '{"topic":"test"}')

if [[ "$STATUS" == "401" || "$STATUS" == "403" ]]; then
  echo "✅ Unauthorized request blocked"
else
  echo "❌ Unauthorized request allowed"
  exit 1
fi

echo "🔎 Testing Health Endpoint..."

HEALTH=$(curl -s "$BASE_URL/health")
echo "$HEALTH"

echo "✅ Integrity baseline verified"
