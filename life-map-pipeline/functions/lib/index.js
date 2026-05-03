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
exports.processLifeMapEvent = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const hash_1 = require("./hash");
admin.initializeApp();
const db = admin.firestore();
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
                console.log(`[${eventId}] No existing LifeMap found for user ${userId}. Creating a new one.`);
                lifeMap = {
                    lifeMapId: userId,
                    userId,
                    version: 0,
                    status: 'processing',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    chapters: [],
                    contentHash: '',
                };
            }
            else {
                lifeMap = lifeMapDoc.data();
                console.log(`[${eventId}] Found existing LifeMap for user ${userId} at version ${lifeMap.version}.`);
            }
            if (lifeMap.chapters.some(c => c.events.some(e => e.eventId === eventId))) {
                console.warn(`[${eventId}] Event already processed. Skipping.`);
                return;
            }
            const enrichedEvent = {
                ...event,
            };
            const newChapter = {
                chapterId: eventId,
                title: `Event at ${event.timestamp}`,
                startTime: event.timestamp,
                endTime: event.timestamp,
                events: [enrichedEvent],
            };
            lifeMap.chapters.push(newChapter);
            lifeMap.chapters.sort((a, b) => a.startTime - b.startTime);
            lifeMap.version = (lifeMap.version || 0) + 1;
            lifeMap.updatedAt = Date.now();
            lifeMap.status = 'processing';
            lifeMap.contentHash = (0, hash_1.deterministicHash)(lifeMap.chapters);
            transaction.set(lifeMapRef, lifeMap);
            console.log(`[${eventId}] Transaction successfully committed. LifeMap version is now ${lifeMap.version}.`);
        });
        console.log(`[${eventId}] LifeMap for user ${userId} updated. A Replay Job can now be triggered.`);
        return null;
    }
    catch (error) {
        console.error(`[${eventId}] CRITICAL: Failed to process event for user ${userId}.`, error);
        await lifeMapRef.update({ status: 'failed', updatedAt: Date.now() }).catch(err => {
            console.error(`[${eventId}] FATAL: Could not even set LifeMap status to failed.`, err);
        });
        return null;
    }
});
