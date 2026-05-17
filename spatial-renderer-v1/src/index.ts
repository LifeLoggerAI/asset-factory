import { renderSpatialScene } from "./render.js";
import type { SpatialRenderJob } from "./contracts.js";

function buildLocalJob(): SpatialRenderJob {
  const now = new Date().toISOString();
  return {
    jobId: process.env.SPATIAL_RENDER_JOB_ID || "local-spatial-render-job",
    sceneId: process.env.SPATIAL_RENDER_SCENE_ID || "local-spatial-scene",
    uid: process.env.SPATIAL_RENDER_UID || "local-user",
    tenantId: process.env.SPATIAL_RENDER_TENANT_ID || "local-tenant",
    rendererMode: "spatial-scene-v1",
    status: "queued",
    title: process.env.SPATIAL_RENDER_TITLE || "URAI Spatial Scene",
    createdAt: now,
    updatedAt: now,
  };
}

const result = renderSpatialScene(buildLocalJob());
console.log(JSON.stringify(result, null, 2));
