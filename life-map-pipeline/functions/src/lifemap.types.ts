export type AssetLifecycleState = 'requested' | 'queued' | 'processing' | 'rendered' | 'stored' | 'published' | 'failed' | 'archived';

export type AssetFactoryStatus = 'healthy' | 'degraded' | 'maintenance';

export type AssetFormat = 'png' | 'svg' | 'webp' | 'json' | 'html' | 'mp4' | 'srt' | 'pdf' | 'zip' | 'unknown';

export type AssetDimensions = {
  width?: number;
  height?: number;
  durationMs?: number;
};

export type AssetFactoryRequest = {
  assetId: string;
  userId?: string;
  anonymousSessionId?: string;
  projectId: string;
  assetType: string;
  format: AssetFormat;
  status: AssetLifecycleState;
  storagePath?: string;
  publicUrl?: string;
  source: string;
  prompt?: string;
  tags: string[];
  dimensions?: AssetDimensions;
  version: string;
  lifecycleState: AssetLifecycleState;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type AssetFactoryQueueItem = {
  queueId: string;
  assetId: string;
  userId?: string;
  anonymousSessionId?: string;
  status: 'queued' | 'claimed' | 'completed' | 'dead_lettered';
  attempts: number;
  createdAt: number;
  updatedAt: number;
  claimedAt?: number;
  completedAt?: number;
  deadLetteredAt?: number;
  lastError?: string;
};

export type SystemStatusRecord = {
  status: AssetFactoryStatus;
  service: 'asset-factory';
  version: string;
  updatedAt: number;
  checks: Record<string, boolean | string | number>;
};

export type EnrichedEvent = LifeMapEvent & {
  enrichmentVersion?: string;
};

export type LifeMapEvent = {
  eventId: string;
  userId: string;
  timestamp: number;
  source: string;
  type: string;
  payload: Record<string, unknown>;
  linkedAssetId?: string;
};

export type LifeMapChapter = {
  chapterId: string;
  title: string;
  startTime: number;
  endTime: number;
  events: EnrichedEvent[];
};

export type LifeMap = {
  lifeMapId: string;
  userId: string;
  version: number;
  status: 'processing' | 'complete' | 'failed';
  createdAt: number;
  updatedAt: number;
  chapters: LifeMapChapter[];
  contentHash: string;
};
