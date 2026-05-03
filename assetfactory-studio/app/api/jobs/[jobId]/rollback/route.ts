import { NextRequest, NextResponse } from 'next/server'; import { rollbackAsset } from '@/lib/server/assetFactoryStore';
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) { const { jobId } = await params; const b = await req.json(); return NextResponse.json(await rollbackAsset(jobId, b.versionId ?? 'latest')); }
