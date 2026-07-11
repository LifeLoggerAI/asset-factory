import type { CanonicalAssetType } from './assetFactoryTypes';

export type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';

export type AssetProviderAdapter = {
  name: AssetProviderName;
  supportedTypes: CanonicalAssetType[];
  configured: boolean;
  executable: boolean;
  missingEnv: string[];
  notes: string;
};

export const STUDIO_PAID_PROVIDER_RUNTIME_ENABLED = false as const;
export const STUDIO_PAID_PROVIDER_BLOCKER = 'disabled-pending-atomic-one-time-ledger' as const;

const paidProviders: AssetProviderName[] = ['openai', 'replicate', 'fal', 'elevenlabs', 'stability'];

const providerEnv: Record<Exclude<AssetProviderName, 'local-proof'>, string[]> = {
  openai: ['OPENAI_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  fal: ['FAL_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  stability: ['STABILITY_API_KEY'],
};

function value(name: string) {
  return String(process.env[name] ?? '').trim();
}

function missingEnv(required: string[]) {
  return required.filter((key) => !value(key));
}

export function requestedProviderName(): AssetProviderName {
  const requested = value('ASSET_FACTORY_MEDIA_PROVIDER').toLowerCase();
  return paidProviders.includes(requested as AssetProviderName)
    ? requested as AssetProviderName
    : 'local-proof';
}

export function getPaidProviderAuthorization() {
  const requestedProvider = requestedProviderName();
  return {
    requestedProvider,
    enableFlagRequested: value('ASSET_FACTORY_ENABLE_PAID_MEDIA') === 'true',
    approvalIdPresent: Boolean(value('ASSET_FACTORY_PAID_APPROVAL_ID')),
    maximumCostCents: Number(value('ASSET_FACTORY_PAID_MAX_COST_CENTS')) || 0,
    atomicLedgerConfigured: false,
    runtimeExecutionEnabled: STUDIO_PAID_PROVIDER_RUNTIME_ENABLED,
    authorized: false,
    executionAuthorized: false,
    blocker: STUDIO_PAID_PROVIDER_BLOCKER,
  };
}

export function assertPaidProviderRequestAuthorized(_estimatedCostCents: number): never {
  throw new Error(
    `Studio paid provider runtime is disabled until an atomic one-time authorization and consumption ledger exists (${STUDIO_PAID_PROVIDER_BLOCKER}).`
  );
}

export function configuredProviderName(): AssetProviderName {
  // The clean control-plane candidate is intentionally no-spend. Provider adapters remain
  // visible for diagnostics only; no environment variable can make them executable.
  return 'local-proof';
}

export function getProviderAdapters(): AssetProviderAdapter[] {
  const definitions: Array<[AssetProviderName, CanonicalAssetType[], string]> = [
    ['local-proof', ['graphic', 'model3d', 'audio', 'bundle'], 'Deterministic proof renderer; never a bespoke production asset.'],
    ['openai', ['graphic', 'audio'], 'Diagnostic-only adapter. Runtime execution is disabled pending an atomic one-time ledger.'],
    ['replicate', ['graphic', 'model3d', 'audio'], 'Diagnostic-only adapter. Runtime execution is disabled pending an atomic one-time ledger.'],
    ['fal', ['graphic', 'model3d', 'audio'], 'Diagnostic-only adapter. Runtime execution is disabled pending an atomic one-time ledger.'],
    ['elevenlabs', ['audio'], 'Diagnostic-only adapter. Runtime execution is disabled pending an atomic one-time ledger and consent proof.'],
    ['stability', ['graphic'], 'Diagnostic-only adapter. Runtime execution is disabled pending an atomic one-time ledger.'],
  ];

  return definitions.map(([name, supportedTypes, notes]) => {
    if (name === 'local-proof') {
      return { name, supportedTypes, configured: true, executable: true, missingEnv: [], notes };
    }
    const missing = missingEnv(providerEnv[name]);
    return {
      name,
      supportedTypes,
      configured: missing.length === 0,
      executable: false,
      missingEnv: missing,
      notes,
    };
  });
}

export function getConfiguredProviderAdapter() {
  return getProviderAdapters().find((adapter) => adapter.name === 'local-proof') ?? getProviderAdapters()[0];
}

export function getProviderDiagnostics() {
  const requested = requestedProviderName();
  const selected = getConfiguredProviderAdapter();
  const authorization = getPaidProviderAuthorization();
  return {
    requested,
    selected: selected.name,
    paidAuthorization: authorization,
    selectedConfigured: selected.configured,
    selectedExecutable: selected.executable,
    selectedMissingEnv: selected.missingEnv,
    adapters: getProviderAdapters(),
  };
}
