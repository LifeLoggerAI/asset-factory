
const JSZip = require('jszip');

/**
 * Creates a deterministic zip archive from a list of files.
 *
 * @param {Array<{path: string, data: Buffer}>} files - An array of file objects to include in the zip.
 * @returns {Promise<Buffer>} A promise that resolves with the zip file as a Buffer.
 */
async function createDeterministicZip(files) {
    const zip = new JSZip();
    // Use a fixed timestamp for all files in the zip to ensure hash consistency
    const fixedTimestamp = new Date('2024-01-01T00:00:00Z');

    // Sort files by path to ensure a consistent order within the archive
    const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path));

    for (const file of sortedFiles) {
        zip.file(file.path, file.data, {
            date: fixedTimestamp,
            compression: "DEFLATE",
            compressionOptions: {
                level: 9
            },
            platform: 'UNIX' // Use a consistent platform for deterministic output
        });
    }

    const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 9
        },
        platform: 'UNIX'
    });

    return zipBuffer;
}

module.exports = { createDeterministicZip };
