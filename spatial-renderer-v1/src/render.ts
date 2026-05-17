import type { SpatialRenderArtifact, SpatialRenderJob, SpatialRenderResult } from "./contracts.js";

function toBytes(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function artifact(kind: SpatialRenderArtifact["kind"], basePath: string, filename: string, contentType: string, body: string): SpatialRenderArtifact {
  return {
    kind,
    path: `${basePath}/${filename}`,
    contentType,
    bytes: toBytes(body),
  };
}

export function buildSceneGraph(job: SpatialRenderJob) {
  return {
    version: "spatial-scene-v1",
    sceneId: job.sceneId,
    title: job.title,
    tenantId: job.tenantId,
    uid: job.uid,
    environment: {
      style: "moonlit-orb-platform",
      sky: "deep-blue-purple",
      floor: "reflective-black-stone",
      lighting: "soft-volumetric-moonlight",
    },
    objects: [
      {
        id: "central-orb",
        type: "orb",
        position: [0, 1.4, 0],
        radius: 0.72,
        material: "moonlit-glass",
      },
      {
        id: "ritual-platform",
        type: "platform",
        position: [0, 0, 0],
        radius: 3.2,
        material: "reflective-black-stone",
      },
    ],
  };
}

export function buildGltf(job: SpatialRenderJob) {
  return {
    asset: {
      version: "2.0",
      generator: "urai-spatial-renderer-v1",
      copyright: "URAI Labs",
    },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: `${job.title} Orb`, mesh: 0, translation: [0, 1.4, 0] },
      { name: "Moonlit Platform", mesh: 1, translation: [0, 0, 0] },
    ],
    meshes: [
      { name: "Orb placeholder mesh", primitives: [] },
      { name: "Platform placeholder mesh", primitives: [] },
    ],
  };
}

export function renderSpatialScene(job: SpatialRenderJob): SpatialRenderResult {
  const basePath = `users/${job.uid}/spatial/scenes/${job.sceneId}`;
  const scene = JSON.stringify(buildSceneGraph(job), null, 2);
  const spatial = JSON.stringify({ sceneId: job.sceneId, anchors: [], roomSemantics: [], consentRequired: true }, null, 2);
  const world = JSON.stringify({ sceneId: job.sceneId, worldScale: 1, safeZoneMeters: 2.5 }, null, 2);
  const ar = JSON.stringify({ sceneId: job.sceneId, quickLook: false, webxr: false, reason: "XR remains gated until device QA passes." }, null, 2);
  const gltf = JSON.stringify(buildGltf(job), null, 2);
  const manifest = JSON.stringify({ sceneId: job.sceneId, rendererMode: job.rendererMode, artifacts: ["scene", "spatial", "world", "ar", "gltf"], generatedAt: new Date().toISOString() }, null, 2);

  return {
    job: { ...job, status: "rendered", updatedAt: new Date().toISOString() },
    artifacts: [
      artifact("scene", basePath, "scene.json", "application/json", scene),
      artifact("spatial", basePath, "spatial.json", "application/json", spatial),
      artifact("world", basePath, "world.json", "application/json", world),
      artifact("ar", basePath, "ar.json", "application/json", ar),
      artifact("gltf", basePath, "scene.gltf", "model/gltf+json", gltf),
      artifact("manifest", basePath, "manifest.json", "application/json", manifest),
    ],
    warnings: [
      "GLB binary export is represented by the renderer contract and must be connected to a mesh/binary exporter before XR live launch.",
      "USDZ export is intentionally gated until iOS AR Quick Look QA is complete.",
    ],
  };
}
