
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '../../../../../lib/firebase-admin';
import fs from 'fs/promises';
import path from 'path';

const db = admin.firestore();
const OUTPUTS_DIR = path.resolve(process.cwd(), 'engine', 'outputs');

/**
 * Handles GET requests to download a generated asset.
 * URL: /api/assets/{jobId}
 */
async function handler(req: NextRequest, { params }: { params: { jobId: string } }) {
    const { jobId } = params;

    // In a real app, you'd get the tenantId from the authenticated user's session.
    // For this audit, we'll assume a placeholder or derive it if possible.
    // const { tenantId } = await getAuthFromRequest(req); 

    try {
        console.log(`[Asset Download] Received request for job: ${jobId}`);

        // 1. Find the manifest for the job.
        const manifestSnapshot = await db.collection('manifests').where('jobId', '==', jobId).limit(1).get();

        if (manifestSnapshot.empty) {
            console.error(`[Asset Download] Manifest for job ${jobId} not found.`);
            return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
        }

        const manifest = manifestSnapshot.docs[0].data();
        const tenantId = manifest.tenantId;

        // In a real app, you would add a security check here:
        // if (manifest.tenantId !== tenantId) {
        //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        // }

        if (!manifest.outputFiles || manifest.outputFiles.length === 0) {
            return NextResponse.json({ error: 'Manifest contains no files to download.' }, { status: 404 });
        }

        // 2. Locate the primary asset file.
        // For this audit, we'll assume the first text file is what we want.
        const primaryAsset = manifest.outputFiles.find(f => f.type === 'text');

        if (!primaryAsset || !primaryAsset.path) {
            return NextResponse.json({ error: 'Primary asset file path not found in manifest.' }, { status: 404 });
        }

        // The path in the manifest is absolute, so we use it directly.
        const assetPath = primaryAsset.path;

        // 3. Read the file from the filesystem.
        console.log(`[Asset Download] Reading asset from path: ${assetPath}`);
        const fileBuffer = await fs.readFile(assetPath);

        // 4. Return the file as a response.
        const headers = new Headers();
        headers.set('Content-Type', 'text/plain');
        headers.set('Content-Disposition', `attachment; filename="asset_${jobId}.txt"`);

        console.log(`[Asset Download] ✅ Successfully serving asset for job ${jobId}.`);
        return new NextResponse(fileBuffer, { status: 200, headers });

    } catch (error) {
        console.error(`[Asset Download] ❌ Failed to retrieve asset for job ${jobId}:`, error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export { handler as GET };
