export interface Manifest {
  id: string;
  jobId: string;
  outputFiles: {
    type: "video" | "image" | "audio" | "srt" | "pdf";
    url: string;
    hash: string;
  }[];
  fullOutputHash: string;
  generationTimeMs: number;
  modelVersions: {
    videoModel: string;
    imageModel: string;
    audioModel: string;
  };
}
