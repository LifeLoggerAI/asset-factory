import type { CanonicalAssetType } from './assetFactoryTypes';

export type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';

export type AssetProviderAdapter = {
  name: AssetProviderName;
  supportedTypes: CanonicalAssetType[];
  configured: boolean;
  executable: boolean;