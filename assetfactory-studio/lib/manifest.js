
/**
 * Creates a build manifest for a job.
 *
 * @param {string} jobId - The ID of the job.
 * @param {string} pipelineVersion - The version of the pipeline.
 * @param {string} assetPresetVersion - The version of the asset preset.
 * @param {string} externalModel - The version of the external model.
 * @param {string} localModelVersion - The version of the local model.
 * @param {string} rendererVersion - The version of the renderer.
 * @param {string} videoEncoderVersion - The version of the video encoder.
 * @param {string} templateEngineVersion - The version of the template engine.
 * @param {number} seed - The seed used for generation.
 * @returns {object} The build manifest object.
 */
function createBuildManifest(jobId, pipelineVersion, assetPresetVersion, externalModel, localModelVersion, rendererVersion, videoEncoderVersion, templateEngineVersion, seed) {
    return {
        jobId,
        buildManifest: {
            pipelineVersion,
            assetPresetVersion,
            externalModel,
            localModelVersion,
            rendererVersion,
            videoEncoderVersion,
            templateEngineVersion,
            seed,
        },
    };
}

module.exports = { createBuildManifest };
