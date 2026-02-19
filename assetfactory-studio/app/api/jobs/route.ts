
import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { authenticateAndAuthorize } from '../../../lib/auth';

// --- Rate Limiting (In-Memory) ---
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per 15 minutes per user

interface RequestLog {
    [ip: string]: number[];
}
const requestLog: RequestLog = {};

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const userRequests = requestLog[ip] || [];

    // Filter out requests that are outside the time window
    const requestsInWindow = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (requestsInWindow.length >= MAX_REQUESTS_PER_WINDOW) {
        return true; // Rate limit exceeded
    }

    // Log the new request
    requestsInWindow.push(now);
    requestLog[ip] = requestsInWindow;

    return false;
}
// --- End Rate Limiting ---


export async function POST(req: NextRequest) {
    try {
        // --- Rate Limiting Check ---
        const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
        if (isRateLimited(ip)) {
            console.warn(`[API/JOBS] Rate limit exceeded for IP: ${ip}`);
            return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
        }

        const { tenantId } = await authenticateAndAuthorize(req);
        if (!tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const inputData = await req.json();

        // --- Basic Input Validation ---
        if (!inputData.prompt || typeof inputData.prompt !== 'string') {
            return NextResponse.json({ error: 'Invalid input: "prompt" is required and must be a string.' }, { status: 400 });
        }
        
        const newJob = {
            tenantId,
            status: "queued",
            createdAt: new Date().toISOString(),
            input: inputData,
            retryCount: 0,
        };

        const jobRef = await db.collection('jobs').add(newJob);

        console.log(`[API/JOBS] Job submitted successfully for tenant ${tenantId}. Job ID: ${jobRef.id}`);

        return NextResponse.json({
            message: 'Job submitted successfully',
            jobId: jobRef.id,
            status: 'queued'
        }, { status: 202 });

    } catch (error: any) {
        console.error('[API/JOBS] Error submitting job:', error);
        if (error.message.includes('Authorization') || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { tenantId } = await authenticateAndAuthorize(req);
        if (!tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        
        const { searchParams } = new URL(req.url);
        const jobId = searchParams.get('jobId');
        
        if (jobId) {
            const jobDoc = await db.collection('jobs').doc(jobId).get();
            if (!jobDoc.exists || jobDoc.data()?.tenantId !== tenantId) {
                return NextResponse.json({ error: "Job not found" }, { status: 404 });
            }
            return NextResponse.json({ id: jobDoc.id, ...jobDoc.data() }, { status: 200 });
        } else {
             const jobsSnapshot = await db.collection('jobs')
                .where('tenantId', '==', tenantId)
                .orderBy('createdAt', 'desc')
                .limit(25)
                .get();

            if (jobsSnapshot.empty) {
                return NextResponse.json([], { status: 200 });
            }

            const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return NextResponse.json(jobs, { status: 200 });
        }
    } catch (error: any) {
        console.error('[API/JOBS] Error fetching jobs:', error);
         if (error.message.includes('Authorization') || error.message.includes('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
