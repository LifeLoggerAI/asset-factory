#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';
import { checkTriangleBudget } from './triangle-budget.mjs';
import { parseGlbContainer } from './glb-container.mjs';

function fail(message) { throw new Error(message); }

const parseGlb = parseGlbContainer;

function main() {
  const file = process.argv[2];
  if (!file) fail('Usage: node model_forge/validate-glb.mjs <file.glb> [maxTriangles]');
  const maxTriangles = Number(process.argv[3] ?? 2000000);
  const buffer = fs.readFileSync(file);
  const { gltf } = parseGlb(buffer);
  const meshes = gltf.meshes?.length ?? 0;
  const nodes = gltf.nodes?.length ?? 0;
  const materials = gltf.materials?.length ?? 0;
  const images = gltf.images?.length ?? 0;
  const { triangles, indexedTriangles } = checkTriangleBudget(gltf, maxTriangles);
  if (!meshes) fail('GLB contains no meshes');
  if (triangles > maxTriangles) fail(`Triangle estimate ${triangles} exceeds ${maxTriangles}`);
  const report = {
    schemaVersion: 'urai-glb-validation-v1',
    file,
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    assetVersion: gltf.asset?.version ?? null,
    generator: gltf.asset?.generator ?? null,
    meshes,
    nodes,
    materials,
    images,
    accessors: gltf.accessors?.length ?? 0,
    animations: gltf.animations?.length ?? 0,
    trianglesEstimated: triangles,
    trianglesEstimatedFromIndexedTrianglePrimitives: indexedTriangles,
    extensionsUsed: gltf.extensionsUsed ?? [],
    extensionsRequired: gltf.extensionsRequired ?? [],
    verdict: 'structurally-valid-candidate-not-visual-authority',
  };
  console.log(JSON.stringify(report, null, 2));
}

try { main(); } catch (error) {
  console.error(`URAI_GLB_VALIDATION_ERROR=${error?.message ?? error}`);
  process.exitCode = 1;
}

