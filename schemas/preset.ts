import { AssetFactoryInputV1 } from './v1';

export interface PresetV1 {
  name: string;
  description: string;
  input: Partial<AssetFactoryInputV1>;
}
