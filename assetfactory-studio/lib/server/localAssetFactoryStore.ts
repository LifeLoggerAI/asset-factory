import fs from 'node:fs/promises';
import path from 'node:path';

type GenericRecord = Record<string, unknown>;

type Db = {
  jobs: Record<string, GenericRecord>;
  assets: Record<string, GenericRecord>;
  usage: Record<string, GenericRecord>;
};

const baseDir = path.join(process.cwd(), '.asset-factory-local');
const dbPath = path.join(baseDir, 'db.json');
const generatedDir = path.join(baseDir, 'generated');

const init: Db = {
  jobs: {},
  assets: {},
  usage: {},
};

function normalizeDb(value: Partial<Db> | null | undefined): Db {
  return {
    jobs: value?.jobs ?? {},
    assets: value?.assets ?? {},
    usage: value?.usage ?? {},
  };
}

async function readDb(): Promise<Db> {
  try {
    return normalizeDb(JSON.parse(await fs.readFile(dbPath, 'utf-8')) as Partial<Db>);
  } catch {
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify(init, null, 2));
    return init;
  }
}

async function writeDb(db: Db) {
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(normalizeDb(db), null, 2));
}

export async function localAddJob(job: GenericRecord) {
  const db = await readDb();
  db.jobs[String(job.jobId)] = job;
  await writeDb(db);

  return job;
}

export async function localReadJobs() {
  return Object.values((await readDb()).jobs);
}

export async function localFindJob(jobId: string) {
  return (await readDb()).jobs[jobId] ?? null;
}

export async function localUpdateJob(jobId: string, patch: GenericRecord) {
  const db = await readDb();

  if (!db.jobs[jobId]) {
    return null;
  }

  db.jobs[jobId] = {
    ...db.jobs[jobId],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await writeDb(db);

  return db.jobs[jobId];
}

export async function localListAssets() {
  return Object.values((await readDb()).assets);
}

export async function localFindAsset(jobId: string) {
  return (await readDb()).assets[jobId] ?? null;
}

export async function localUpsertAsset(asset: GenericRecord) {
  const db = await readDb();
  db.assets[String(asset.jobId)] = asset;
  await writeDb(db);

  return asset;
}

export async function localRecordUsage(event: GenericRecord) {
  const db = await readDb();
  const eventId = String(event.eventId ?? `${event.tenantId ?? 'default'}-${event.jobId ?? Date.now()}-${Date.now()}`);
  db.usage[eventId] = {
    ...event,
    eventId,
    createdAt: event.createdAt ?? new Date().toISOString(),
  };
  await writeDb(db);

  return db.usage[eventId];
}

export async function localListUsage() {
  return Object.values((await readDb()).usage);
}

export async function localWriteGenerated(fileName: string, buffer: Buffer) {
  await fs.mkdir(generatedDir, { recursive: true });

  const generatedPath = path.join(generatedDir, fileName);
  await fs.writeFile(generatedPath, buffer);

  return generatedPath;
}

export async function localReadGenerated(fileName: string) {
  try {
    return await fs.readFile(path.join(generatedDir, fileName));
  } catch {
    return null;
  }
}