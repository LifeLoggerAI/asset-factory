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

const paidProviders: AssetProviderName[] = ['openai', 'replicate', 'fal', 'elevenlabs', 'stability'];
const MAXIMUM_POLICY_REQUEST_COST_CENTS = 34;

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

function positiveInteger(name: string) {
  const parsed = Number(value(name));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function requestedProviderName(): AssetProviderName {
  const requested = value('ASSET_FACTORY_MEDIA_PROVIDER').toLowerCase();
  return paidProviders.includes(requested as AssetProviderName)
    ? requested as AssetProviderName
    : 'local-proof';
}

export function getPaidProviderAuthorization() {
  const enabled = value('ASSET_FACTORY_ENABLE_PAID_MEDIA') === 'true';
  const approvalIdPresent = Boolean(value('ASSET_FACTORY_PAID_APPROVAL_ID'));
  const maximumCostCents = positiveInteger('ASSET_FACTORY_PAID_MAX_COST_CENTS');
  const coversMaximumPolicyRequest = maximumCostCents >= MAXIMUM_POLICY_REQUEST_COST_CENTS;
  return {
    enabled,
    approvalIdPresent,
    maximumCostCents,
    maximumPolicyRequestCostCents: MAXIMUM_POLICY_REQUEST_COST_CENTS,
    coversMaximumPolicyRequest,
    authorized: enabled && approvalIdPresent && coversMaximumPolicyRequest,
  };
}

export function assertPaidProviderRequestAuthorized(estimatedCostCents: number) {
  const authorization = getPaidProviderAuthorization();
  if (!authorization.authorized) {
    throw new Error('Paid provider execution is not authorized for the maximum permitted request cost');
  }
  if (!Number.isInteger(estimatedCostCents) || estimatedCostCents <= 0) {
    throw new Error('Paid provider request requires a positive integer estimated cost');
  }
  if (estimatedCostCents > authorization.maximumCostCents) {
    throw new Error(`Paid provider request estimate ${estimatedCostCents} cents exceeds approved ceiling ${authorization.maximumCostCents} cents`);
  }
  return authorization;
}

export function configuredProviderName(): AssetProviderName {
  const requested = requestedProviderName();
  if (requested === 'local-proof') return requested;
  return getPaidProviderAuthorization().authorized ? requested : 'local-proof';
}

export function getProviderAdapters(): AssetProviderAdapter[] {
  const authorization = getPaidProviderAuthorization();
  const definitions: Array<[AssetProviderName, CanonicalAssetType[], string]> = [
    ['local-proof', ['graphic', 'model3d', 'audio', 'bundle'], 'Deterministic proof renderer; never a bespoke production asset.'],
    ['openai', ['graphic', 'audio'], 'Executable HTTP runtime for image and speech generation.'],
    ['replicate', ['graphic', 'model3d', 'audio'], 'Executable hosted prediction runtime; model version is required per asset type.'],
    ['fal', ['graphic', 'model3d', 'audio'], 'Executable hosted model runtime; model identifier is required per asset type.'],
    ['elevenlabs', ['audio'], 'Executable text-to-speech runtime; identifiable voice use still requires consent.'],
    ['stability', ['graphic'], 'Executable image generation runtime.'],
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
      executable: missing.length === 0 && authorization.authorized,
      missingEnv: missing,
      notes,
    };
  });
}

export function getConfiguredProviderAdapter() {
  const providerName = configuredProviderName();
  return getProviderAdapters().find((adapter) => adapter.name === providerName) ?? getProviderAdapters()[0];
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
