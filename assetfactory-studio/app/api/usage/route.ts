
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase'; 
import { authenticateAndAuthorize } from '../../../lib/auth';

export async function GET(req: NextRequest) {
    try {
        const { tenantId } = await authenticateAndAuthorize(req);
        if (!tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const jobsSnapshot = await db.collection('jobs')
            .where('tenantId', '==', tenantId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        if (jobsSnapshot.empty) {
            return NextResponse.json([], { status: 200 });
        }

        const jobs = jobsSnapshot.docs.map(doc => doc.data());

        return NextResponse.json(jobs, { status: 200 });

    } catch (error: any) {
        console.error('[API/USAGE] Error fetching usage data:', error);
        if (error.message.includes('Authorization') || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
