export interface ApiKey {
  id: string;
  projectId: string;
  keyHash: string;
  usageCount: number;
  usageLimit: number;
  active: boolean;
}
