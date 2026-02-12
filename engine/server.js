require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

// --- MODULES ---
// engine-core is not used in this version, as we are restoring the job-based architecture.

// --- API KEY AUTHENTICATION ---
const V1_API_KEY = process.env.ASSET_FACTORY_API_KEY;

if (!V1_API_KEY) {
  console.error("CRITICAL: ASSET_FACTORY_API_KEY is not set. The server will not start.");
  process.exit(1);
}

function verifyApiKey(req, res, next) {
  const apiKey = req.get('X-API-Key');
  if (!apiKey || apiKey !== V1_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

// --- EXPRESS APP ---
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8080;
const JOBS_DIR = path.join(__dirname, 'jobs');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// --- V1 ENDPOINTS ---

// Health check - does not require API key
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.1-restored' });
});

// Create a new job
app.post('/v1/jobs', verifyApiKey, async (req, res) => {
  const jobId = uuidv4();
  const jobFilePath = path.join(JOBS_DIR, `${jobId}.json`);

  const jobData = {
    jobId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    input: req.body,
  };

  await fs.ensureDir(JOBS_DIR);
  await fs.writeJson(jobFilePath, jobData, { spaces: 2 });

  // This is where the worker would be triggered in a real implementation.
  // For now, we will manually create a dummy output for demonstration.
  const outputDir = path.join(OUTPUTS_DIR, jobId);
  await fs.ensureDir(outputDir);
  await fs.writeFile(path.join(outputDir, 'asset.txt'), 'This is a dummy asset.');

  res.status(202).json({ jobId, status: 'queued' });
});

// Get job status
app.get('/v1/jobs/:jobId', verifyApiKey, async (req, res) => {
  const { jobId } = req.params;
  const jobFilePath = path.join(JOBS_DIR, `${jobId}.json`);

  try {
    const jobData = await fs.readJson(jobFilePath);
    res.status(200).json(jobData);
  } catch (error) {
    res.status(404).json({ error: 'Job not found' });
  }
});

// Download job output
app.get('/v1/jobs/:jobId/download', verifyApiKey, async (req, res) => {
  const { jobId } = req.params;
  const outputDir = path.join(OUTPUTS_DIR, jobId);
  const zipFilePath = path.join(OUTPUTS_DIR, `${jobId}.zip`);

  if (!fs.existsSync(outputDir)) {
    return res.status(404).json({ error: 'Output not found for this job.' });
  }

  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip');

  output.on('close', () => {
    res.download(zipFilePath, (err) => {
      if (err) {
        console.error('Error sending zip file:', err);
      }
      // Clean up the zip file after download
      fs.remove(zipFilePath);
    });
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(outputDir, false);
  archive.finalize();
});


// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`✅ Asset Factory V1 Server (Restored) running on port ${PORT}`);
  console.log('🔑 API Key authentication is active.');
  console.log('API endpoints are available at /v1/jobs, /v1/jobs/:jobId, and /v1/jobs/:jobId/download');
});
