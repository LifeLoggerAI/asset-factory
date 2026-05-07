import { getAdminDb } from './firebaseAdmin';

type QueueDispatchResult = {
  mode: 'local-inline' | 'firestore-queue' | 'http-task';
  queued: boolean;
  target?: string;
  message?: string;
};

export function configuredQueueMode() {
  const mode = String(process.env.ASSET_FACTORY_QUEUE_MODE || 'local-inline').toLowerCase();
  if (mode === 'firestore' || mode === 'firestore-queue') return 'firestore-queue' as const;
  if (mode === 'http' || mode === 'cloud-tasks' || mode === 'http-task') return 'http-task' as const;
  return 'local-inline' as const;
}

export async function dispatchAssetJob(jobId: string, payload: Record<string, unknown> = {}): Promise<QueueDispatchResult> {
  const mode = configuredQueueMode();

  if (mode === 'firestore-queue') {
    const db = getAdminDb();
    if (!db) return { mode, queued: false, message: 'Firestore Admin is unavailable; unable to enqueue durable job.' };
    await db.collection('assetFactoryQueue').doc(jobId).set({
      jobId,
      status: 'queued',
      queueStatus: 'queued',
      attempts: 0,
      payload,
      queuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { mode, queued: true, target: 'firestore:assetFactoryQueue' };
  }

  if (mode === 'http-task') {
    const endpoint = process.env.ASSET_FACTORY_WORKER_URL;
    if (!endpoint) return { mode, queued: false, message: 'ASSET_FACTORY_WORKER_URL is required for http-task queue mode.' };
    const secret = process.env.ASSET_FACTORY_WORKER_SECRET;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ jobId, ...payload }),
    });
    if (!response.ok) return { mode, queued: false, target: endpoint, message: `worker returned ${response.status}: ${await response.text()}` };
    return { mode, queued: true, target: endpoint };
  }

  return { mode, queued: false, message: 'local-inline mode does not dispatch to an external queue.' };
}

export function getQueueDiagnostics() {
  const mode = configuredQueueMode();
  return {
    mode,
    workerUrlConfigured: Boolean(process.env.ASSET_FACTORY_WORKER_URL),
    firestoreQueueCollection: 'assetFactoryQueue',
  };
}
