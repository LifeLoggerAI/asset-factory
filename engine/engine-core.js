
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const { buildShort, buildLong, buildThread } = require('./formats');
const { audit, log, LogLevel } = require('./logger');
const { createBuildManifest } = require('../lib/manifest');
const { hashFileBuffer } = require('../lib/hashing');

const PIPELINE_VERSION = "v2.0.0-hardened";

function selectFormat(input) {
  if (input.duration_seconds > 120) return buildLong(input.story_structure);
  if (input.platform_targets.includes('linkedin_video')) return buildThread(input.story_structure);
  return buildShort(input.story_structure);
}

function generateBundle(input, user) {
  const startTime = Date.now();
  const jobId = uuidv4();
  let seed = null;

  try {
    const generationTimestamp = new Date().toISOString();

    const deterministicPayload = {
      pipelineVersion: PIPELINE_VERSION,
      input,
    };

    const deterministicHash = CryptoJS.SHA256(JSON.stringify(deterministicPayload)).toString();
    seed = parseInt(deterministicHash.substring(0, 8), 16);

    log(LogLevel.INFO, 'Starting bundle generation', { jobId, ownerId: user.id, seed });

    const preset = selectFormat(input);

    const bundle = {
      id: jobId,
      timestamp: generationTimestamp,
      userId: user.id,
      version: PIPELINE_VERSION,
      input,
      format: preset.type,
      durationTarget: preset.durationTarget,
      hooks: preset.hooks,
      structure: preset.structure,
      thumbnail: `Cinematic lighting, bold text: \"${input.call_to_action || 'URAI'}\", high contrast, seed: ${seed}`,
      captions: [
        `${input.tone} content is evolving.`,
        `This changes everything.`,
        `The shift has started.`,
        `Follow for more.`
      ]
    };

    const assetPresetVersion = 'ui-kit-v1.4';
    const externalModel = 'gpt-4o-2024-05-13';
    const localModelVersion = 'asset-local-2.1.3';
    const rendererVersion = 'renderer-3.1.0';
    const videoEncoderVersion = 'ffmpeg-6.1';
    const templateEngineVersion = 'templates-4.0.2';

    const manifestData = createBuildManifest(
        bundle.id, PIPELINE_VERSION, assetPresetVersion, externalModel,
        localModelVersion, rendererVersion, videoEncoderVersion, templateEngineVersion, seed
    );

    // Phase 1 (Launch Stability) - Step 2: Store per-file hashes
    const thumbnailBuffer = Buffer.from(bundle.thumbnail, 'utf-8');
    const captionsBuffer = Buffer.from(bundle.captions.join('\n'), 'utf-8');

    const fileHashes = [
        { path: 'thumbnail.txt', sha256: hashFileBuffer(thumbnailBuffer) },
        { path: 'captions.txt', sha256: hashFileBuffer(captionsBuffer) },
    ];

    // Simple root hash for now (hash of concatenated file hashes)
    const bundleRootHash = CryptoJS.SHA256(fileHashes.map(f => f.sha256).join('')).toString();

    const finalManifest = {
      manifestVersion: PIPELINE_VERSION,
      generatedAt: generationTimestamp,
      deterministicHash,
      seed,
      jobId: bundle.id,
      buildManifest: manifestData.buildManifest,
      outputHashes: {
        files: fileHashes,
        bundleRootHash,
      },
      bundle
    };

    audit({ id: bundle.id, userId: user.id }, 'BundleGenerated', { hash: deterministicHash, preset: preset.type });

    const processingTimeMs = Date.now() - startTime;
    log(LogLevel.INFO, 'Job processing successful', {
        jobId: bundle.id, ownerId: user.id, seed, modelVersion: PIPELINE_VERSION, processingTimeMs
    });

    return finalManifest;

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    log(LogLevel.ERROR, 'Job processing failed', {
        jobId, ownerId: user.id, seed, modelVersion: PIPELINE_VERSION, processingTimeMs,
        failureReason: error.message,
    });
    
    throw error;
  }
}

module.exports = { generateBundle };
