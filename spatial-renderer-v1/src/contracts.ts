export type SpatialRenderJobStatus = "queued" | "leased" | "rendered" | "published" | "failed";

export type SpatialRenderJob = {
  jobId: string;
  sceneId: string;
  uid: string;
  tenantId: string;
  rendererMode: "spatial-scene-v1";
  status: SpatialRenderJobStatus;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SpatialRenderArtifact = {
  kind: "scene" | "spatial" | "world" | "ar" | "gltf" | "glb" | "usdz" | "manifest";
  path: string;
  contentType: string;
  bytes: number;
};

export type SpatialRenderResult = {
  job: SpatialRenderJob;
  artifacts: SpatialRenderArtifact[];
  warnings: string[];
};
