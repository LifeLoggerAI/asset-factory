const JSZip = require('jszip');

/**
 * Create a deterministic ZIP archive from file buffers.
 *
 * This helper intentionally lives inside `functions/` so Firebase deploys include
 * the runtime dependency and code. Do not import packaging code from
 * `assetfactory-studio/` in Cloud Functions because Firebase deploys only the
 * configured functions source directory.
 *
 * @param {Array<{path: string, data: Buffer}>} files
 * @returns {Promise<Buffer>}
 */
async function createDeterministicZip(files) {
  const zip = new JSZip();
  const fixedTimestamp = new Date('2024-01-01T00:00:00Z');
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    zip.file(file.path, file.data, {
      date: fixedTimestamp,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      platform: 'UNIX'
    });
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX'
  });
}

module.exports = { createDeterministicZip };
