import type { AssetRendererInput, AssetRendererResult, CanonicalAssetType } from './assetFactoryTypes';

export type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability' | 'runway';

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
  runway: ['RUNWAY_API_KEY'],
};

function missingEnv(required: string[]) {
  return required.filter((key) => !process.env[key]);
}

export function configuredProviderName(): AssetProviderName {
  const value = String(process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof').toLowerCase();
  if (['openai', 'replicate', 'fal', 'elevenlabs', 'stability', 'runway'].includes(value)) {
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
      notes: 'Deterministic local proof renderer. Video proof is manifest-only unless a provider is configured.',
    },
    {
      name: 'openai',
      supportedTypes: ['graphic', 'audio'],
      configured: missingEnv(providerEnv.openai).length === 0,
      missingEnv: missingEnv(providerEnv.openai),
      notes: 'Production image and speech adapter when OpenAI credentials and model policy are configured.',
    },
    {
      name: 'replicate',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video'],
      configured: missingEnv(providerEnv.replicate).length === 0,
      missingEnv: missingEnv(providerEnv.replicate),
      notes: 'Live Replicate adapter including governed text/image-to-video model lanes; request-level model overrides remain fail-closed by default.',
    },
    {
      name: 'fal',
      supportedTypes: ['graphic', 'model3d', 'audio', 'video'],
      configured: missingEnv(providerEnv.fal).length === 0,
      missingEnv: missingEnv(providerEnv.fal),
      notes: 'Low-latency media adapter. Video support is exposed through the dedicated video runtime when a server-approved endpoint/model is configured.',
    },
    {
      name: 'elevenlabs',
      supportedTypes: ['audio'],
      configured: missingEnv(providerEnv.elevenlabs).length === 0,
      missingEnv: missingEnv(providerEnv.elevenlabs),
      notes: 'Provider adapter for voice/audio generation.',
    },
    {
      name: 'stability',
      supportedTypes: ['graphic'],
      configured: missingEnv(providerEnv.stability).length === 0,
      missingEnv: missingEnv(providerEnv.stability),
      notes: 'Provider adapter for image generation.',
    },
    {
      name: 'runway',
      supportedTypes: ['video'],
      configured: missingEnv(providerEnv.runway).length === 0,
      missingEnv: missingEnv(providerEnv.runway),
      notes: 'Governed video provider slot. Runtime remains disabled unless a server-approved Runway endpoint contract is explicitly configured.',
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
