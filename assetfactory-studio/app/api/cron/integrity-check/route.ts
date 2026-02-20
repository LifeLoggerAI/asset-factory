
import { NextRequest, NextResponse } from 'next/server';
import { verifySnapshotIntegrity } from '../../../../../engine/integrity-checker.js';

// This is a simplified cron endpoint. In a real-world scenario, 
// you would protect this with a secret header or an IP whitelist.
export async function GET(req: NextRequest) {
    // Check for a secret to prevent unauthorized runs
    const cronSecret = req.headers.get('X-Cron-Secret');
    if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting nightly snapshot integrity check...');
        await verifySnapshotIntegrity();
        console.log('[Cron] Snapshot integrity check finished.');
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        console.error('[Cron] Error during snapshot integrity check:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
