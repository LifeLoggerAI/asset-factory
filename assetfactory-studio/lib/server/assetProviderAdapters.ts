import type { AssetRendererInput, AssetRendererResult, CanonicalAssetType } from './assetFactoryTypes';

export type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';

export type AssetProviderAdapter = {
  name: AssetProviderName;
  supportedTypes: CanonicalAssetType[];
  configured: boolean;
  missingEnv: string[];
  notes: string;
  render?: (input: AssetRendererInput) => Promise<AssetRendererResult>;
};

const providerEnv: Record<Exclude<AssetProviderName, 'local-proof'>, string[]> = {
  openai: ['OPENAI_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  fal: ['FAL_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  stability: ['STABILITY_API_KEY'],
};

function missingEnv(required: string[]) {
  return required.filter((key) => !process.env[key]);
}

export function configuredProviderName(): AssetProviderName {
  const value = String(process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof').toLowerCase();
  if (['openai', 'replicate', 'fal', 'elevenlabs', 'stability'].includes(value)) {
    return value as AssetProviderName;
  }
  return 'local-proof';
}

export function getProviderAdapters(): AssetProviderAdapter[] {
  return [
    {
      name: 'local-proof',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video', 'bundle'],
      configured: true,
      missingEnv: [],
      notes: 'Deterministic local proof renderer. Video jobs produce non-production animatic artifacts for CI and contract testing.',
    },
    {
      name: 'openai',
      supportedTypes: ['graphic', 'audio'],
      configured: missingEnv(providerEnv.openai).length === 0,
      missingEnv: missingEnv(providerEnv.openai),
      notes: 'Provider adapter for supported image and audio workflows. Video is not advertised through this adapter until an implemented API contract is verified.',
    },
    {
      name: 'replicate',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video'],
      configured: missingEnv(providerEnv.replicate).length === 0,
      missingEnv: missingEnv(providerEnv.replicate),
      notes: 'Hosted model adapter. Video requires ASSET_FACTORY_VIDEO_MODEL in addition to provider credentials.',
    },
    {
      name: 'fal',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video'],
      configured: missingEnv(providerEnv.fal).length === 0,
      missingEnv: missingEnv(providerEnv.fal),
      notes: 'Low-latency media adapter. Video requires ASSET_FACTORY_VIDEO_MODEL in addition to provider credentials.',
    },
    {
      name: 'elevenlabs',
      supportedTypes: ['audio'],
      configured: missingEnv(providerEnv.elevenlabs).length === 0,
      missingEnv: missingEnv(providerEnv.elevenlabs),
      notes: 'Provider adapter for voice and audio generation.',
    },
    {
      name: 'stability',
      supportedTypes: ['graphic'],
      configured: missingEnv(providerEnv.stability).length === 0,
      missingEnv: missingEnv(providerEnv.stability),
      notes: 'Provider adapter for image generation.',
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