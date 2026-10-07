// Counts geometry once per mesh, including nonindexed triangles, strips and fans.
export function checkTriangleBudget(gltf, maxTriangles) {
  if (!Number.isSafeInteger(maxTriangles) || maxTriangles < 0) throw new Error('Triangle budget must be a nonnegative safe integer');
  let triangles = 0;
  let indexedTriangles = 0;
  let indexedTrianglePrimitives = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = primitive.mode ?? 4;
      if (!Number.isInteger(mode) || mode < 0 || mode > 6) throw new Error('Invalid primitive mode');
      if (mode < 4) continue;
      const indexed = primitive.indices !== undefined;
      const accessorIndex = indexed ? primitive.indices : primitive.attributes?.POSITION;
      if (!Number.isInteger(accessorIndex) || accessorIndex < 0) throw new Error('Triangle primitive has no valid count accessor');
      const count = gltf.accessors?.[accessorIndex]?.count;
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Triangle accessor count must be a positive safe integer');
      const primitiveTriangles = mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
      triangles += primitiveTriangles;
      if (!Number.isSafeInteger(triangles)) throw new Error('Triangle count exceeds safe integer range');
      if (indexed && mode === 4) {
        indexedTriangles += primitiveTriangles;
        indexedTrianglePrimitives += 1;
      }
    }
  }
  if (triangles > maxTriangles) throw new Error(`Triangle estimate ${triangles} exceeds budget ${maxTriangles}`);
  return { triangles, indexedTriangles, indexedTrianglePrimitives };
}
