import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { LifeMap, LifeMapEvent, EnrichedEvent, LifeMapChapter } from '../lib/lifemap.types';
import { deterministicHash } from './hash';

admin.initializeApp();
const db = admin.firestore();

export const processLifeMapEvent = functions.firestore
  .document('lifeMapEvents/{eventId}')
  .onCreate(async (snap, context) => {
    const event = snap.data() as LifeMapEvent;
    const { eventId } = context.params;
    const { userId } = event;

    console.log(`[${eventId}] Processing new LifeMapEvent for user ${userId}...`);

    const lifeMapRef = db.collection('lifeMaps').doc(userId);

    try {
        await db.runTransaction(async (transaction) => {
            const lifeMapDoc = await transaction.get(lifeMapRef);

            let lifeMap: LifeMap;

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
            } else {
                lifeMap = lifeMapDoc.data() as LifeMap;
                console.log(`[${eventId}] Found existing LifeMap for user ${userId} at version ${lifeMap.version}.`);
            }

            if (lifeMap.chapters.some(c => c.events.some(e => e.eventId === eventId))) {
                console.warn(`[${eventId}] Event already processed. Skipping.`);
                return;
            }

            const enrichedEvent: EnrichedEvent = {
                ...event,
            };

            const newChapter: LifeMapChapter = {
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

            lifeMap.contentHash = deterministicHash(lifeMap.chapters);

            transaction.set(lifeMapRef, lifeMap);
            console.log(`[${eventId}] Transaction successfully committed. LifeMap version is now ${lifeMap.version}.`);
        });

        console.log(`[${eventId}] LifeMap for user ${userId} updated. A Replay Job can now be triggered.`);

        return null;

    } catch (error) {
        console.error(`[${eventId}] CRITICAL: Failed to process event for user ${userId}.`, error);
        
        await lifeMapRef.update({ status: 'failed', updatedAt: Date.now() }).catch(err => {
            console.error(`[${eventId}] FATAL: Could not even set LifeMap status to failed.`, err);
        });

        return null;
    }
  });