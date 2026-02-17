
import { NextResponse } from 'next/server';
import path from 'path';
import { fork } from 'child_process';
import fs from 'fs/promises';

// THIS IS THE CORRECT PATH TO THE ENGINE DIRECTORY
const enginePath = path.resolve(process.cwd(), '../engine');
const dbPath = path.join(enginePath, 'db.json');
const workerPath = path.join(enginePath, 'engine-worker.js');

async function readDb() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If the file doesn't exist, return a default structure
    if (error.code === 'ENOENT') {
      return { jobs: [] };
    }
    throw error;
  }
}

async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function POST(request: Request) {
  try {
    const inputData = await request.json();

    const db = await readDb();

    const newJob = {
      id: `job_${Date.now()}`,
      status: "queued",
      createdAt: new Date().toISOString(),
      input: inputData,
    };

    db.jobs.push(newJob);
    await writeDb(db);

    // Fork the worker process to handle the job
    fork(workerPath, [newJob.id]);

    return NextResponse.json({
      message: 'Job submitted successfully',
      jobId: newJob.id,
      status: 'queued'
    }, { status: 202 });

  } catch (error: any) {
    console.error('Error submitting job:', error);
    return NextResponse.json({ message: 'An internal error occurred.', error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');
        const db = await readDb();

        if (jobId) {
            const job = db.jobs.find(j => j.id === jobId);
            if (job) {
                return NextResponse.json(job);
            }
            return NextResponse.json({ message: "Job not found" }, { status: 404 });
        } else {
            return NextResponse.json(db.jobs);
        }
    } catch (error) {
        console.error('Error fetching jobs:', error);
        return NextResponse.json({ message: "An internal error occurred." }, { status: 500 });
    }
}
