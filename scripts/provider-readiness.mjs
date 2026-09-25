#!/usr/bin/env node
import process from 'node:process';
import { providerSupportsModality } from '../assetfactory-studio/lib/server/assetProviderCapabilities.mjs';

const strict = process.env.URAI_PROVIDER_STRICT === 'true';
const spendAuthorized = process.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED === 'true';

const modalityRouting = {
  image: process.env.ASSET_FACTORY_IMAGE_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
  model3d: process.env.ASSET_FACTORY_MODEL3D_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
  audio: process.env.ASSET_FACTORY_AUDIO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
  sfx: process.env.ASSET_FACTORY_SFX_PROVIDER || process.env.ASSET_FACTORY_AUDIO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
  music: process.env.ASSET_FACTORY_MUSIC_PROVIDER || process.env.ASSET_FACTORY_AUDIO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
  stt: process.env.ASSET_FACTORY_STT_PROVIDER || 'local-proof',
  video: process.env.ASSET_FACTORY_VIDEO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
};

const credentialEnv = {
  openai: ['OPENAI_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  fal: ['FAL_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  stability: ['STABILITY_API_KEY'],
  runway: ['RUNWAYML_API_SECRET', 'RUNWAY_API_KEY'],
  meshy: ['MESHY_API_KEY'],
};

function configured(name) {
  return Boolean(process.env[name]);
}

function credentialConfigured(provider) {
  const names = credentialEnv[provider] ?? [];
  return names.some(configured);
}

function dedicatedProductionTargetStatus() {
  const projectId = process.env.ASSET_FACTORY_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '';
  const hostingSite = process.env.ASSET_FACTORY_FIREBASE_HOSTING_SITE || '';
  const baseUrl = process.env.ASSET_FACTORY_BASE_URL || '';
  const historical = new Set(['urai-4dc1d', 'asset-factory-dev-id']);
  const blockers = [];
  if (!projectId || historical.has(projectId)) blockers.push('dedicated-production-target-not-configured');
  if (!hostingSite || !baseUrl) blockers.push('dedicated-production-target-not-configured');
  return {
    configured: blockers.length === 0,
    projectConfigured: Boolean(projectId) && !historical.has(projectId),
    hostingSiteConfigured: Boolean(hostingSite),
    baseUrlConfigured: Boolean(baseUrl),
    blockers: [...new Set(blockers)],
  };
}

function wifStatus() {
  const provider = process.env.GCP_WIF_PROVIDER || '';
  const serviceAccount = process.env.GCP_DEPLOY_SERVICE_ACCOUNT || '';
  const historicalProvider = provider.startsWith('projects/952723774155/');
  const historicalServiceAccount = serviceAccount === 'asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com';
  const blockers = [];
  if (!provider || !serviceAccount || historicalProvider || historicalServiceAccount) blockers.push('wif-not-configured');
  return {
    configured: blockers.length === 0,
    providerConfigured: Boolean(provider) && !historicalProvider,
    serviceAccountConfigured: Boolean(serviceAccount) && !historicalServiceAccount,
    blockers,
  };
}

function liveSmokeStatus() {
  const certified = process.env.ASSET_FACTORY_PROVIDER_LIVE_SMOKE_CERTIFIED === 'true';
  return {
    certified,
    blockers: certified ? [] : ['provider-live-smoke-not-certified'],
  };
}

function statusFor(modality, provider) {
  const blockers = [];
  if (provider === 'local-proof') {
    blockers.push('external-provider-not-selected');
    return { provider, external: false, ready: false, blockers };
  }
  if (!credentialEnv[provider]) {
    blockers.push('unsupported-provider-selection');
    return { provider, external: true, ready: false, blockers };
  }
  if (!providerSupportsModality(provider, modality)) {
    blockers.push('unsupported-provider-modality');
    return { provider, external: true, ready: false, blockers };
  }
  if (!credentialConfigured(provider)) blockers.push('provider-credential-not-configured');

  if (provider === 'openai') {
    if (modality === 'image' && !configured('ASSET_FACTORY_OPENAI_IMAGE_MODEL')) blockers.push('provider-model-not-configured');
    if (modality === 'audio') {
      if (!configured('ASSET_FACTORY_OPENAI_SPEECH_MODEL')) blockers.push('provider-model-not-configured');
      if (!configured('ASSET_FACTORY_OPENAI_VOICE')) blockers.push('approved-voice-not-configured');
    }
  }

  if (provider === 'elevenlabs') {
    if (modality === 'audio') {
      if (!configured('ASSET_FACTORY_ELEVENLABS_SPEECH_MODEL')) blockers.push('provider-model-not-configured');
      if (!configured('ELEVENLABS_VOICE_ID')) blockers.push('approved-voice-not-configured');
    }
    if (modality === 'sfx' && !configured('ASSET_FACTORY_ELEVENLABS_SFX_MODEL')) blockers.push('provider-model-not-configured');
    if (modality === 'music' && !configured('ASSET_FACTORY_ELEVENLABS_MUSIC_MODEL')) blockers.push('provider-model-not-configured');
    if (modality === 'stt' && !configured('ASSET_FACTORY_ELEVENLABS_STT_MODEL')) blockers.push('provider-model-not-configured');
  }

  if (provider === 'meshy' && modality === 'model3d' && !configured('ASSET_FACTORY_MESHY_MODEL')) blockers.push('provider-model-not-configured');
  if (provider === 'stability' && modality === 'image' && !configured('ASSET_FACTORY_STABILITY_IMAGE_SERVICE')) blockers.push('provider-model-not-configured');

  if (provider === 'runway' && modality === 'video') {
    if (!configured('ASSET_FACTORY_RUNWAY_VIDEO_MODEL')) blockers.push('provider-model-not-configured');
    if (process.env.ASSET_FACTORY_RUNWAY_VIDEO_ACCOUNT_READY !== 'true') blockers.push('provider-account-capability-not-certified');
  }

  if (provider === 'replicate') {
    if (modality === 'image' && !(configured('ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL') || configured('ASSET_FACTORY_GRAPHICS_MODEL'))) blockers.push('provider-model-not-configured');
    if (modality === 'model3d' && !(configured('ASSET_FACTORY_REPLICATE_MODEL3D_MODEL') || configured('ASSET_FACTORY_MODEL3D_MODEL'))) blockers.push('provider-model-not-configured');
    if (modality === 'audio') {
      if (!(configured('ASSET_FACTORY_REPLICATE_SPEECH_MODEL') || configured('ASSET_FACTORY_REPLICATE_AUDIO_MODEL') || configured('ASSET_FACTORY_AUDIO_MODEL'))) blockers.push('provider-model-not-configured');
      if (configured('ASSET_FACTORY_REPLICATE_SPEECH_MODEL') && !configured('ASSET_FACTORY_REPLICATE_SPEECH_VOICE')) blockers.push('approved-voice-not-configured');
    }
    if ((modality === 'sfx' || modality === 'music') && !(configured('ASSET_FACTORY_REPLICATE_AUDIO_MODEL') || configured('ASSET_FACTORY_AUDIO_MODEL'))) blockers.push('provider-model-not-configured');
    if (modality === 'video' && !configured('ASSET_FACTORY_REPLICATE_VIDEO_MODEL')) blockers.push('provider-model-not-configured');
  }

  if (provider === 'fal') {
    if (modality === 'image' && !configured('ASSET_FACTORY_GRAPHICS_MODEL')) blockers.push('provider-model-not-configured');
    if (modality === 'model3d' && !configured('ASSET_FACTORY_MODEL3D_MODEL')) blockers.push('provider-model-not-configured');
    if ((modality === 'audio' || modality === 'sfx' || modality === 'music') && !configured('ASSET_FACTORY_AUDIO_MODEL')) blockers.push('provider-model-not-configured');
    if (modality === 'video' && !configured('ASSET_FACTORY_FAL_VIDEO_MODEL')) blockers.push('provider-endpoint-not-configured');
  }

  if (!spendAuthorized) blockers.push('provider-spend-not-authorized');
  return { provider, external: true, ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

const modalityReadiness = Object.fromEntries(
  Object.entries(modalityRouting).map(([modality, provider]) => [modality, statusFor(modality, provider)])
);

const providerCredentials = Object.fromEntries(
  Object.entries(credentialEnv).map(([provider, names]) => [
    provider,
    {
      configured: names.some(configured),
      acceptedEnvironmentNames: names,
      missingEnvironmentNames: names.some(configured) ? [] : names,
    },
  ])
);

const operationalDependencies = [
  { name: 'Firebase project', environment: ['FIREBASE_PROJECT_ID'], requiredFor: ['hosting deploy', 'functions deploy', 'storage export'] },
  { name: 'Spatial asset publish target', environment: ['URAI_SPATIAL_ASSET_BASE_URL'], requiredFor: ['copying governed assets into UrAi Spatial'] },
  { name: 'Studio callback', environment: ['URAI_STUDIO_BASE_URL'], requiredFor: ['Studio render handoff and completion callbacks'] },
].map((dependency) => {
  const missingEnvironmentNames = dependency.environment.filter((name) => !configured(name));
  return { ...dependency, configured: missingEnvironmentNames.length === 0, missingEnvironmentNames };
});

const notReady = Object.entries(modalityReadiness)
  .filter(([, status]) => !status.ready)
  .map(([modality, status]) => ({ modality, ...status }));

const deploymentReadiness = {
  dedicatedProductionTarget: dedicatedProductionTargetStatus(),
  wif: wifStatus(),
  providerLiveSmoke: liveSmokeStatus(),
};

const deploymentBlockers = [
  ...deploymentReadiness.dedicatedProductionTarget.blockers,
  ...deploymentReadiness.wif.blockers,
  ...deploymentReadiness.providerLiveSmoke.blockers,
];

const payload = {
  schemaVersion: 'urai-provider-readiness-v3',
  checkedAt: new Date().toISOString(),
  strict,
  spendAuthorized,
  modalityRouting,
  modalityReadiness,
  providerCredentials,
  operationalDependencies,
  deploymentReadiness,
  ready: Object.entries(modalityReadiness).filter(([, status]) => status.ready).map(([modality]) => modality),
  blocked: strict ? [...notReady, ...deploymentBlockers.map((blocker) => ({ blocker }))] : [],
  notConfigured: strict ? [] : [...notReady, ...deploymentBlockers.map((blocker) => ({ blocker }))],
};

console.log(JSON.stringify(payload, null, 2));

if (strict && (
  notReady.length > 0 ||
  operationalDependencies.some((dependency) => !dependency.configured) ||
  deploymentBlockers.length > 0
)) {
  console.error('Asset Factory provider readiness failed in strict mode. External provider activation remains fail-closed until every selected route, operational dependency, dedicated production target, WIF identity, and retained live-smoke receipt is explicitly configured.');
  process.exit(1);
}
