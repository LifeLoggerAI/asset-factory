import type { AssetFactoryManifest } from './assetFactoryTypes';

function cleanSegment(value: unknown, fallback: string) {
  const raw = String(value || fallback).trim();
  return raw.replace(/[^a-zA-Z0-9._:-]/g, '-').replace(/-+/g, '-').slice(0, 128) || fallback;
}

export function buildArtifactStoragePaths(input: {
  tenantId: string;
  jobId: string;
  version?: number;
  fileName: string;
  manifestFile: string;
}) {
  const tenantId = cleanSegment(input.tenantId, 'default');
  const jobId = cleanSegment(input.jobId, 'job');
  const version = Math.max(1, Number(input.version || 1));
  const base = `tenants/${tenantId}/jobs/${jobId}/v${version}`;

  return {
    artifact: `${base}/${cleanSegment(input.fileName, 'artifact')}`,
    manifest: `${base}/${cleanSegment(input.manifestFile, 'manifest.json')}`,
    publishedBase: `tenants/${tenantId}/published/${jobId}/v${version}`,
  };
}

export function attachStoragePathsToManifest(
  manifest: AssetFactoryManifest,
  paths: ReturnType<typeof buildArtifactStoragePaths>
): AssetFactoryManifest {
  return {
    ...manifest,
    storagePaths: {
      ...manifest.storagePaths,
      artifact: paths.artifact,
      manifest: paths.manifest,
      publishedBase: paths.publishedBase,
    },
  };
}
