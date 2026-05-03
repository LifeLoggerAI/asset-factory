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
