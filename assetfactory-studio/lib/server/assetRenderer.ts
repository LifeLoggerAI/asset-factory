import type { GenerateRequest } from './assetFactoryValidation';

export async function renderAsset(input: GenerateRequest & Record<string, unknown>) {
  const size = (input.size as { width?: number; height?: number } | undefined) ?? {};
  const width = size.width ?? 1440;
  const height = size.height ?? 3120;
  const jobId = input.jobId;
  const tenantId = input.tenantId ?? 'default';
  const text = `${input.type ?? 'asset'} :: ${input.prompt ?? 'no-prompt'}`;
  const fill = input.transparentBackground ? 'transparent' : '#101828';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' fill='${fill}'/><text x='40' y='90' fill='#7dd3fc' font-size='42'>${jobId}</text><text x='40' y='150' fill='#e2e8f0' font-size='28'>${text}</text></svg>`;
  const assetFileName = `${jobId}.svg`;
  const manifest = {
    jobId,
    tenantId,
    type: input.type,
    presetId: input.presetId ?? null,
    prompt: input.prompt ?? '',
    rendererMode: 'svg-proof',
    generatedAt: new Date().toISOString(),
    formats: ['svg', 'json'],
    dimensions: { width, height },
    transparentBackground: Boolean(input.transparentBackground),
    storagePaths: {},
    previewPath: null,
    metadata: input.metadata ?? {},
    provenance: { engine: 'assetfactory-studio' },
    approvalStatus: 'draft',
    version: 1,
    targetModules: input.targetModule ? [String(input.targetModule)] : [],
    dependencies: [],
  };
  return { ok: true as const, assetBuffer: Buffer.from(svg), assetMimeType: 'image/svg+xml', assetFileName, manifest, mode: 'svg-proof' as const };
}
