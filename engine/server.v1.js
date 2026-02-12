
require('dotenv').config();
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { fork } = require('child_process');

// --- CONSTANTS ---
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ASSET_FACTORY_API_KEY;
const JOBS_DIR = path.join(__dirname, 'jobs');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

// --- VALIDATION ---
if (!API_KEY) {
  console.error("CRITICAL: ASSET_FACTORY_API_KEY environment variable is not set.");
  process.exit(1);
}

// --- AUTHENTICATION MIDDLEWARE ---
const apiKeyAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header is missing or malformed" });
  }
  const providedKey = authHeader.split("Bearer ")[1];
  if (providedKey !== API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }
  next();
};

// --- EXPRESS APP ---
const app = express();
app.use(express.json());

// --- API ENDPOINTS ---

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.1-restored' });
});

// Create Job (Asynchronous)
app.post('/v1/jobs', apiKeyAuth, async (req, res) => {
  const { topic, format } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const jobId = uuidv4();
  const jobPath = path.join(JOBS_DIR, jobId);
  const job = {
    jobId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    input: { topic, format: format || 'short' }
  };

  try {
    await fs.ensureDir(jobPath);
    await fs.writeJson(path.join(jobPath, 'job.json'), job);

    // Fork a child process to handle the long-running task asynchronously
    const workerProcess = fork(path.join(__dirname, 'engine-worker.js'));
    workerProcess.send(job); // Send job data to the worker

    res.status(202).json({ jobId: job.jobId, status: job.status, createdAt: job.createdAt });
  } catch (error) {
    console.error(`Failed to create job ${jobId}:`, error);
    res.status(500).json({ error: "Failed to queue job" });
  }
});

// Get Job Status
app.get('/v1/jobs/:id', apiKeyAuth, async (req, res) => {
  const { id } = req.params;
  const jobPath = path.join(JOBS_DIR, id);

  try {
    const job = await fs.readJson(path.join(jobPath, 'job.json'));
    res.status(200).json(job);
  } catch (error) {
    res.status(404).json({ error: "Job not found" });
  }
});

// Download Job Bundle
app.get('/v1/jobs/:id/download', apiKeyAuth, async (req, res) => {
  const { id } = req.params;
  const bundlePath = path.join(OUTPUT_DIR, id, 'bundle.zip');

  try {
    if (!await fs.pathExists(bundlePath)) {
      return res.status(404).json({ error: "Bundle not found or job not complete." });
    }
    res.download(bundlePath, `asset-factory-${id}.zip`);
  } catch (error) {
    console.error(`Failed to download bundle for job ${id}:`, error);
    res.status(500).json({ error: "Could not retrieve bundle" });
  }
});

// --- SERVER INITIALIZATION ---
const startServer = async () => {
  await fs.ensureDir(JOBS_DIR);
  await fs.ensureDir(OUTPUT_DIR);
  app.listen(PORT, () => {
    console.log(`✅ Asset-Factory Core Engine v1.0.1-restored running on port ${PORT}`);
  });
};

startServer();
