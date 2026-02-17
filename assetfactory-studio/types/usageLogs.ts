export interface UsageLog {
  id: string;
  projectId: string;
  jobId: string;
  computeUnits: number;
  costEstimate: number;
  createdAt: Date;
}
