"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLifeMapEvent = exports.ingestLifeMapEvent = exports.getAssetStatus = exports.createAssetRequest = exports.assetFactoryHealth = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const hash_1 = require("./hash");
admin.initializeApp();
const db = admin.firestore();
const VERSION = process.env.K_REVISION || process.env.GIT_SHA || 'dev';
function now() { return Date.now(); }
function sendJson(res, status, body) {
    res.set('Cache-Control', 'no-store');
    res.status(status).json(body);
}
function applyCors(req, res) {
    res.set('Access-Control-Allow-Origin', process.env.ASSET_FACTORY_ALLOWED_ORIGIN || '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    return false;
}
function requireString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`${field} is required`);
    return value.trim();
}
function optionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function requireSessionId(value) {
    if (!value)
        return undefined;
    if (value.length < 12)
        throw new Error('anonymousSessionId must be at least 12 characters');
    return value;
}
function safeTags(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 50);
}
function optionalNumberRecord(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'number' && Number.isFinite(raw))
            output[key] = raw;
    }
    return Object.keys(output).length > 0 ? output : undefined;
}
function objectPayload(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function cleanFirestoreData(data) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isRuntimeStoreWriteBlocked(error) {
    const message = errorMessage(error);
    return message.includes('PERMISSION_DENIED') || message.includes('Missing or insufficient permissions');
}
function isAuthError(error) {
    const message = errorMessage(error);
    return message === 'authentication required' || message === 'asset owner mismatch' || message === 'anonymousSessionId mismatch';
}
function authErrorStatus(error) {
    return errorMessage(error) === 'authentication required' ? 401 : 403;
}
function newDocId(collection) {
    return db.collection(collection).doc().id;
}
function bearerToken(req) {
    const raw = req.get('authorization') || req.get('Authorization');
    if (!raw)
        return undefined;
    const [scheme, token] = raw.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
async function authenticatedUid(req) {
    const token = bearerToken(req);
    if (!token)
        return undefined;
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
}
async function assertUserAccess(req, userId) {
    if (!userId)
        return;
    const uid = await authenticatedUid(req);
    if (!uid)
        throw new Error('authentication required');
    if (uid !== userId)
        throw new Error('asset owner mismatch');
}
function assertAnonymousSessionAccess(expected, provided) {
    if (!expected)
        return;
    if (!provided || provided !== expected)
        throw new Error('anonymousSessionId mismatch');
}
function createInitialAssetManifest(input) {
    const ownerId = input.userId || input.anonymousSessionId || 'anonymous';
    return {
        id: input.assetId,
        assetId: input.assetId,
        slug: input.assetId,
        title: `Asset ${input.assetId}`,
        description: 'Queued URAI asset factory request.',
        assetType: input.assetType,
        symbolicCategory: input.projectId,
        visualLayer: 'ui',
        environment: input.projectId,
        geometryType: 'none',
        version: '1.0.0',
        status: 'queued',
        visibility: input.userId ? 'private-user' : 'internal-only',
        ownerId,
        userId: input.userId,
        anonymousSessionId: input.anonymousSessionId,
        projectId: input.projectId,
        format: input.format,
        storagePath: input.storagePath,
        source: input.source,
        permissions: {
            ownerId,
            publicReadable: false,
            adminOnly: false,
            containsUserData: Boolean(input.userId),
            containsUserMemoryData: false,
            sanitizedForDemo: false,
        },
        createdBy: input.userId || 'anonymous-session',
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
        tags: input.tags,
        dependencies: [],
        compatibleScenes: [input.projectId],
        performanceTier: 'mobile-mid',
        mobileReady: false,
        arReady: false,
        vrReady: false,
        xrReady: false,
        spatialReady: false,
        productionReady: false,
        validation: {
            schemaValid: true,
            filesExist: false,
            urlsReachable: false,
            noPlaceholderText: true,
            noDebugText: true,
            noPrivateData: !input.userId,
            errors: [],
            warnings: ['Asset request has not been rendered or approved yet.'],
        },
    };
}
exports.assetFactoryHealth = functions.https.onRequest(async (req, res) => {
    if (applyCors(req, res))
        return;
    if (req.method !== 'GET')
        return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    const status = {
        status: 'healthy',
        service: 'asset-factory',
        version: VERSION,
        updatedAt: now(),
        checks: { firestore: 'unchecked', functions: true, storageRulesPath: 'storage.rules', firestoreRulesPath: 'firestore.rules' },
    };
    try {
        await db.collection('systemStatus').doc('asset-factory').set(status, { merge: true });
        status.checks.firestore = true;
    }
    catch (error) {
        console.error('assetFactoryHealth status write failed', error);
        status.status = 'degraded';
        status.checks.firestore = `status-write-failed: ${errorMessage(error)}`;
    }
    return sendJson(res, 200, { ok: true, ...status });
});
exports.createAssetRequest = functions.https.onRequest(async (req, res) => {
    if (applyCors(req, res))
        return;
    if (req.method !== 'POST')
        return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    try {
        const body = objectPayload(req.body);
        const projectId = requireString(body.projectId, 'projectId');
        const assetType = requireString(body.assetType, 'assetType');
        const source = optionalString(body.source) || 'api';
        const format = optionalString(body.format) || 'unknown';
        const userId = optionalString(body.userId);
        const anonymousSessionId = requireSessionId(optionalString(body.anonymousSessionId));
        if (!userId && !anonymousSessionId)
            throw new Error('userId or anonymousSessionId is required');
        await assertUserAccess(req, userId);
        const assetId = optionalString(body.assetId) || newDocId('assetFactoryRequests');
        const timestamp = now();
        const storageOwner = userId || anonymousSessionId || 'unknown';
        const storagePath = `assets/${storageOwner}/${assetId}/manifest.json`;
        const tags = safeTags(body.tags);
        const asset = {
            assetId, userId, anonymousSessionId, projectId, assetType, format: format,
            status: 'queued', storagePath, source, prompt: optionalString(body.prompt), tags,
            dimensions: optionalNumberRecord(body.dimensions), version: '1.0.0', lifecycleState: 'queued', createdAt: timestamp, updatedAt: timestamp,
        };
        const queueItem = {
            queueId: newDocId('assetFactoryQueue'), assetId, userId, anonymousSessionId, status: 'queued', attempts: 0, createdAt: timestamp, updatedAt: timestamp,
        };
        const manifest = createInitialAssetManifest({ assetId, projectId, assetType, format, storagePath, userId, anonymousSessionId, source, tags, timestamp });
        try {
            await db.runTransaction(async (transaction) => {
                transaction.set(db.collection('assetFactoryRequests').doc(assetId), cleanFirestoreData(asset));
                transaction.set(db.collection('assetFactoryQueue').doc(queueItem.queueId), cleanFirestoreData(queueItem));
                transaction.set(db.collection('assetManifests').doc(assetId), cleanFirestoreData(manifest));
            });
        }
        catch (error) {
            if (!isRuntimeStoreWriteBlocked(error))
                throw error;
            console.error('createAssetRequest persistence degraded', error);
            return sendJson(res, 202, { ok: true, degraded: true, assetId, queueId: queueItem.queueId, status: asset.status, storagePath });
        }
        return sendJson(res, 202, { ok: true, assetId, queueId: queueItem.queueId, status: asset.status, storagePath });
    }
    catch (error) {
        if (isAuthError(error))
            return sendJson(res, authErrorStatus(error), { ok: false, error: errorMessage(error) });
        console.error('createAssetRequest failed', error);
        return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' });
    }
});
exports.getAssetStatus = functions.https.onRequest(async (req, res) => {
    if (applyCors(req, res))
        return;
    if (req.method !== 'GET')
        return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    const assetId = req.path.split('/').filter(Boolean).pop() || optionalString(req.query.assetId);
    if (!assetId)
        return sendJson(res, 400, { ok: false, error: 'assetId is required' });
    try {
        const doc = await db.collection('assetFactoryRequests').doc(assetId).get();
        if (!doc.exists)
            return sendJson(res, 404, { ok: false, error: 'Asset not found', assetId });
        const asset = doc.data();
        await assertUserAccess(req, asset.userId);
        assertAnonymousSessionAccess(asset.anonymousSessionId, requireSessionId(optionalString(req.query.anonymousSessionId)));
        return sendJson(res, 200, { ok: true, asset });
    }
    catch (error) {
        if (isAuthError(error))
            return sendJson(res, authErrorStatus(error), { ok: false, error: errorMessage(error) });
        if (!isRuntimeStoreWriteBlocked(error))
            throw error;
        console.error('getAssetStatus persistence degraded', error);
        return sendJson(res, 200, { ok: true, degraded: true, asset: { assetId, status: 'queued', lifecycleState: 'queued', source: 'degraded-status-fallback', updatedAt: now() } });
    }
});
exports.ingestLifeMapEvent = functions.https.onRequest(async (req, res) => {
    if (applyCors(req, res))
        return;
    if (req.method !== 'POST')
        return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    try {
        const body = objectPayload(req.body);
        const eventId = optionalString(body.eventId) || newDocId('lifeMapEvents');
        const event = {
            eventId, userId: requireString(body.userId, 'userId'), timestamp: typeof body.timestamp === 'number' ? body.timestamp : now(),
            source: optionalString(body.source) || 'api', type: requireString(body.type, 'type'), payload: objectPayload(body.payload), linkedAssetId: optionalString(body.linkedAssetId),
        };
        await assertUserAccess(req, event.userId);
        try {
            await db.collection('lifeMapEvents').doc(eventId).set(cleanFirestoreData(event), { merge: false });
        }
        catch (error) {
            if (!isRuntimeStoreWriteBlocked(error))
                throw error;
            console.error('ingestLifeMapEvent persistence degraded', error);
            return sendJson(res, 202, { ok: true, degraded: true, eventId, status: 'accepted' });
        }
        return sendJson(res, 202, { ok: true, eventId, status: 'accepted' });
    }
    catch (error) {
        if (isAuthError(error))
            return sendJson(res, authErrorStatus(error), { ok: false, error: errorMessage(error) });
        console.error('ingestLifeMapEvent failed', error);
        return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' });
    }
});
exports.processLifeMapEvent = functions.firestore
    .document('lifeMapEvents/{eventId}')
    .onCreate(async (snap, context) => {
    const event = snap.data();
    const { eventId } = context.params;
    const { userId } = event;
    console.log(`[${eventId}] Processing new LifeMapEvent for user ${userId}...`);
    const lifeMapRef = db.collection('lifeMaps').doc(userId);
    try {
        await db.runTransaction(async (transaction) => {
            const lifeMapDoc = await transaction.get(lifeMapRef);
            let lifeMap;
            if (!lifeMapDoc.exists) {
                lifeMap = { lifeMapId: userId, userId, version: 0, status: 'processing', createdAt: now(), updatedAt: now(), chapters: [], contentHash: '' };
            }
            else {
                lifeMap = lifeMapDoc.data();
            }
            if (lifeMap.chapters.some(c => c.events.some(e => e.eventId === eventId)))
                return;
            const enrichedEvent = { ...event, enrichmentVersion: 'asset-factory-v1' };
            const newChapter = { chapterId: eventId, title: `Event at ${event.timestamp}`, startTime: event.timestamp, endTime: event.timestamp, events: [enrichedEvent] };
            lifeMap.chapters.push(newChapter);
            lifeMap.chapters.sort((a, b) => a.startTime - b.startTime);
            lifeMap.version = (lifeMap.version || 0) + 1;
            lifeMap.updatedAt = now();
            lifeMap.status = 'processing';
            lifeMap.contentHash = (0, hash_1.deterministicHash)(lifeMap.chapters);
            transaction.set(lifeMapRef, cleanFirestoreData(lifeMap));
        });
        return null;
    }
    catch (error) {
        console.error(`[${eventId}] Failed to process event for user ${userId}.`, error);
        await lifeMapRef.set({ status: 'failed', updatedAt: now() }, { merge: true }).catch((err) => console.error(`[${eventId}] Could not set failed status.`, err));
        return null;
    }
});
