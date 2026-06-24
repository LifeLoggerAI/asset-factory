#!/usr/bin/env node

const strict = process.env.URAI_PROVIDER_STRICT === 'true';

const providers = [
  {
    name: 'Firebase project',
    env: ['FIREBASE_PROJECT_ID'],
    requiredFor: ['hosting deploy', 'functions deploy', 'storage export'],
  },
  {
    name: 'Image generation provider',
    env: ['URAI_IMAGE_PROVIDER', 'URAI_IMAGE_API_KEY'],
    requiredFor: ['provider-backed production art beyond deterministic fallback'],
  },
  {
    name: 'Spatial asset publish target',
    env: ['URAI_SPATIAL_ASSET_BASE_URL'],
    requiredFor: ['copying generated art into URAI Spatial public assets'],
  },
  {
    name: 'Studio callback',
    env: ['URAI_STUDIO_BASE_URL'],
    requiredFor: ['Studio render job handoff and completion callbacks'],
  },
];

const providersWithStatus = providers.map((provider) => {
  const missing = provider.env.filter((key) => !process.env[key]);
  return {
    ...provider,
    missing,
    status: missing.length === 0 ? 'ready' : strict ? 'blocked' : 'not-configured',
  };
});

const payload = {
  checkedAt: new Date().toISOString(),
  strict,
  providers: providersWithStatus,
  ready: providersWithStatus.filter((provider) => provider.status === 'ready').map((provider) => provider.name),
  blocked: providersWithStatus.filter((provider) => provider.status === 'blocked'),
  notConfigured: providersWithStatus.filter((provider) => provider.status === 'not-configured'),
};

console.log(JSON.stringify(payload, null, 2));

if (payload.blocked.length > 0) {
  console.error('Asset Factory provider readiness failed in strict mode. Configure missing provider environment variables or run non-strict local fallback checks.');
  process.exit(1);
}
