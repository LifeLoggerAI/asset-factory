
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { authenticateAndAuthorize } from '../../../lib/auth';

export async function GET(req: NextRequest) {
    try {
        // Authenticate and get the tenantId to scope all subsequent queries
        const { tenantId } = await authenticateAndAuthorize(req);
        if (!tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        // --- FIXED: Queries are now scoped by tenantId ---
        const recentJobsSnapshot = await db.collection('jobs')
            .where('tenantId', '==', tenantId)
            .where('createdAt', '>', fiveMinutesAgo.toISOString())
            .get();
        
        const dlqSnapshot = await db.collection('dead_letter_jobs')
            .where('tenantId', '==', tenantId)
            .get();
        // --- END FIX ---

        const recentJobs = recentJobsSnapshot.docs.map(doc => doc.data());
        const completedJobs = recentJobs.filter(job => job.status === 'complete');
        const failedJobs = recentJobs.filter(job => job.status === 'failed');

        const totalCompleted = completedJobs.length;
        const totalFailed = failedJobs.length;
        const totalRecent = totalCompleted + totalFailed;

        const jobsPerMinute = totalRecent / 5;
        const failureRate = totalRecent > 0 ? totalFailed / totalRecent : 0;
        const dlqSize = dlqSnapshot.size;

        const totalCost = completedJobs.reduce((sum, job) => sum + (job.cost || 0), 0);
        const avgCostPerJob = totalCompleted > 0 ? totalCost / totalCompleted : 0;

        const totalProcessingTime = completedJobs.reduce((sum, job) => sum + (job.processingTimeMs || 0), 0);
        const avgProcessingTimeMs = totalCompleted > 0 ? totalProcessingTime / totalCompleted : 0;

        const metrics = {
            jobsPerMinute,
            failureRate,
            dlqSize,
            avgCostPerJob,
            avgProcessingTimeMs,
        };

        return NextResponse.json(metrics, { status: 200 });

    } catch (error: any) {
        console.error('[API/DASHBOARD] Error fetching dashboard data:', error);
        if (error.message.includes('Authorization') || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
