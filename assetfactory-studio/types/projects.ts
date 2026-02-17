export interface Project {
  id: string;
  name: string;
  ownerId: string;
  plan: "free" | "pro" | "agency" | "enterprise";
  pipelineVersion: string;
  createdAt: Date;
}
