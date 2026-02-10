
export type ReplayScene = {
  sceneId: string;
  lifeMapChapterId: string;
  template: 'title_card' | 'quote' | 'event_moment' | 'outro_card';
  startTime: number;
  endTime: number;
  assets: {
    assetId: string;
    version: string;
  }[];
  dynamicText?: Record<string, string>;
};

export type ReplayAudio = {
  trackId: string;
  assetId: string;
  version: string;
  volume: number;
  startTime: number;
};

export type ReplayRender = {
  renderId: string;
  replayId: string;
  status: 'pending' | 'rendering' | 'complete' | 'failed';
  assetId: string; // The final rendered video asset in Asset Factory
  version: string;
  createdAt: number;
  finishedAt?: number;
};

export type ReplayJob = {
  jobId: string;
  lifeMapVersion: string;
  style: 'cinematic_short' | 'highlight_reel' | 'deep_dive';
  scenes: ReplayScene[];
  audio: ReplayAudio[];
  render?: ReplayRender;
  createdAt: number;
};
