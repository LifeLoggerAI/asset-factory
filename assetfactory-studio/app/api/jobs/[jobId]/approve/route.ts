import { NextRequest, NextResponse } from 'next/server';
import { approveAsset } from '@/lib/server/assetFactoryStore';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json();

  return NextResponse.json(await approveAsset(jobId, body));
}