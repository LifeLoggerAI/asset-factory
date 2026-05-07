import { NextRequest, NextResponse } from 'next/server';
import { findAsset, readGeneratedAsset } from '@/lib/server/assetFactoryStore';
import { validateFileName } from '@/lib/server/assetFactoryValidation';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryAsset } from '@/lib/server/assetFactoryTypes';

const contentTypes: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml; charset=utf-8',
  gltf: 'model/gltf+json; charset=utf-8',
  glb: 'model/gltf-binary',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function contentTypeFor(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return contentTypes[extension] ?? 'application/octet-stream';
}

function jobIdFromFile(fileName: string) {
  return fileName.split('.').slice(0, -1).join('.') || fileName;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  if (!validateFileName(file)) {
    return NextResponse.json({ error: 'invalid file' }, { status: 400 });
  }

  const assetRecord = await findAsset(jobIdFromFile(file)) as AssetFactoryAsset | null;
  if (!assetRecord) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, assetRecord.tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const asset = await readGeneratedAsset(file);

  if (!asset) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return new NextResponse(asset, {
    headers: {
      'content-type': contentTypeFor(file),
      'cache-control': assetRecord.published ? 'public, max-age=31536000, immutable' : 'private, max-age=60',
      'x-asset-job-id': assetRecord.jobId,
      'x-asset-published': String(Boolean(assetRecord.published)),
    },
  });
}
