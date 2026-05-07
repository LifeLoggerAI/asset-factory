import { createHash } from 'node:crypto';
import type { GenerateRequest } from './assetFactoryValidation';
import { resolveAssetType } from './assetTypeCatalog';
import { renderWithConfiguredProvider } from './assetProviderRuntime';

type AssetSize = {
  width?: number;
  height?: number;
};

type RendererMode = 'svg-proof' | 'spatial-renderer' | 'audio-renderer' | 'manifest-only';

function escapeSvgText(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function finiteDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function colorFromHash(hash: string, offset = 0) {
  const start = (offset * 6) % Math.max(hash.length - 6, 1);
  return `#${hash.slice(start, start + 6).padEnd(6, '0')}`;
}

function buildManifest(input: GenerateRequest & Record<string, unknown>, extra: {
  rendererMode: RendererMode;
  formats: string[];
  width: number;
  height: number;
  previewPath: string | null;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
  rendererContract?: string;
}) {
  const tenantId = input.tenantId ?? 'default';
  const definition = resolveAssetType(input.type);
  return {
    jobId: input.jobId,
    tenantId,
    type: definition.canonicalType,
    presetId: input.presetId ?? null,
    prompt: input.prompt ?? '',
    rendererMode: extra.rendererMode,
    generatedAt: new Date().toISOString(),
    formats: extra.formats,
    dimensions: { width: extra.width, height: extra.height },
    transparentBackground: Boolean(input.transparentBackground),
    storagePaths: {},
    previewPath: extra.previewPath,
    metadata: {
      ...(input.metadata ?? {}),
      ...(extra.metadata ?? {}),
      canonicalType: definition.canonicalType,
      assetFamily: definition.family,
    },
    provenance: {
      engine: 'assetfactory-studio',
      rendererContract: extra.rendererContract ?? 'deterministic-local-v1',
      inputHash: stableHash({
        prompt: input.prompt,
        type: input.type,
        presetId: input.presetId ?? null,
        format: input.format ?? null,
        variant: input.variant ?? null,
        size: input.size ?? null,
        metadata: input.metadata ?? null,
      }),
    },
    approvalStatus: 'draft',
    version: 1,
    targetModules: input.targetModule ? [String(input.targetModule)] : definition.targetModules,
    dependencies: extra.dependencies ?? [],
  };
}

function renderGraphic(input: GenerateRequest & Record<string, unknown>, width: number, height: number) {
  const hash = stableHash(input);
  const background = input.transparentBackground ? 'transparent' : colorFromHash(hash, 0);
  const accent = colorFromHash(hash, 1);
  const accent2 = colorFromHash(hash, 2);
  const text = `${input.type ?? 'asset'} :: ${input.prompt ?? 'no-prompt'}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Generated graphic proof for ${escapeSvgText(input.jobId)}">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${background}"/><stop offset="100%" stop-color="#101828"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.24)}" r="${Math.round(Math.min(width, height) * 0.16)}" fill="${accent}" opacity="0.65"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.62)}" width="${Math.round(width * 0.76)}" height="${Math.round(height * 0.16)}" rx="28" fill="${accent2}" opacity="0.5"/>
  <text x="40" y="90" fill="#e0f2fe" font-size="42" font-family="Inter, Arial, sans-serif">${escapeSvgText(input.jobId)}</text>
  <text x="40" y="150" fill="#f8fafc" font-size="28" font-family="Inter, Arial, sans-serif">${escapeSvgText(text)}</text>
  <text x="40" y="${height - 56}" fill="#bae6fd" font-size="22" font-family="Inter, Arial, sans-serif">renderer: graphic deterministic proof</text>
</svg>`;
  return Buffer.from(svg);
}

function renderModel(input: GenerateRequest & Record<string, unknown>) {
  const hash = stableHash(input);
  const color = colorFromHash(hash, 1);
  const gltf = {
    asset: { version: '2.0', generator: 'assetfactory-studio deterministic spatial-renderer' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: String(input.jobId) }],
    meshes: [{ name: `${input.type}-proof-mesh`, primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{
      name: 'hash-derived-material',
      pbrMetallicRoughness: {
        baseColorFactor: [parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255, 1],
        metallicFactor: 0.1,
        roughnessFactor: 0.75,
      },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    buffers: [{ byteLength: 42, uri: 'data:application/octet-stream;base64,AAAAvwAAAAAAAAAAAAAAAD8AAAAAAAAAAAAAAAC/AAAAAAAAgD8AAAAAPwAAAAAAAAABAAIA' }],
    extras: { prompt: input.prompt, deterministicSeed: hash, note: 'Proof GLTF; replace adapter with provider-backed mesh generation for production.' },
  };
  return Buffer.from(JSON.stringify(gltf, null, 2));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function renderAudio(input: GenerateRequest & Record<string, unknown>, sampleRate: number, durationSeconds: number) {
  const hash = stableHash(input);
  const frequency = 220 + (parseInt(hash.slice(0, 4), 16) % 660);
  const samples = Math.max(1, Math.round(sampleRate * durationSeconds));
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / (sampleRate * 0.05), (samples - index) / (sampleRate * 0.08));
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * envelope * 0.35;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return { buffer, frequency };
}

function renderBundle(input: GenerateRequest & Record<string, unknown>) {
  const metadata = input.metadata as Record<string, unknown> | undefined;
  const assets = Array.isArray(metadata?.assets) ? metadata.assets : [];
  const payload = { jobId: input.jobId, tenantId: input.tenantId ?? 'default', prompt: input.prompt, type: input.type, bundleVersion: 1, assets, instructions: 'Bundle proof manifest. Add generated child assets to metadata.assets for full packaging.' };
  return Buffer.from(JSON.stringify(payload, null, 2));
}

export async function renderAsset(input: GenerateRequest & Record<string, unknown>) {
  const definition = resolveAssetType(input.type);
  const size = (input.size as AssetSize | undefined) ?? {};
  const width = finiteDimension(size.width, definition.defaultSize?.width ?? 1440);
  const height = finiteDimension(size.height, definition.defaultSize?.height ?? 1440);
  const format = String(input.format ?? definition.defaultFormat).toLowerCase();
  const providerResult = await renderWithConfiguredProvider(input, definition);

  if (providerResult) {
    const assetFileName = `${input.jobId}.${providerResult.extension}`;
    const manifest = buildManifest(input, {
      rendererMode: definition.rendererMode,
      formats: [providerResult.extension, 'json'],
      width: definition.canonicalType === 'audio' || definition.canonicalType === 'bundle' ? 0 : width,
      height: definition.canonicalType === 'audio' || definition.canonicalType === 'bundle' ? 0 : height,
      previewPath: null,
      metadata: { format: providerResult.extension, providerBacked: true, ...providerResult.metadata },
      rendererContract: 'provider-backed-v1',
    });
    return { ok: true as const, assetBuffer: providerResult.assetBuffer, assetMimeType: providerResult.assetMimeType, assetFileName, manifest, mode: definition.rendererMode };
  }

  const assetFileName = `${input.jobId}.${definition.extension}`;

  if (definition.canonicalType === 'model3d') {
    const manifest = buildManifest(input, { rendererMode: definition.rendererMode, formats: definition.formats, width, height, previewPath: null, metadata: { format, spatial: { coordinateSystem: 'right-handed-y-up', unit: 'meter' } } });
    return { ok: true as const, assetBuffer: renderModel(input), assetMimeType: definition.mimeType, assetFileName, manifest, mode: definition.rendererMode };
  }

  if (definition.canonicalType === 'audio') {
    const sampleRate = Number((input.metadata as Record<string, unknown> | undefined)?.sampleRate ?? definition.defaultSampleRate ?? 22050);
    const durationSeconds = Number((input.metadata as Record<string, unknown> | undefined)?.durationSeconds ?? definition.defaultDurationSeconds ?? 2);
    const rendered = renderAudio(input, sampleRate, durationSeconds);
    const manifest = buildManifest(input, { rendererMode: definition.rendererMode, formats: definition.formats, width: 0, height: 0, previewPath: null, metadata: { format, audio: { sampleRate, channels: 1, durationSeconds, proofToneHz: rendered.frequency } } });
    return { ok: true as const, assetBuffer: rendered.buffer, assetMimeType: definition.mimeType, assetFileName, manifest, mode: definition.rendererMode };
  }

  if (definition.canonicalType === 'bundle') {
    const manifest = buildManifest(input, { rendererMode: definition.rendererMode, formats: definition.formats, width: 0, height: 0, previewPath: null, metadata: { format, bundle: true } });
    return { ok: true as const, assetBuffer: renderBundle(input), assetMimeType: definition.mimeType, assetFileName, manifest, mode: definition.rendererMode };
  }

  const manifest = buildManifest(input, { rendererMode: definition.rendererMode, formats: definition.formats, width, height, previewPath: null, metadata: { format } });
  return { ok: true as const, assetBuffer: renderGraphic(input, width, height), assetMimeType: definition.mimeType, assetFileName, manifest, mode: definition.rendererMode };
}
