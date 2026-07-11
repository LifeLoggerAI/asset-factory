import type { CanonicalAssetType } from './assetFactoryTypes';

export type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';

type ProviderTypeReadiness = {
  type: CanonicalAssetType;
  configured: boolean;
  missingEnv: string[];
};

export type AssetProviderAdapter = {
  name: AssetProviderName;
  supported