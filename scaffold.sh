#!/usr/bin/env bash
set -e

echo "🚀 ASSET FACTORY ENTERPRISE SCAFFOLD STARTING..."

# Ensure firebase functions exists
mkdir -p functions/src
mkdir -p functions/src/core
mkdir -p functions/src/middleware
mkdir -p functions/src/schema
mkdir -p functions/src/config
mkdir -p functions/src/routes

########################################
# 1️⃣ PIPELINE VERSION CONFIG
########################################

cat > functions/src/config/pipeline.ts <<'EOF'
export const ACTIVE_PIPELINE_VERSION = "1.0.0";
EOF

########################################
# 2️⃣ INPUT SCHEMA V1
########################################

cat > functions/src/schema/inputV1.ts <<'EOF'
export interface AssetFactoryInputV1 {
  storyStructure: "problem_solution" | "hero_journey" | "listicle" | "cinematic"
  audienceType: string
  tone: string
  durationSeconds: number
  platformTargets: string[]
  visualStyle: string
  voiceProfile: string
  pacing: "slow" | "medium" | "fast"
  callToAction?: string
  brandGuidelines?: {
    colors: string[]
    fonts: string[]
    logoUrl?: string
  }
}
EOF

########################################
# 3️⃣ DETERMINISM LAYER
########################################

cat > functions/src/core/determinism.ts <<'EOF'
import crypto from "crypto";

export function generateDeterministicSeed(input: any, pipelineVersion: string) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input) + pipelineVersion)
    .digest("hex");

  return {
    seed: parseInt(hash.substring(0, 8), 16),
    deterministicHash: hash
  };
}
EOF

########################################
# 4️⃣ OUTPUT HASHING
########################################

cat > functions/src/core/hashing.ts <<'EOF'
import crypto from "crypto";

export function hashBuffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function combineHashes(hashes: string[]) {
  return crypto.createHash("sha256").update(hashes.join("")).digest("hex");
}
EOF

########################################
# 5️⃣ API KEY VALIDATION
########################################

cat > functions/src/middleware/apiKey.ts <<'EOF'
import crypto from "crypto";
import * as admin from "firebase-admin";

export async function validateApiKey(key: string) {
  const hash = crypto.createHash("sha256").update(key).digest("hex");

  const snapshot = await admin.firestore()
    .collection("apiKeys")
    .where("keyHash", "==", hash)
    .where("active", "==", true)
    .get();

  if (snapshot.empty) {
    throw new Error("Invalid API Key");
  }

  return snapshot.docs[0].data();
}
EOF

########################################
# 6️⃣ ROLE-BASED ACCESS CONTROL
########################################

cat > functions/src/middleware/rbac.ts <<'EOF'
import * as admin from "firebase-admin";

export async function requireRole(projectId: string, userId: string, allowedRoles: string[]) {
  const snapshot = await admin.firestore()
    .collection("teamMembers")
    .where("projectId", "==", projectId)
    .where("userId", "==", userId)
    .get();

  if (snapshot.empty) {
    throw new Error("No project access");
  }

  const role = snapshot.docs[0].data().role;

  if (!allowedRoles.includes(role)) {
    throw new Error("Insufficient permissions");
  }
}
EOF

########################################
# 7️⃣ USAGE LOGGING
########################################

cat > functions/src/core/usage.ts <<'EOF'
import * as admin from "firebase-admin";

export async function logUsage(projectId: string, jobId: string, computeUnits: number, costEstimate: number) {
  await admin.firestore().collection("usageLogs").add({
    projectId,
    jobId,
    computeUnits,
    costEstimate,
    createdAt: new Date()
  });
}
EOF

########################################
# 8️⃣ JOB CREATION ROUTE
########################################

cat > functions/src/routes/createJob.ts <<'EOF'
import * as admin from "firebase-admin";
import { ACTIVE_PIPELINE_VERSION } from "../config/pipeline";
import { generateDeterministicSeed } from "../core/determinism";

export async function createJob(projectId: string, input: any) {
  const { seed, deterministicHash } = generateDeterministicSeed(input, ACTIVE_PIPELINE_VERSION);

  const jobRef = await admin.firestore().collection("jobs").add({
    projectId,
    inputSchemaVersion: "v1",
    pipelineVersion: ACTIVE_PIPELINE_VERSION,
    seed,
    deterministicHash,
    status: "queued",
    createdAt: new Date()
  });

  return jobRef.id;
}
EOF

########################################
# 9️⃣ FIRESTORE INDEX FILE
########################################

cat > firestore.indexes.json <<'EOF'
{
  "indexes": [
    {
      "collectionGroup": "jobs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "projectId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
EOF

########################################
# 🔟 BASIC DASHBOARD ROUTES
########################################

mkdir -p apps/web/app/dashboard
mkdir -p apps/web/app/jobs
mkdir -p apps/web/app/api-keys
mkdir -p apps/web/app/team
mkdir -p apps/web/app/billing

touch apps/web/app/dashboard/page.tsx
touch apps/web/app/jobs/page.tsx
touch apps/web/app/api-keys/page.tsx
touch apps/web/app/team/page.tsx
touch apps/web/app/billing/page.tsx

########################################

echo "✅ ASSET FACTORY ENTERPRISE SCAFFOLD COMPLETE."
echo "Next: npm run build && firebase deploy"