export type LifeMap = {
  userId: string;
  mapId: string;
  version: string;
  status: 'building' | 'complete' | 'stale' | 'corrupt';
  chapters: string[];
  eventCount: number;
  createdAt: number;
  updatedAt: number;
};

export type LifeMapChapter = {
  mapId: string;
  chapterId: string;
  name: string;
  eventCount: number;
  startTime: number;
  endTime: number;
  dataSummary: Record<string, unknown>;
  version: string;
  createdAt: number;
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

export type LifeMapJob = {
  jobId: string;
  userId: string;
  mapId: string;
  type: 'fullRebuild' | 'chapterSynthesis' | 'gapAnalysis';
  status: 'queued' | 'running' | 'failed' | 'complete';
  progress: number;
  logs: string[];
  startedAt: number;
  finishedAt?: number;
};
