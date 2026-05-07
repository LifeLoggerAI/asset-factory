import { NextRequest, NextResponse } from 'next/server';
import { readGeneratedAsset } from '@/lib/server/assetFactoryStore';
import { validateFileName } from '@/lib/server/assetFactoryValidation';

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  if (!validateFileName(file)) {
    return NextResponse.json({ error: 'invalid file' }, { status: 400 });
  }

  const asset = await readGeneratedAsset(file);

  if (!asset) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return new NextResponse(asset, {
    headers: {
      'content-type': contentTypeFor(file),
      'cache-control': 'private, max-age=60',
    },
  });
}
