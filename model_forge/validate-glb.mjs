#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';
import { checkTriangleBudget } from './triangle-budget.mjs';

function fail(message) { throw new Error(message); }

function parseGlb(buffer) {
  if (buffer.byteLength < 20) fail('GLB too small');
  if (buffer.toString('ascii', 0, 4) !== 'glTF') fail('Invalid GLB magic');
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2) fail(`Unsupported GLB version ${version}`);
  if (declaredLength !== buffer.byteLength) fail(`GLB declared length ${declaredLength} != actual ${buffer.byteLength}`);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4E4F534A) fail('First GLB chunk is not JSON');
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  if (jsonEnd > buffer.byteLength) fail('GLB JSON chunk out of bounds');
  const jsonText = buffer.toString('utf8', jsonStart, jsonEnd).replace(/\u0000+|\s+$/g, '');
  const gltf = JSON.parse(jsonText);
  return { version, gltf };
}

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
