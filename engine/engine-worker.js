
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

// --- CONSTANTS ---
const JOBS_DIR = path.join(__dirname, 'jobs');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

// --- MOCK ASSET GENERATION ---
// In a real system, this would involve complex logic:
// 1. Hashing input to ensure determinism.
// 2. Calling external services (AI models, rendering engines).
// 3. Verifying outputs against a manifest.
// 4. Failing the build if determinism is violated.
const generateAssets = async (job) => {
    console.log(`[Worker ${process.pid}] Starting asset generation for job: ${job.jobId}`);
    const jobOutputDir = path.join(OUTPUT_DIR, job.jobId);
    await fs.ensureDir(jobOutputDir);

    // Simulate creating assets by writing dummy files.
    await fs.writeFile(path.join(jobOutputDir, 'video.mp4'), `Mock video for: ${job.input.topic}`);
    await fs.writeFile(path.join(jobOutputDir, 'audio.mp3'), `Mock audio for: ${job.input.topic}`);
    await fs.writeFile(path.join(jobOutputDir, 'subtitles.srt'), `1\n00:00:01,000 --> 00:00:05,000\nMock subtitles for: ${job.input.topic}`);
    await fs.writeFile(path.join(jobOutputDir, 'thumb.png'), `Mock thumbnail image`);

    console.log(`[Worker ${process.pid}] Asset generation complete for job: ${job.jobId}`);
    return {
        videoUrl: `/outputs/${job.jobId}/video.mp4`,
        audioUrl: `/outputs/${job.jobId}/audio.mp3`,
        subtitlesUrl: `/outputs/${job.jobId}/subtitles.srt`,
        thumbUrl: `/outputs/${job.jobId}/thumb.png`
    };
};

// --- BUNDLE CREATION ---
const createBundle = (jobId) => {
    return new Promise((resolve, reject) => {
        const jobOutputDir = path.join(OUTPUT_DIR, jobId);
        const bundlePath = path.join(jobOutputDir, 'bundle.zip');
        const output = fs.createWriteStream(bundlePath);
        const archive = archiver('zip');

        output.on('close', () => {
            console.log(`[Worker ${process.pid}] ZIP bundle created for job: ${jobId}`);
            resolve(bundlePath);
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);
        archive.directory(jobOutputDir, false);
        archive.finalize();
    });
};

// --- JOB PROCESSING LOGIC ---
const processJob = async (job) => {
    const jobFilePath = path.join(JOBS_DIR, job.jobId, 'job.json');

    try {
        // 1. Mark job as running
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        await fs.writeJson(jobFilePath, job);

        // 2. Perform the core work
        const assets = await generateAssets(job);

        // 3. Create the ZIP bundle
        await createBundle(job.jobId);

        // 4. Mark job as complete
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        job.assets = assets;
        job.export_bundle_url = `/outputs/${job.jobId}/bundle.zip`;
        await fs.writeJson(jobFilePath, job);

        console.log(`[Worker ${process.pid}] Successfully completed job: ${job.jobId}`);

    } catch (error) {
        console.error(`[Worker ${process.pid}] CRITICAL: Failed to process job ${job.jobId}:`, error);
        // Mark job as failed
        job.status = 'failed';
        job.failedAt = new Date().toISOString();
        job.error = error.message;
        await fs.writeJson(jobFilePath, job);
    } finally {
        process.exit(0); // Ensure the worker process terminates
    }
};

// --- WORKER INITIALIZATION ---
process.on('message', (job) => {
    console.log(`[Worker ${process.pid}] Received job: ${job.jobId}`);
    processJob(job);
});
