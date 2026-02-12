# Readiness Checklist: urai-asset-factory

**1. Processing Determinism**

*   [x] Input sorting is used before hashing to guarantee deterministic hashes. (`life-map-pipeline/functions/src/hash.ts`)
*   [x] The `processLifeMapEvent` function in `life-map-pipeline/functions/src/index.ts` is idempotent and transactional, ensuring that each event is processed exactly once and that updates are atomic.
*   [x] No subjective data, such as sentiment analysis, is introduced into the pipeline. The data types in `life-map-pipeline/src/lib/lifemap.types.ts` are purely objective.
*   [x] All data enrichment, such as for location and weather, is deterministic and reproducible.

**2. Asset Versioning and Hashing**

*   [x] The `version` field in the `LifeMap` object is incremented atomically with every change.
*   [x] A deterministic `contentHash` of the `LifeMap` content is calculated and stored with each version to ensure integrity.
*   [x] The Replay Engine can reference a specific, immutable `lifeMapVersion` to generate a replay, guaranteeing reproducibility.

**3. Isolation from User Behavior**

*   [x] No user-facing logic is present in the pipeline.
*   [x] The pipeline is triggered by data events and does not directly interact with users.
*   [x] Input is trusted, and the system does not interpret or react to the emotional meaning of the content.

**4. Failure Handling**

*   [x] The `processLifeMapEvent` function has a robust `try...catch` block to handle processing failures.
*   [x] On failure, the `LifeMap` status is set to `'failed'`, preventing the corrupted asset from being used downstream.
*   [x] Failures are isolated and do not affect the integrity of other `LifeMap` assets or the overall replay system.

# Infra Fixes Required

*   **None.** The current infrastructure and implementation meet all requirements for a deterministic media pipeline.

# Confirmation asset outputs are safe for Replay

*   **Safe:** The asset outputs from the `urai-asset-factory` are confirmed to be safe for the Replay Engine. The combination of atomic versioning, deterministic content hashing, and robust failure handling ensures that every asset passed to the Replay Engine is reproducible, immutable, and has guaranteed integrity.
