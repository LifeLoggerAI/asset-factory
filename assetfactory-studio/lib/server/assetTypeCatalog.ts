export type AssetFamily = 'graphic' | 'model' | 'audio' | 'bundle';
export type CanonicalAssetType = 'graphic' | 'model3d' | 'audio' | 'bundle';

export type AssetTypeDefinition = {
  canonicalType: CanonicalAssetType;
  family: AssetFamily;
  aliases: string[];
  rendererMode: 'svg-proof' | 'spatial-renderer' | 'audio-renderer' | 'manifest-only';
  defaultFormat: string;
  formats: string[];
  mimeType: string;
  extension: string;
  previewExtension?: string;
  defaultSize?: { width: number; height: number };
  defaultDurationSeconds?: number;
  defaultSampleRate?: number;
  targetModules: string[];
};

const definitions: AssetTypeDefinition[] = [
  {
    canonicalType: 'graphic',
    family: 'graphic',
    aliases: ['graphic', 'graphics', 'image', 'visual', 'svg', 'png', 'webp', 'icon', 'logo', 'texture', 'body/neutral'],
    rendererMode: 'svg-proof',
    defaultFormat: 'svg',
    formats: ['svg', 'json'],
    mimeType: 'image/svg+xml',
    extension: 'svg',
    defaultSize: { width: 1440, height: 1440 },
    targetModules: ['studio-preview', 'asset-gallery', 'graphics-export'],
  },
  {
    canonicalType: 'model3d',
    family: 'model',
    aliases: ['model', 'model3d', '3d', 'mesh', 'gltf', 'glb', 'avatar', 'prop', 'environment'],
    rendererMode: 'spatial-renderer',
    defaultFormat: 'gltf',
    formats: ['gltf', 'json'],
    mimeType: 'model/gltf+json',
    extension: 'gltf',
    previewExtension: 'svg',
    defaultSize: { width: 1024, height: 1024 },
    targetModules: ['studio-preview', 'spatial-viewer', 'model-export'],
  },
  {
    canonicalType: 'audio',
    family: 'audio',
    aliases: ['audio', 'sound', 'sfx', 'music', 'voice', 'wav', 'mp3', 'ambience'],
    rendererMode: 'audio-renderer',
    defaultFormat: 'wav',
    formats: ['wav', 'json'],
    mimeType: 'audio/wav',
    extension: 'wav',
    previewExtension: 'svg',
    defaultDurationSeconds: 2,
    defaultSampleRate: 22050,
    targetModules: ['studio-preview', 'audio-player', 'sound-export'],
  },
  {
    canonicalType: 'bundle',
    family: 'bundle',
    aliases: ['bundle', 'pack', 'asset-pack', 'collection', 'manifest'],
    rendererMode: 'manifest-only',
    defaultFormat: 'json',
    formats: ['json'],
    mimeType: 'application/json',
    extension: 'json',
    targetModules: ['studio-preview', 'bundle-export'],
  },
];

const aliasMap = new Map<string, AssetTypeDefinition>();
for (const definition of definitions) {
  aliasMap.set(definition.canonicalType, definition);
  for (const alias of definition.aliases) aliasMap.set(alias.toLowerCase(), definition);
}

export function listAssetTypeDefinitions() {
  return definitions.map((definition) => ({ ...definition, aliases: [...definition.aliases], formats: [...definition.formats] }));
}

export function resolveAssetType(type: unknown): AssetTypeDefinition {
  const raw = String(type ?? 'graphic').trim().toLowerCase();
  return aliasMap.get(raw) ?? definitions[0];
}

export function isSupportedAssetType(type: unknown): boolean {
  return aliasMap.has(String(type ?? '').trim().toLowerCase());
}

export function supportedAssetTypeNames() {
  return [...new Set(definitions.flatMap((definition) => [definition.canonicalType, ...definition.aliases]))].sort();
}
