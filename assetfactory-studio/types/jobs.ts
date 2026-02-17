export interface Job {
  id: string;
  projectId: string;
  inputSchemaVersion: string;
  pipelineVersion: string;
  seed: number;
  deterministicHash: string;
  status: "queued" | "processing" | "complete" | "failed";
  outputManifestId: string;
  createdAt: Date;
  completedAt: Date;
}
