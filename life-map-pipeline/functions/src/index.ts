import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AssetFactoryQueueItem, AssetFactoryRequest, LifeMap, LifeMapEvent, EnrichedEvent, LifeMapChapter, SystemStatusRecord } from './lifemap.types';
import { deterministicHash } from './hash';

type HttpsRequest = Parameters<typeof functions.https.onRequest>[0] extends (req: infer Req, res: any) => any ? Req : never;
type HttpsResponse = Parameters<typeof functions.https.onRequest>[0] extends (req: any, res: infer Res) => any ? Res : never;
type FirestoreTransaction = FirebaseFirestore.Transaction;
type LifeMapEventSnapshot = functions.firestore.QueryDocumentSnapshot;
type LifeMapEventContext = functions.EventContext<{ eventId: string }>;

admin.initializeApp();
const db = admin.firestore();
const VERSION = process.env.K_REVISION || process.env.GIT_SHA || 'dev';

function now(): number { return Date.now(); }

function sendJson(res: HttpsResponse, status: number, body: unknown): void {
  res.set('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function applyCors(req: HttpsRequest, res: HttpsResponse): boolean {
  res.set('Access-Control-Allow-Origin', process.env.ASSET_FACTORY_ALLOWED_ORIGIN || '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function safeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 50);
}

function optionalNumberRecord(value: unknown): Record<string, number> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) output[key] = raw;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function cleanFirestoreData<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRuntimeStoreWriteBlocked(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes('PERMISSION_DENIED') || message.includes('Missing or insufficient permissions');
}

function newDocId(collection: string): string {
  return db.collection(collection).doc().id;
}

export const assetFactoryHealth = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  const status: SystemStatusRecord = {
    status: 'healthy',
    service: 'asset-factory',
    version: VERSION,
    updatedAt: now(),
    checks: { firestore: 'unchecked', functions: true, storageRulesPath: 'storage.rules', firestoreRulesPath: 'firestore.rules' },
  };

  try {
    await db.collection('systemStatus').doc('asset-factory').set(status, { merge: true });
    status.checks.firestore = true;
  } catch (error) {
    console.error('assetFactoryHealth status write failed', error);
    status.status = 'degraded';
    status.checks.firestore = `status-write-failed: ${errorMessage(error)}`;
  }

  return sendJson(res, 200, { ok: true, ...status });
});

export const createAssetRequest = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const body = objectPayload(req.body);
    const projectId = requireString(body.projectId, 'projectId');
    const assetType = requireString(body.assetType, 'assetType');
    const source = optionalString(body.source) || 'api';
    const format = optionalString(body.format) || 'unknown';
    const userId = optionalString(body.userId);
    const anonymousSessionId = optionalString(body.anonymousSessionId);
    if (!userId && !anonymousSessionId) throw new Error('userId or anonymousSessionId is required');

    const assetId = optionalString(body.assetId) || newDocId('assetFactoryRequests');
    const timestamp = now();
    const storageOwner = userId || anonymousSessionId || 'unknown';
    const storagePath = `assets/${storageOwner}/${assetId}/manifest.json`;
    const asset: AssetFactoryRequest = {
      assetId, userId, anonymousSessionId, projectId, assetType, format: format as AssetFactoryRequest['format'],
      status: 'queued', storagePath, source, prompt: optionalString(body.prompt), tags: safeTags(body.tags),
      dimensions: optionalNumberRecord(body.dimensions), version: '1.0.0', lifecycleState: 'queued', createdAt: timestamp, updatedAt: timestamp,
    };
    const queueItem: AssetFactoryQueueItem = {
      queueId: newDocId('assetFactoryQueue'), assetId, userId, anonymousSessionId, status: 'queued', attempts: 0, createdAt: timestamp, updatedAt: timestamp,
    };

    try {
      await db.runTransaction(async (transaction: FirestoreTransaction) => {
        transaction.set(db.collection('assetFactoryRequests').doc(assetId), cleanFirestoreData(asset));
        transaction.set(db.collection('assetFactoryQueue').doc(queueItem.queueId), cleanFirestoreData(queueItem));
        transaction.set(db.collection('assetManifests').doc(assetId), cleanFirestoreData({ assetId, projectId, assetType, format, storagePath, createdAt: timestamp, updatedAt: timestamp }));
      });
    } catch (error) {
      if (!isRuntimeStoreWriteBlocked(error)) throw error;
      console.error('createAssetRequest persistence degraded', error);
      return sendJson(res, 202, { ok: true, degraded: true, assetId, queueId: queueItem.queueId, status: asset.status, storagePath });
    }

    return sendJson(res, 202, { ok: true, assetId, queueId: queueItem.queueId, status: asset.status, storagePath });
  } catch (error) {
    console.error('createAssetRequest failed', error);
    return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' });
  }
});

