
export type JobMode = "standard" | "deterministic";
export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type AssetType = "video" | "image" | "audio" | "kit";
export type Style = "cinematic" | "minimal" | "marketing" | "documentary";
export type AspectRatio = "9:16" | "16:9" | "1:1";
export type VoiceTone = "neutral" | "energetic" | "calm";
export type OutputFormat = "mp4" | "srt" | "pdf" | "jpeg" | "png";
export type Platform = "tiktok" | "youtube" | "instagram" | "custom";

export interface ModelVersions {
  video_model?: string;
  image_model?: string;
  tts_model?: string;
  render_engine?: string;
}

export interface JobInput {
  prompt: string;
  style: Style;
  duration?: number;
  aspect_ratio?: AspectRatio;
  voice?: {
    enabled: boolean;
    tone: VoiceTone;
    language: string;
  };
}

export interface JobOutput {
  formats: OutputFormat[];
  platform: Platform;
}

export interface JobMetadata {
  client_reference_id?: string;
  tags?: string[];
}

export interface Job {
  job_id: string;
  api_key_id: string;
  mode: JobMode;
  
  type: AssetType;
  input: JobInput;
  output: JobOutput;
  metadata?: JobMetadata;
  
  normalized_input_json?: string;
  input_hash?: string;
  
  seed?: number;
  pipeline_version: string;
  
  model_versions: ModelVersions;
  
  status: JobStatus;
  
  compute_seconds?: number;
  storage_bytes?: number;
  
  output_hash?: string;
  created_at: number;
  completed_at?: number;
}
