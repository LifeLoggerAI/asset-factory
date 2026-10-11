#!/usr/bin/env node

import { isIP } from 'node:net';

const strict = process.env.URAI_PROVIDER_STRICT === 'true';
const configuredValue = (key) => String(process.env[key] ?? '').trim();

const providers = [
  {
    name: 'Firebase project',
    env: ['FIREBASE_PROJECT_ID'],
    endpointKeys: [],
    requiredFor: ['hosting deploy', 'functions deploy', 'storage export'],
  },
  {
    name: 'Image generation provider',
    env: ['URAI_IMAGE_PROVIDER', 'URAI_IMAGE_API_KEY'],
    endpointKeys: [],
    requiredFor: ['provider-backed production art beyond deterministic fallback'],
  },
  {
    name: 'Spatial asset publish target',
    env: ['URAI_SPATIAL_ASSET_BASE_URL'],
    endpointKeys: ['URAI_SPATIAL_ASSET_BASE_URL'],
    requiredFor: ['copying generated art into URAI Spatial public assets'],
  },
  {
    name: 'Studio callback',
    env: ['URAI_STUDIO_BASE_URL'],
    endpointKeys: ['URAI_STUDIO_BASE_URL'],
    requiredFor: ['Studio render job handoff and completion callbacks'],
  },
];

function validEndpoint(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      !parsed.search && !parsed.hash && host.includes('.') && !isIP(host) &&
      !host.startsWith('[') &&
      !/(^|\.)(localhost|local|internal|invalid|test|example)$/.test(host) &&
      !/(^|\.)example\.(com|org|net)$/.test(host);
  } catch {
    return false;
  }
}

const providersWithStatus = providers.map((provider) => {
  const missing = provider.env.filter((key) => !configuredValue(key));
  const invalid = provider.endpointKeys
    .filter((key) => configuredValue(key) && !validEndpoint(configuredValue(key)))
    .map((key) => ({ key, reason: 'Public HTTPS hostname required, without inline credentials, query, or fragment.' }));
  if (provider.name === 'Firebase project') {
    const project = configuredValue('FIREBASE_PROJECT_ID');
    if (project && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
      invalid.push({ key: 'FIREBASE_PROJECT_ID', reason: 'A syntactically valid Google Cloud project ID is required; this check does not establish project authority.' });
    }
  }
  if (provider.name === 'Image generation provider') {
    const identity = configuredValue('URAI_IMAGE_PROVIDER');
    if (identity && (!/^[a-z][a-z0-9_-]{1,63}$/i.test(identity) ||
      /^(local[-_]?proof|local|offline|deterministic|mock|test|fixture|placeholder|fallback)$/i.test(identity))) {
      invalid.push({ key: 'URAI_IMAGE_PROVIDER', reason: 'A named external image provider is required; local/fallback identities do not prove provider configuration.' });
    }
  }
  const incomplete = missing.length > 0 || invalid.length > 0;
  return {
    ...provider,
    missing,
    invalid,
    status: incomplete ? strict ? 'blocked' : missing.length ? 'not-configured' : 'invalid-configuration' : 'configured',
    runtimeVerified: false,
  };
});

const payload = {
  schemaVersion: 'urai-asset-factory-provider-configuration-2',
  checkedAt: new Date().toISOString(),
  strict,
  evidenceScope: 'configuration-only',
  configurationReady: providersWithStatus.every((provider) => provider.status === 'configured'),
  providerRuntimeVerified: false,
  productionTargetVerified: false,
  releaseReady: false,
  providers: providersWithStatus,
  // Retain the legacy field without promoting untested configuration into readiness.
  ready: [],
  configured: providersWithStatus.filter((provider) => provider.status === 'configured').map((provider) => provider.name),
  blocked: providersWithStatus.filter((provider) => provider.status === 'blocked'),
  notConfigured: providersWithStatus.filter((provider) => provider.status === 'not-configured'),
  invalidConfiguration: providersWithStatus.filter((provider) => provider.status === 'invalid-configuration'),
};

console.log(JSON.stringify(payload, null, 2));

if (payload.blocked.length > 0) {
  console.error('Asset Factory provider configuration failed in strict mode. Supply the missing configuration and valid endpoints. A passing configuration check does not verify provider calls, production authority or release readiness.');
  process.exit(1);
}
