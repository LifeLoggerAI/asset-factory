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

export type ProviderReadinessDecision = {
  ok: boolean;
  provider: AssetProviderName;
  configured: boolean;
  missingEnv: string[];
  localProofAllowed: boolean;
  productionRequired: boolean;
  error?: string;
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

function boolEnv(name: string) {
  return process.env[name] === 'true';
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
      supportedTypes: ['graphic', 'model3d', 'audio', 'bundle'],
      configured: true,
      missingEnv: [],
      notes: 'Deterministic local proof renderer. Safe for dev, CI, demos, and provider contract testing only when local proof is explicitly allowed.',
    },
    {
      name: 'openai',
      supportedTypes: ['graphic', 'audio'],
      configured: missingEnv(providerEnv.openai).length === 0,
      missingEnv: missingEnv(providerEnv.openai),
      notes: 'Provider adapter for OpenAI image and speech generation.',
    },
    {
      name: 'replicate',
      supportedTypes: ['graphic', 'model3d', 'audio'],
      configured: missingEnv(providerEnv.replicate).length === 0,
      missingEnv: missingEnv(providerEnv.replicate),
      notes: 'Provider adapter for hosted model workflows using Replicate predictions.',
    },
    {
      name: 'fal',
      supportedTypes: ['graphic', 'model3d', 'audio'],
      configured: missingEnv(providerEnv.fal).length === 0,
      missingEnv: missingEnv(providerEnv.fal),
      notes: 'Provider adapter for low-latency media generation workflows.',
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
  ];
}

export function getConfiguredProviderAdapter() {
  const providerName = configuredProviderName();
  return getProviderAdapters().find((adapter) => adapter.name === providerName) ?? getProviderAdapters()[0];
}

export function localProofAllowed() {
  return boolEnv('ASSET_FACTORY_ALLOW_LOCAL_PROOF') || process.env.NODE_ENV !== 'production';
}

export function providerRequiredForProduction() {
  return boolEnv('ASSET_FACTORY_REQUIRE_PROVIDER_BACKED_GENERATION') || process.env.NODE_ENV === 'production';
}

export function evaluateProviderReadiness(requiredType?: CanonicalAssetType): ProviderReadinessDecision {
  const selected = getConfiguredProviderAdapter();
  const productionRequired = providerRequiredForProduction();
  const proofAllowed = localProofAllowed();

  if (selected.name === 'local-proof') {
    if (productionRequired && !proofAllowed) {
      return {
        ok: false,
        provider: selected.name,
        configured: selected.configured,
        missingEnv: [],
        localProofAllowed: proofAllowed,
        productionRequired,
        error: 'Provider-backed generation is required, but ASSET_FACTORY_MEDIA_PROVIDER is local-proof and ASSET_FACTORY_ALLOW_LOCAL_PROOF is not true.',
      };
    }
    return { ok: true, provider: selected.name, configured: true, missingEnv: [], localProofAllowed: proofAllowed, productionRequired };
  }

  if (requiredType && !selected.supportedTypes.includes(requiredType)) {
    return {
      ok: false,
      provider: selected.name,
      configured: selected.configured,
      missingEnv: selected.missingEnv,
      localProofAllowed: proofAllowed,
      productionRequired,
      error: `Configured provider ${selected.name} does not support ${requiredType}.`,
    };
  }

  if (!selected.configured) {
    return {
      ok: false,
      provider: selected.name,
      configured: false,
      missingEnv: selected.missingEnv,
      localProofAllowed: proofAllowed,
      productionRequired,
      error: `Configured provider ${selected.name} is missing required environment: ${selected.missingEnv.join(', ')}`,
    };
  }

  return { ok: true, provider: selected.name, configured: true, missingEnv: [], localProofAllowed: proofAllowed, productionRequired };
}

export function getProviderDiagnostics() {
  const selected = getConfiguredProviderAdapter();
  const readiness = evaluateProviderReadiness();
  return {
    selected: selected.name,
    selectedConfigured: selected.configured,
    selectedMissingEnv: selected.missingEnv,
    localProofAllowed: localProofAllowed(),
    productionProviderRequired: providerRequiredForProduction(),
    readiness,
    adapters: getProviderAdapters().map(({ name, supportedTypes, configured, missingEnv, notes }) => ({
      name,
      supportedTypes,
      configured,
      missingEnv,
      notes,
    })),
  };
}
