import type { AssetRendererInput, AssetRendererResult, CanonicalAssetType } from './assetFactoryTypes';

export type AssetProviderName =
  | 'local-proof'
  | 'openai'
  | 'replicate'
  | 'fal'
  | 'elevenlabs'
  | 'stability'
  | 'runway'
  | 'meshy';

export type AssetProviderAdapter = {
  name: AssetProviderName;
  supportedTypes: CanonicalAssetType[];
  configured: boolean;
  missingEnv: string[];
  notes: string;
  render?: (input: AssetRendererInput) => Promise<AssetRendererResult>;
};

export const assetProviderNames: AssetProviderName[] = [
  'local-proof',
  'openai',
  'replicate',
  'fal',
  'elevenlabs',
  'stability',
  'runway',
  'meshy',
];

const providerEnv: Record<Exclude<AssetProviderName, 'local-proof'>, string[]> = {
  openai: ['OPENAI_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  fal: ['FAL_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  stability: ['STABILITY_API_KEY'],
  runway: ['RUNWAYML_API_SECRET|RUNWAY_API_KEY'],
  meshy: ['MESHY_API_KEY'],
};

function missingEnv(required: string[]) {
  return required.filter((key) => {
    if (!key.includes('|')) return !process.env[key];
    return !key.split('|').some((candidate) => process.env[candidate]);
  });
}

export function isAssetProviderName(value: unknown): value is AssetProviderName {
  return assetProviderNames.includes(String(value ?? '').trim().toLowerCase() as AssetProviderName);
}

export function configuredProviderName(): AssetProviderName {
  const value = String(process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof').trim().toLowerCase();
  if (!isAssetProviderName(value)) {
    throw new Error(`Invalid ASSET_FACTORY_MEDIA_PROVIDER provider: ${value}`);
  }
  return value;
}

export function getProviderAdapters(): AssetProviderAdapter[] {
  return [
    {
      name: 'local-proof',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video', 'bundle'],
      configured: true,
      missingEnv: [],
      notes: 'Deterministic local proof renderer. Video proof is manifest-only unless a paid provider is explicitly configured.',
    },
    {
      name: 'openai',
      supportedTypes: ['graphic', 'audio'],
      configured: missingEnv(providerEnv.openai).length === 0,
      missingEnv: missingEnv(providerEnv.openai),
      notes: 'Primary governed image lane plus optional speech fallback when explicitly selected.',
    },
    {
      name: 'replicate',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video'],
      configured: missingEnv(providerEnv.replicate).length === 0,
      missingEnv: missingEnv(providerEnv.replicate),
      notes: 'Fallback/model-laboratory adapter. Request-level model overrides remain fail-closed by default.',
    },
    {
      name: 'fal',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video'],
      configured: missingEnv(providerEnv.fal).length === 0,
      missingEnv: missingEnv(providerEnv.fal),
      notes: 'Low-latency fallback media adapter with server-approved model routing.',
    },
    {
      name: 'elevenlabs',
      supportedTypes: ['audio'],
      configured: missingEnv(providerEnv.elevenlabs).length === 0,
      missingEnv: missingEnv(providerEnv.elevenlabs),
      notes: 'Primary governed speech, sound-effects, and music generation lane. Voice identity must be explicitly configured.',
    },
    {
      name: 'stability',
      supportedTypes: ['graphic'],
      configured: missingEnv(providerEnv.stability).length === 0,
      missingEnv: missingEnv(providerEnv.stability),
      notes: 'Optional/fallback image and texture lane.',
    },
    {
      name: 'runway',
      supportedTypes: ['video'],
      configured: missingEnv(providerEnv.runway).length === 0,
      missingEnv: missingEnv(providerEnv.runway),
      notes: 'Primary governed moving-picture lane. Runtime remains no-spend until ASSET_FACTORY_VIDEO_PROVIDER=runway.',
    },
    {
      name: 'meshy',
      supportedTypes: ['model3d'],
      configured: missingEnv(providerEnv.meshy).length === 0,
      missingEnv: missingEnv(providerEnv.meshy),
      notes: 'Primary AI 3D candidate lane for text/image/multi-image to GLB. Generated candidates still require QA and promotion.',
    },
  ];
}

export function getConfiguredProviderAdapter() {
  const providerName = configuredProviderName();
  return getProviderAdapters().find((adapter) => adapter.name === providerName) ?? getProviderAdapters()[0];
}

export function getProviderDiagnostics() {
  const selected = getConfiguredProviderAdapter();
  return {
    selected: selected.name,
    selectedConfigured: selected.configured,
    selectedMissingEnv: selected.missingEnv,
    adapters: getProviderAdapters().map(({ name, supportedTypes, configured, missingEnv, notes }) => ({
      name,
      supportedTypes,
      configured,
      missingEnv,
      notes,
    })),
  };
}
