const fs = require('fs/promises');
const path = require('path');

// This function simulates the asset generation process
async function generateAssets(job) {
  console.log(`[Worker] Generating assets for job ${job.id}`);
  // Simulate a delay for asset generation
  await new Promise(resolve => setTimeout(resolve, 5000)); 

  // In a real scenario, this would involve complex logic to create videos, images, etc.
  // For now, we'll just create a dummy output file.
  const outputDir = path.join(__dirname, '..', 'outputs', job.id);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'final_asset.txt');
  await fs.writeFile(outputPath, `Asset for prompt: \"${job.prompt}\"`);

  console.log(`[Worker] Finished generating assets for job ${job.id}`);
  return [{ type: 'text', path: `/outputs/${job.id}/final_asset.txt` }];
}

async function processJob(jobId, dbPath) {
  console.log(`[Worker] Processing job ${jobId}`);
  const dbData = await fs.readFile(dbPath, 'utf8');
  const db = JSON.parse(dbData);
  const job = db.jobs.find(j => j.id === jobId);

  if (!job) {
    console.error(`[Worker] Job ${jobId} not found in database.`);
    return;
  }

  try {
    // 1. Mark job as running
    job.status = 'running';
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    console.log(`[Worker] Job ${jobId} status updated to 'running'.`);

    // 2. Generate the assets
    const assets = await generateAssets(job);

    // 3. Mark job as completed
    const finalDbData = await fs.readFile(dbPath, 'utf8');
    const finalDb = JSON.parse(finalDbData);
    const finalJob = finalDb.jobs.find(j => j.id === jobId);

    finalJob.status = 'completed';
    finalJob.completedAt = new Date().toISOString();
    finalJob.assets = assets;

    await fs.writeFile(dbPath, JSON.stringify(finalDb, null, 2));
    console.log(`[Worker] Job ${jobId} completed successfully.`);

  } catch (error) {
    // 4. Handle failures
    console.error(`[Worker] Job ${jobId} failed. Error: ${error.message}`);
    const errorDbData = await fs.readFile(dbPath, 'utf8');
    const errorDb = JSON.parse(errorDbData);
    const errorJob = errorDb.jobs.find(j => j.id === jobId);

    errorJob.status = 'failed';
    errorJob.failedAt = new Date().toISOString();
    errorJob.error = error.message;
    await fs.writeFile(dbPath, JSON.stringify(errorDb, null, 2));
  }
}

process.on('message', async ({ jobId, dbPath }) => {
  await processJob(jobId, dbPath);
  process.exit();
});
