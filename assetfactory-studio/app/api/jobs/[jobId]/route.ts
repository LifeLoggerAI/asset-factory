import { NextRequest, NextResponse } from 'next/server';
import { findJob, updateJob } from '@/lib/server/assetFactoryStore';
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) { const { jobId } = await params; const j = await findJob(jobId); if (!j) return NextResponse.json({ error: 'Job not found' }, { status: 404 }); return NextResponse.json(j); }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) { const { jobId } = await params; const p = await req.json(); const j = await updateJob(jobId, p); if (!j) return NextResponse.json({ error: 'Job not found' }, { status: 404 }); return NextResponse.json(j); }
