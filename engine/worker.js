
import { db } from '../assetfactory-studio/lib/firebase';
import { hashFile, combineHashes } from '../assetfactory-studio/lib/hashing';
import { logger } from '../assetfactory-studio/lib/logger';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Storage } from '@google-cloud/storage';
import config from './config.json';

const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'asset-factory-outputs';

const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const WORKER_ID = `worker_${crypto.randomBytes(8).toString('hex')}`;

export async function getDeterministicNarrative(prompt, seed) {
    const seedBuffer = Buffer.from(seed, 'hex');
    const promptBuffer = Buffer.from(prompt);
    const combinedBuffer = Buffer.concat([seedBuffer, promptBuffer]);
    const outputHash = crypto.createHash('sha256').update(combinedBuffer).digest('hex');
    const sceneCount = (parseInt(outputHash.substring(0, 2), 16) % 3) + 2;
    const scenes = [];
    for (let i = 0; i < sceneCount; i++) {
        const sceneHash = crypto.createHash('sha256').update(`${outputHash}:${i}`).digest('hex');
        scenes.push({
            scene: i + 1,
            description: `A scene derived from hash segment ${sceneHash.substring(i, i + 10)}.`,
            duration: (parseInt(sceneHash.substring(10, 12), 16) % 4) + 2,
        });
    }
    return Promise.resolve({
        theme: "Corporate Explainer (Deterministic)",
        scenes,
        music: {
            style: "Uplifting and optimistic corporate track.",
            tempo: `${(parseInt(outputHash.substring(12, 14), 16) % 40) + 100}bpm`,
        }
    });
}

async function claimAndProcessJob(jobId, jobData) {
    const jobRef = db.collection('jobs').doc(jobId);
    try {
        const result = await db.runTransaction(async (transaction) => {
            const jobDoc = await transaction.get(jobRef);
            if (!jobDoc.exists) {
                logger.warn(`Job ${jobId} no longer exists.`, { workerId: WORKER_ID, jobId });
                return null;
            }
            if (jobDoc.data().status !== 'queued') {
                logger.info(`Job ${jobId} was already claimed.`, { workerId: WORKER_ID, jobId, status: jobDoc.data().status });
                return null;
            }
            transaction.update(jobRef, {
                status: 'processing',
                workerId: WORKER_ID,
                claimedAt: new Date().toISOString()
            });
            return jobDoc.data();
        });
        if (result) {
            logger.info(`Successfully claimed job ${jobId}.`, { workerId: WORKER_ID, jobId });
            await processJob(jobId, result);
        }
    } catch (error) {
        logger.error(`Transaction to claim job ${jobId} failed.`, { workerId: WORKER_ID, jobId, error: error.message });
    }
}

async function processJob(jobId, job) {
    const { tenantId } = job;
    const jobRef = db.collection('jobs').doc(jobId);
    const localOutputDir = path.join(OUTPUTS_DIR, tenantId, jobId);
    const startTime = Date.now();

    try {
        await fs.ensureDir(localOutputDir);

        let seed = job.input?.seed || crypto.randomBytes(32).toString('hex');
        if (!job.input?.seed) {
             logger.info(`No seed provided for job. Generated new seed.`, { workerId: WORKER_ID, jobId, seed });
        }
        const prompt = job.input?.prompt || 'No prompt provided.';

        const narrative = await getDeterministicNarrative(prompt, seed);

        const fileContent = JSON.stringify(narrative, null, 2);
        const localOutputFilePath = path.join(localOutputDir, 'narrative.json');
        await fs.writeFile(localOutputFilePath, fileContent);

        const gcsFilePath = `${tenantId}/${jobId}/narrative.json`;
        const bucket = storage.bucket(BUCKET_NAME);
        await bucket.upload(localOutputFilePath, {
            destination: gcsFilePath,
            metadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=31536000',
            },
        });
        logger.info('Successfully uploaded asset to GCS.', { workerId: WORKER_ID, jobId, bucket: BUCKET_NAME, path: gcsFilePath });
        
        const fileBuffer = await fs.readFile(localOutputFilePath);
        const fileHash = hashFile(fileBuffer);
        const gcsUri = `gs://${BUCKET_NAME}/${gcsFilePath}`;
        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFilePath}`;
        const outputFiles = [{ 
            type: 'json', 
            hash: fileHash,
            gcsUri, 
            publicUrl
        }];
        const fullOutputHash = combineHashes(outputFiles.map(f => f.hash));

        const manifest = {
            jobId, tenantId,
            input: { prompt: job.input?.prompt, seed },
            outputFiles, fullOutputHash,
            modelVersions: { narrativeModel: config.narrativeModel.version }
        };
        const manifestRef = await db.collection('manifests').add(manifest);

        const processingTimeMs = Date.now() - startTime;
        await jobRef.update({
            status: 'complete',
            outputManifestId: manifestRef.id,
            completedAt: new Date().toISOString(),
            processingTimeMs,
        });

        logger.info(`✅ Successfully completed deterministic job.`, { workerId: WORKER_ID, jobId, tenantId, processingTimeMs, gcsUri });

    } catch (error) {
        logger.error(`❌ FAILURE processing job.`, { workerId: WORKER_ID, jobId, tenantId, error: error.message });
        await jobRef.update({ status: 'failed', lastError: error.message });
    } finally {
        await fs.remove(localOutputDir);
        logger.info('Cleaned up local temporary directory.', { workerId: WORKER_ID, jobId, path: localOutputDir });
    }
}

function watchForJobs() {
    db.collection('jobs').where('status', '==', 'queued').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                logger.info(`Detected new job.`, { workerId: WORKER_ID, jobId: change.doc.id });
                claimAndProcessJob(change.doc.id, change.doc.data());
            }
        });
    });
}

logger.info(`🔥 Idempotent Deterministic Worker started.`, { workerId: WORKER_ID, config });
watchForJobs();
