require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

const JOBS_DIR = path.join(__dirname, 'jobs');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const POLLING_INTERVAL = 5000; // 5 seconds

async function processJob(job) {
  const { jobId, input } = job;
  const outputDir = path.join(OUTPUTS_DIR, jobId);

  console.log(`Processing job ${jobId}...`);

  try {
    // Simulate asset generation
    await fs.ensureDir(outputDir);
    await fs.writeFile(
      path.join(outputDir, 'asset.txt'),
      `This is a dummy asset for job ${jobId} with topic: ${input.topic}`
    );

    // Update job status to 'completed'
    const jobFilePath = path.join(JOBS_DIR, `${jobId}.json`);
    const updatedJob = { ...job, status: 'completed', completedAt: new Date().toISOString() };
    await fs.writeJson(jobFilePath, updatedJob, { spaces: 2 });

    console.log(`Job ${jobId} completed successfully.`);
  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    // Update job status to 'failed'
    const jobFilePath = path.join(JOBS_DIR, `${jobId}.json`);
    const updatedJob = { ...job, status: 'failed', error: error.message };
    await fs.writeJson(jobFilePath, updatedJob, { spaces: 2 });
  }
}

async function pollForJobs() {
  const files = await fs.readdir(JOBS_DIR);

  for (const file of files) {
    if (path.extname(file) === '.json') {
      const jobFilePath = path.join(JOBS_DIR, file);
      try {
        const job = await fs.readJson(jobFilePath);
        if (job.status === 'queued') {
          await processJob(job);
        }
      } catch (error) {
        console.error(`Error reading job file ${file}:`, error);
      }
    }
  }
}

console.log('✅ Asset Factory V1 Worker started.');
console.log(`Polling for jobs every ${POLLING_INTERVAL / 1000} seconds...`);

// Start polling
setInterval(pollForJobs, POLLING_INTERVAL);

// Ensure directories exist
fs.ensureDirSync(JOBS_DIR);
fs.ensureDirSync(OUTPUTS_DIR);
