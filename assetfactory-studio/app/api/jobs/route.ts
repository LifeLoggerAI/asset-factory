
import { NextResponse } from 'next/server';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

// Define the path to the engine directory, assuming it's at the root of the project
const enginePath = path.resolve(process.cwd(), '..', 'engine');
const DB_PATH = path.join(enginePath, 'db.json');
const USERS_PATH = path.join(enginePath, 'users.json');

// Helper to read the database
async function readDB() {
  try {
    const dbData = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(dbData);
  } catch (error) {
    // If the file doesn't exist, create it with an empty jobs array
    if (error.code === 'ENOENT') {
      await fs.writeFile(DB_PATH, JSON.stringify({ jobs: [] }, null, 2));
      return { jobs: [] };
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const jobData = await request.json();
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ message: 'API key is required' }, { status: 401 });
    }

    // --- You would have more robust user auth here ---
    const usersData = await fs.readFile(USERS_PATH, "utf8");
    const users = JSON.parse(usersData);
    const user = users.find((u: any) => u.apiKey === apiKey);

    if (!user) {
        return NextResponse.json({ message: 'Invalid API key' }, { status: 403 });
    }
    // ---

    const db = await readDB();

    const jobId = `job_${Date.now()}`;
    const newJob = {
      id: jobId,
      status: 'queued',
      ...jobData,
      createdAt: new Date().toISOString(),
      userId: user.id
    };

    db.jobs.push(newJob);
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));

    // Fork a child process for the worker
    const worker = fork(path.join(enginePath, 'engine-worker.js'));
    worker.send({ jobId, dbPath: DB_PATH });

    return NextResponse.json({
      message: 'Job submitted successfully',
      jobId: jobId,
      status: 'queued'
    }, { status: 202 });

  } catch (error) {
    console.error('Error submitting job:', error);
    if (error.code === 'ENOENT') {
        return NextResponse.json({ message: 'Engine files not found, please ensure the engine is set up.' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Error submitting job' }, { status: 500 });
  }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('id');

    if (!jobId) {
        return NextResponse.json({ message: 'Job ID is required' }, { status: 400 });
    }

    try {
        const db = await readDB();
        const job = db.jobs.find((j: any) => j.id === jobId);

        if (!job) {
            return NextResponse.json({ message: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json(job);
    } catch (error) {
        console.error(`Error fetching job ${jobId}:`, error);
        return NextResponse.json({ message: 'Error fetching job status' }, { status: 500 });
    }
}
