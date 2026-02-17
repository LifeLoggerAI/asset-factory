const express = require("express");
const { fork } = require("child_process");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;

const DB_PATH = path.join(__dirname, "db.json");
const USERS_PATH = path.join(__dirname, "users.json");

app.use(express.json());

const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API key is required" });
  }

  const usersData = await fs.readFile(USERS_PATH, "utf8");
  const users = JSON.parse(usersData);
  const user = users.find((u) => u.apiKey === apiKey);

  if (!user) {
    return res.status(403).json({ error: "Invalid API key" });
  }
  req.user = user;
  next();
};

const checkJobQuota = (req, res, next) => {
    const user = req.user;
    const now = new Date();
    const lastReset = new Date(user.usage.lastReset);

    if (now.getMonth() > lastReset.getMonth() || now.getFullYear() > lastReset.getFullYear()) {
        user.usage.jobsThisMonth = 0;
        user.usage.lastReset = now.toISOString();
    }

    if (user.usage.jobsThisMonth >= user.quota.jobsPerMonth) {
        return res.status(429).json({ error: "Job quota exceeded" });
    }

    next();
};

app.post("/v1/jobs", apiKeyAuth, checkJobQuota, async (req, res) => {
  const { prompt, format } = req.body;
  if (!prompt || !format) {
    return res.status(400).json({ error: "prompt and format are required" });
  }

  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: "queued",
    prompt,
    format,
    createdAt: new Date().toISOString(),
  };

  const dbData = await fs.readFile(DB_PATH, "utf8");
  const db = JSON.parse(dbData);
  db.jobs.push(job);
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  
  const usersData = await fs.readFile(USERS_PATH, "utf8");
  const users = JSON.parse(usersData);
  const user = users.find(u => u.id === req.user.id);
  user.usage.jobsThisMonth++;
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));

  const worker = fork(path.join(__dirname, "engine-worker.js"));
  worker.send({ jobId, dbPath: DB_PATH });

  res.status(202).json(job);
});

app.get("/v1/jobs/:jobId", apiKeyAuth, async (req, res) => {
  const { jobId } = req.params;
  const dbData = await fs.readFile(DB_PATH, "utf8");
  const db = JSON.parse(dbData);
  const job = db.jobs.find((j) => j.id === jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Asset-Factory V1 server listening on port ${PORT}`);
});
