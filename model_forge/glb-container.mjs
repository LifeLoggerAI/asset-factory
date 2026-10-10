// Bounded GLB container and local buffer-range validation, not a glTF validator.
export function parseGlbContainer(buffer, { requireEmbeddedResources = false } = {}) {
  const need = (ok, message) => { if (!ok) throw new Error(message); };
  const uint = (n) => Number.isSafeInteger(n) && n >= 0;
  need(buffer.length >= 20, 'GLB too small');
  need(buffer.readUInt32LE(0) === 0x46546c67, 'Invalid GLB magic');
  need(buffer.readUInt32LE(4) === 2, 'Unsupported GLB version');
  need(buffer.readUInt32LE(8) === buffer.length, 'GLB declared length mismatch');
  let offset = 12, gltf, binLength = null, chunks = 0;
  while (offset < buffer.length) {
    need(offset + 8 <= buffer.length, 'Truncated GLB chunk header');
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    need(length % 4 === 0, 'GLB chunk length is not aligned');
    const start = offset + 8, end = start + length;
    need(end <= buffer.length, 'GLB chunk out of bounds');
    if (chunks === 0) need(type === 0x4e4f534a, 'First GLB chunk is not JSON');
    if (type === 0x4e4f534a) {
      need(chunks === 0, 'Duplicate GLB JSON chunk');
      gltf = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(start, end)));
      need(gltf && typeof gltf === 'object' && !Array.isArray(gltf), 'GLB JSON must be an object');
      need(gltf.asset?.version === '2.0', 'GLB asset version must be 2.0');
    } else if (type === 0x004e4942) {
      need(chunks === 1 && binLength === null, 'GLB BIN must be unique and second');
      binLength = length;
    }
    offset = end; chunks += 1;
  }
  const buffers = gltf.buffers ?? [];
  need(Array.isArray(buffers), 'GLB buffers must be an array');
  buffers.forEach((b, i) => {
    need(b && uint(b.byteLength), 'Invalid buffer byteLength');
    if (b.uri === undefined) {
      if (i > 0) {
        need(gltf.extensionsRequired?.includes('EXT_meshopt_compression'), 'Unbacked buffer requires Meshopt');
        return; // Required Meshopt may use URI-less placeholder buffers.
      }
      need(binLength !== null || b.byteLength === 0, 'Missing GLB BIN data');
      if (binLength !== null) need(binLength >= b.byteLength && binLength <= b.byteLength + 3, 'GLB BIN size mismatch');
    } else need(typeof b.uri === 'string' && b.uri.length > 0, 'Invalid external buffer uri');
  });
  if (binLength !== null) need(buffers[0]?.uri === undefined && uint(buffers[0]?.byteLength), 'GLB BIN lacks embedded buffer declaration');
  const views = gltf.bufferViews ?? [];
  need(Array.isArray(views), 'GLB bufferViews must be an array');
  const fallback = (i) => (i > 0 && buffers[i]?.uri === undefined) || buffers[i]?.extensions?.EXT_meshopt_compression?.fallback === true;
  views.forEach((v) => {
    need(v && uint(v.buffer) && v.buffer < buffers.length, 'Invalid bufferView buffer');
    const start = v.byteOffset ?? 0;
    need(uint(start) && uint(v.byteLength) && v.byteLength > 0, 'Invalid bufferView range');
    need(start + v.byteLength <= buffers[v.buffer].byteLength, 'bufferView exceeds declared buffer');
    if (fallback(v.buffer)) need(v.extensions?.EXT_meshopt_compression, 'Uncompressed view references fallback buffer');
    if (v.extensions?.EXT_meshopt_compression) {
      const m = v.extensions.EXT_meshopt_compression;
      need(uint(m.buffer) && m.buffer < buffers.length, 'Invalid Meshopt buffer');
      need(!fallback(m.buffer), 'Meshopt compressed data references fallback buffer');
      need(uint(m.byteOffset ?? 0) && uint(m.byteLength) && m.byteLength > 0, 'Invalid Meshopt range');
      need((m.byteOffset ?? 0) + m.byteLength <= buffers[m.buffer].byteLength, 'Meshopt exceeds declared buffer');
    }
  });
  if (requireEmbeddedResources) {
    // Candidate custody stores and hashes one GLB. Sidecars are not retrieved,
    // and data URIs are outside the existing embedded decoded-asset policy.
    need(buffers.every((b) => b.uri === undefined), 'Candidate GLB requires embedded buffer resources');
    const images = gltf.images ?? [];
    need(Array.isArray(images), 'GLB images must be an array');
    images.forEach((image) => {
      need(image && image.uri === undefined, 'Candidate GLB requires embedded image resources');
      need(uint(image.bufferView) && image.bufferView < views.length, 'Candidate GLB image bufferView lacks embedded bytes');
    });
  }
  return { version: 2, gltf };
}
