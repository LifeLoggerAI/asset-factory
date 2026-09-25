import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { providerSupportsModality } from '../assetfactory-studio/lib/server/assetProviderCapabilities.mjs';

const readinessScript = fileURLToPath(new URL('./provider-readiness.mjs', import.meta.url));

function readiness(overrides = {}) {
  // Deliberately do not inherit provider keys or authorization from the caller.
  const run = spawnSync(process.execPath, [readinessScript], {
    encoding: 'utf8',
    env: { ...overrides },
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('default readiness keeps every modality blocked without credentials or spend', () => {
  const report = readiness();
  assert.equal(report.spendAuthorized, false);
  assert.deepEqual(report.ready, []);
  for (const status of Object.values(report.modalityReadiness)) {
    assert.equal(status.ready, false);
    assert.deepEqual(status.blockers, ['external-provider-not-selected']);
  }
});

test('fal video readiness accepts the exact model variable required by its runtime', () => {
  const report = readiness({
    ASSET_FACTORY_VIDEO_PROVIDER: 'fal',
    ASSET_FACTORY_FAL_VIDEO_MODEL: 'fal-ai/test-only-model',
    FAL_KEY: 'synthetic-not-a-provider-credential',
    ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'true',
  });
  assert.equal(report.modalityReadiness.video.ready, true);
  // This is configuration readiness only; live smoke remains separately unproven.
  assert.equal(report.deploymentReadiness.providerLiveSmoke.certified, false);
});

test('obsolete fal endpoint variable cannot conceal a missing runtime model', () => {
  const report = readiness({
    ASSET_FACTORY_VIDEO_PROVIDER: 'fal',
    ASSET_FACTORY_FAL_VIDEO_ENDPOINT: 'https://example.invalid/not-a-model',
    FAL_KEY: 'synthetic-not-a-provider-credential',
    ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'true',
  });
  assert.equal(report.modalityReadiness.video.ready, false);
  assert.ok(report.modalityReadiness.video.blockers.includes('provider-endpoint-not-configured'));
});

test('fal model configuration still requires both credentials and spend authority', () => {
  const report = readiness({
    ASSET_FACTORY_VIDEO_PROVIDER: 'fal',
    ASSET_FACTORY_FAL_VIDEO_MODEL: 'fal-ai/test-only-model',
  });
  assert.equal(report.modalityReadiness.video.ready, false);
  assert.ok(report.modalityReadiness.video.blockers.includes('provider-credential-not-configured'));
  assert.ok(report.modalityReadiness.video.blockers.includes('provider-spend-not-authorized'));
});

test('credentials and authorization cannot enable unsupported provider modalities', () => {
  const report = readiness({
    ASSET_FACTORY_MODEL3D_PROVIDER: 'openai',
    ASSET_FACTORY_AUDIO_PROVIDER: 'meshy',
    ASSET_FACTORY_STT_PROVIDER: 'replicate',
    ASSET_FACTORY_VIDEO_PROVIDER: 'stability',
    OPENAI_API_KEY: 'synthetic', MESHY_API_KEY: 'synthetic',
    REPLICATE_API_TOKEN: 'synthetic', STABILITY_API_KEY: 'synthetic',
    ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'true',
  });
  for (const modality of ['model3d', 'audio', 'stt', 'video']) {
    assert.equal(report.modalityReadiness[modality].ready, false);
    assert.deepEqual(report.modalityReadiness[modality].blockers, ['unsupported-provider-modality']);
  }
});

test('speech-only provider cannot claim music or SFX through the audio fallback', () => {
  const report = readiness({
    ASSET_FACTORY_AUDIO_PROVIDER: 'openai',
    ASSET_FACTORY_OPENAI_SPEECH_MODEL: 'synthetic-model',
    ASSET_FACTORY_OPENAI_VOICE: 'synthetic-approved-voice',
    OPENAI_API_KEY: 'synthetic',
    ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'true',
  });
  assert.equal(report.modalityReadiness.audio.ready, true);
  for (const modality of ['music', 'sfx']) {
    assert.equal(report.modalityReadiness[modality].ready, false);
    assert.deepEqual(report.modalityReadiness[modality].blockers, ['unsupported-provider-modality']);
  }
});

test('shared capability check denies unknown and object-prototype provider names', () => {
  for (const provider of ['unknown', 'constructor', '__proto__', 'toString']) {
    assert.equal(providerSupportsModality(provider, 'image'), false);
  }
  assert.equal(providerSupportsModality('elevenlabs', 'stt'), true);
  assert.equal(providerSupportsModality('meshy', 'model3d'), true);
  assert.equal(providerSupportsModality('runway', 'video'), true);
});

test('Replicate music and SFX require an audio model independently of speech', () => {
  const variables = {
    ASSET_FACTORY_SFX_PROVIDER: 'replicate',
    ASSET_FACTORY_MUSIC_PROVIDER: 'replicate',
    ASSET_FACTORY_REPLICATE_SPEECH_MODEL: 'synthetic-speech-model',
    ASSET_FACTORY_REPLICATE_SPEECH_VOICE: 'synthetic-approved-voice',
    REPLICATE_API_TOKEN: 'synthetic',
    ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'true',
  };
  const blocked = readiness(variables);
  const configured = readiness({ ...variables, ASSET_FACTORY_REPLICATE_AUDIO_MODEL: 'synthetic-audio-model' });
  for (const modality of ['sfx', 'music']) {
    assert.equal(blocked.modalityReadiness[modality].ready, false);
    assert.ok(blocked.modalityReadiness[modality].blockers.includes('provider-model-not-configured'));
    assert.equal(configured.modalityReadiness[modality].ready, true);
  }
});
