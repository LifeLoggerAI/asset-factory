export type LifeMapEvent = {
  eventId: string;
  userId: string;
  timestamp: number;
  type: string; // e.g., 'photo_taken', 'location_update', 'note_created'
  source: string; // e.g., 'mobile_app', 'manual_upload', 'api_integration'
  data: Record<string, unknown>; // The raw data associated with the event
};

export type EnrichedEvent = LifeMapEvent & {
  // Additional context added during the enrichment phase
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  weather?: {
    condition: string;
    temperature: number;
  };
  sentiment?: {
    score: number;
    label: string;
  };
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
};
