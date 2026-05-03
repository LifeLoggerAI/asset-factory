import { NextRequest, NextResponse } from 'next/server';
import { readGeneratedAsset } from '@/lib/server/assetFactoryStore';
import { validateFileName } from '@/lib/server/assetFactoryValidation';

export async function GET(_req: NextRequest, { params }: { params: { file: string } }) {
  if (!validateFileName(params.file)) return NextResponse.json({ error: 'invalid file' }, { status: 400 });
  const b = await readGeneratedAsset(params.file);
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const ct = params.file.endsWith('.json') ? 'application/json' : params.file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
  return new NextResponse(b, { headers: { 'content-type': ct } });
}