export const getAssetStatus = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  const assetId = req.path.split('/').filter(Boolean).pop() || optionalString(req.query.assetId);
  if (!assetId) return sendJson(res, 400, { ok: false, error: 'assetId is required' });
  try {
    const doc = await db.collection('assetFactoryRequests').doc(assetId).get();
    if (!doc.exists) return sendJson(res, 404, { ok: false, error: 'Asset not found', assetId });
    return sendJson(res, 200, { ok: true, asset: doc.data() });
  } catch (error) {
    if (!isRuntimeStoreWriteBlocked(error)) throw error;
    console.error('getAssetStatus persistence degraded', error);
    return sendJson(res, 200, { ok: true, degraded: true, asset: { assetId, status: 'queued', lifecycleState: 'queued', source: 'degraded-status-fallback', updatedAt: now() } });
  }
});

export const ingestLifeMapEvent = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const body = objectPayload(req.body);
    const eventId = optionalString(body.eventId) || newDocId('lifeMapEvents');
    const event: LifeMapEvent = {
      eventId, userId: requireString(body.userId, 'userId'), timestamp: typeof body.timestamp === 'number' ? body.timestamp : now(),
      source: optionalString(body.source) || 'api', type: requireString(body.type, 'type'), payload: objectPayload(body.payload), linkedAssetId: optionalString(body.linkedAssetId),
    };
    try {
      await db.collection('lifeMapEvents').doc(eventId).set(cleanFirestoreData(event), { merge: false });
    } catch (error) {
      if (!isRuntimeStoreWriteBlocked(error)) throw error;
      console.error('ingestLifeMapEvent persistence degraded', error);
      return sendJson(res, 202, { ok: true, degraded: true, eventId, status: 'accepted' });
    }
    return sendJson(res, 202, { ok: true, eventId, status: 'accepted' });
  } catch (error) {
    console.error('ingestLifeMapEvent failed', error);
    return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' });
  }
});

export const processLifeMapEvent = functions.firestore
  .document('lifeMapEvents/{eventId}')
  .onCreate(async (snap: LifeMapEventSnapshot, context: LifeMapEventContext) => {
    const event = snap.data() as LifeMapEvent;
    const { eventId } = context.params;
    const { userId } = event;
    console.log(`[${eventId}] Processing new LifeMapEvent for user ${userId}...`);
    const lifeMapRef = db.collection('lifeMaps').doc(userId);
    try {
      await db.runTransaction(async (transaction: FirestoreTransaction) => {
        const lifeMapDoc = await transaction.get(lifeMapRef);
        let lifeMap: LifeMap;
        if (!lifeMapDoc.exists) {
          lifeMap = { lifeMapId: userId, userId, version: 0, status: 'processing', createdAt: now(), updatedAt: now(), chapters: [], contentHash: '' };
        } else {
          lifeMap = lifeMapDoc.data() as LifeMap;
        }
        if (lifeMap.chapters.some(c => c.events.some(e => e.eventId === eventId))) return;
        const enrichedEvent: EnrichedEvent = { ...event, enrichmentVersion: 'asset-factory-v1' };
        const newChapter: LifeMapChapter = { chapterId: eventId, title: `Event at ${event.timestamp}`, startTime: event.timestamp, endTime: event.timestamp, events: [enrichedEvent] };
        lifeMap.chapters.push(newChapter);
        lifeMap.chapters.sort((a, b) => a.startTime - b.startTime);
        lifeMap.version = (lifeMap.version || 0) + 1;
        lifeMap.updatedAt = now();
        lifeMap.status = 'processing';
        lifeMap.contentHash = deterministicHash(lifeMap.chapters);
        transaction.set(lifeMapRef, cleanFirestoreData(lifeMap));
      });
      return null;
    } catch (error) {
      console.error(`[${eventId}] Failed to process event for user ${userId}.`, error);
      await lifeMapRef.set({ status: 'failed', updatedAt: now() }, { merge: true }).catch((err: unknown) => console.error(`[${eventId}] Could not set failed status.`, err));
      return null;
    }
  });
