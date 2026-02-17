
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const { buildShort, buildLong, buildThread } = require('./formats');
const { audit, log, LogLevel } = require('./logger'); // Assuming logger is available

// This version should be managed via a formal config/pipeline.json in a real system
const PIPELINE_VERSION = "v2.0.0-hardened";

function selectFormat(input) {
  // Logic to select format based on rich input, not just a simple string
  if (input.duration_seconds > 120) return buildLong(input.story_structure);
  if (input.platform_targets.includes('linkedin_video')) return buildThread(input.story_structure);
  return buildShort(input.story_structure);
}

/**
 * Generates a deterministic, auditable, and secure asset bundle.
 * @param {import('./schema').AssetFactoryInput_V1} input - The validated input schema.
 * @param {import('./schema').User} user - The user requesting the job.
 * @returns {object} The generated asset bundle with manifest.
 */
function generateBundle(input, user) {
  const generationTimestamp = new Date().toISOString();

  // 1. Create a deterministic payload. This object contains ONLY what influences the output.
  // The timestamp is EXCLUDED from this object.
  const deterministicPayload = {
    pipelineVersion: PIPELINE_VERSION,
    input, // The full, validated input schema
  };

  // 2. Generate a truly deterministic hash from the payload.
  const deterministicHash = CryptoJS.SHA256(JSON.stringify(deterministicPayload)).toString();

  // Use a portion of the hash to create a deterministic seed for the generation process.
  const seed = parseInt(deterministicHash.substring(0, 8), 16);

  log(LogLevel.INFO, 'Starting bundle generation', { userId: user.id, deterministicHash, seed });

  const preset = selectFormat(input);

  // 3. The main asset bundle now includes all necessary metadata for audit and billing.
  const bundle = {
    id: uuidv4(), // The job ID is unique, not part of the deterministic hash.
    timestamp: generationTimestamp,
    userId: user.id,
    version: PIPELINE_VERSION,
    input,
    format: preset.type,
    durationTarget: preset.durationTarget,
    hooks: preset.hooks,
    structure: preset.structure,
    // The rest of the generation logic would use the 'seed' for deterministic outputs
    thumbnail: `Cinematic lighting, bold text: "${input.call_to_action || 'URAI'}", high contrast, seed: ${seed}`,
    captions: [
      `${input.tone} content is evolving.`,
      `This changes everything.`,
      `The shift has started.`,
      `Follow for more.`
    ]
  };

  const finalManifest = {
    manifestVersion: PIPELINE_VERSION,
    generatedAt: generationTimestamp,
    deterministicHash,
    seed,
    jobId: bundle.id,
    bundle
  };

  audit({ id: bundle.id, userId: user.id }, 'BundleGenerated', { hash: deterministicHash, preset: preset.type });

  return finalManifest;
}

module.exports = { generateBundle };
