import { NextRequest, NextResponse } from 'next/server';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { transcribeAssetFile } from '@/lib/server/assetTranscriptionRuntime';

export const runtime = 'nodejs';

const allowedMimePrefixes = ['audio/', 'video/'];

export async function POST(req: NextRequest) {
  const apiKeyError = requireAssetFactoryApiKey(req);
  if (apiKeyError) return apiKeyError;

  const auth = authorizeAssetRequest(req, undefined, 'creator');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if ((process.env.ASSET_FACTORY_STT_PROVIDER || 'local-proof') === 'local-proof') {
    return NextResponse.json({ error: 'STT provider is not activated' }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (!allowedMimePrefixes.some((prefix) => file.type.startsWith(prefix))) {
      return NextResponse.json({ error: 'file must be audio or video' }, { status: 415 });
    }

    const configuredMaxBytes = Number(process.env.ASSET_FACTORY_STT_MAX_BYTES);
    const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
      ? Math.floor(configuredMaxBytes)
      : 50 * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json({ error: 'file exceeds configured transcription size boundary' }, { status: 413 });
    }

    const languageCodeValue = form.get('languageCode');
    const languageCode = typeof languageCodeValue === 'string' && /^[A-Za-z-]{2,16}$/.test(languageCodeValue)
      ? languageCodeValue
      : undefined;

    const result = await transcribeAssetFile({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name || 'source-media',
      mimeType: file.type,
      languageCode,
    });

    return NextResponse.json({
      ok: true,
      tenantId: auth.tenantId ?? null,
      userId: auth.userId ?? null,
      transcript: result,
      provenance: {
        sourceType: 'uploaded-media',
        provider: result.provider,
        providerModel: result.providerModel,
        sourceSha256: result.sourceSha256,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'transcription failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
