import { NextRequest, NextResponse } from 'next/server';
import { requireConfiguredAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import {
  executeIntelligenceTask,
  getIntelligenceProviderRegistry,
  type IntelligencePrivacyClass,
  type IntelligenceProviderName,
  type IntelligenceTask,
} from '@/lib/server/intelligenceProviderRouter';

const tasks = new Set<IntelligenceTask>([
  'reasoning',
  'summarization',
  'extraction',
  'classification',
  'narrative',
  'translation',
]);

const privacyClasses = new Set<IntelligencePrivacyClass>([
  'local-only',
  'cloud-allowed',
  'sensitive-cloud-with-explicit-consent',
]);

const providers = new Set<IntelligenceProviderName>(['openai', 'anthropic', 'gemini']);

function boundedString(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const apiKeyError = requireConfiguredAssetFactoryApiKey(req);
  if (apiKeyError) return apiKeyError;

  const auth = authorizeAssetRequest(req, undefined, 'operator');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({
    ok: true,
    cloudProcessingAuthorized: process.env.ASSET_FACTORY_INTELLIGENCE_CLOUD_PROCESSING_AUTHORIZED === 'true',
    spendAuthorized: process.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED === 'true',
    providers: getIntelligenceProviderRegistry().map((provider) => ({
      name: provider.name,
      capabilities: provider.capabilities,
      configured: provider.configured,
      modelConfigured: Boolean(provider.model),
      healthy: provider.healthy,
      qualityTier: provider.qualityTier,
      latencyTier: provider.latencyTier,
      dataHandling: provider.dataHandling,
    })),
  });
}

export async function POST(req: NextRequest) {
  const apiKeyError = requireConfiguredAssetFactoryApiKey(req);
  if (apiKeyError) return apiKeyError;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tenantId = boundedString(body.tenantId, 160);
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });

  const auth = authorizeAssetRequest(req, tenantId, 'operator');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const task = String(body.task ?? '') as IntelligenceTask;
  const privacyClass = String(body.privacyClass ?? '') as IntelligencePrivacyClass;
  const prompt = boundedString(body.prompt, 32_000);

  if (!tasks.has(task)) return NextResponse.json({ error: 'Unsupported intelligence task' }, { status: 400 });
  if (!privacyClasses.has(privacyClass)) return NextResponse.json({ error: 'Unsupported privacy class' }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: 'prompt is required and must be <= 32000 characters' }, { status: 400 });

  const preferredProvider = body.preferredProvider == null ? undefined : String(body.preferredProvider) as IntelligenceProviderName;
  if (preferredProvider && !providers.has(preferredProvider)) {
    return NextResponse.json({ error: 'Unsupported preferred provider' }, { status: 400 });
  }

  let allowedProviders: IntelligenceProviderName[] | undefined;
  if (body.allowedProviders != null) {
    if (!Array.isArray(body.allowedProviders) || body.allowedProviders.some((value) => !providers.has(String(value) as IntelligenceProviderName))) {
      return NextResponse.json({ error: 'allowedProviders contains an unsupported provider' }, { status: 400 });
    }
    allowedProviders = [...new Set(body.allowedProviders.map((value) => String(value) as IntelligenceProviderName))];
  }

  try {
    const result = await executeIntelligenceTask({
      task,
      prompt,
      privacyClass,
      preferredProvider,
      allowedProviders,
      sensitiveCloudConsent: body.sensitiveCloudConsent === true,
      maxOutputTokens: typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : undefined,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      text: result.text,
      receipt: result.receipt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Intelligence execution failed';
    const policyFailure = /not authorized|explicit consent|local-only|No configured and healthy/.test(message);
    return NextResponse.json(
      { error: message },
      { status: policyFailure ? 412 : 502 }
    );
  }
}
