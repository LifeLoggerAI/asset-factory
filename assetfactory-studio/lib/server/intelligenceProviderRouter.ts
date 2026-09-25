export type IntelligenceProviderName = 'openai' | 'anthropic' | 'gemini';

export type IntelligenceTask =
  | 'reasoning'
  | 'summarization'
  | 'extraction'
  | 'classification'
  | 'narrative'
  | 'translation';

export type IntelligencePrivacyClass =
  | 'local-only'
  | 'cloud-allowed'
  | 'sensitive-cloud-with-explicit-consent';

export type IntelligenceRouteRequest = {
  task: IntelligenceTask;
  prompt: string;
  privacyClass: IntelligencePrivacyClass;
  preferredProvider?: IntelligenceProviderName;
  allowedProviders?: IntelligenceProviderName[];
  sensitiveCloudConsent?: boolean;
  maxOutputTokens?: number;
};

export type IntelligenceAttemptReceipt = {
  provider: IntelligenceProviderName;
  model: string;
  outcome: 'success' | 'failed';
  latencyMs: number;
  failureClass?: string;
};

export type IntelligenceExecutionReceipt = {
  schemaVersion: 'urai-intelligence-execution-receipt-1';
  task: IntelligenceTask;
  privacyClass: IntelligencePrivacyClass;
  selectedProvider: IntelligenceProviderName;
  selectedModel: string;
  attempts: IntelligenceAttemptReceipt[];
  fallbackUsed: boolean;
  promptLogged: false;
  cloudProcessingAuthorized: true;
  spendAuthorized: true;
};

export type IntelligenceResult = {
  text: string;
  receipt: IntelligenceExecutionReceipt;
};

type ProviderDescriptor = {
  name: IntelligenceProviderName;
  credentialEnv: string;
  modelEnv: string;
  capabilities: IntelligenceTask[];
  qualityTier: 'frontier' | 'general';
  latencyTier: 'interactive' | 'variable';
  dataHandling: 'third-party-cloud';
};

const PROVIDERS: ProviderDescriptor[] = [
  {
    name: 'openai',
    credentialEnv: 'OPENAI_API_KEY',
    modelEnv: 'ASSET_FACTORY_OPENAI_REASONING_MODEL',
    capabilities: ['reasoning', 'summarization', 'extraction', 'classification', 'narrative', 'translation'],
    qualityTier: 'frontier',
    latencyTier: 'interactive',
    dataHandling: 'third-party-cloud',
  },
  {
    name: 'anthropic',
    credentialEnv: 'ANTHROPIC_API_KEY',
    modelEnv: 'ASSET_FACTORY_ANTHROPIC_REASONING_MODEL',
    capabilities: ['reasoning', 'summarization', 'extraction', 'classification', 'narrative', 'translation'],
    qualityTier: 'frontier',
    latencyTier: 'interactive',
    dataHandling: 'third-party-cloud',
  },
  {
    name: 'gemini',
    credentialEnv: 'GEMINI_API_KEY',
    modelEnv: 'ASSET_FACTORY_GEMINI_REASONING_MODEL',
    capabilities: ['reasoning', 'summarization', 'extraction', 'classification', 'narrative', 'translation'],
    qualityTier: 'frontier',
    latencyTier: 'interactive',
    dataHandling: 'third-party-cloud',
  },
];

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const FAILURE_COOLDOWN_MS = 60_000;
const failures = new Map<IntelligenceProviderName, number>();

function env(name: string) {
  return String(process.env[name] ?? '').trim();
}

function boundedMaxTokens(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(Math.max(Math.floor(parsed), 1), 8192);
}

function timeoutSignal() {
  const configured = Number(process.env.ASSET_FACTORY_INTELLIGENCE_TIMEOUT_MS);
  const timeout = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  return AbortSignal.timeout(timeout);
}

function failureClass(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate.?limit|quota/i.test(message)) return 'rate-limit';
  if (/401|403|auth|credential|api key/i.test(message)) return 'authentication';
  if (/timeout|abort/i.test(message)) return 'timeout';
  if (/5\d\d|provider request failed/i.test(message)) return 'provider-error';
  return 'unknown-provider-error';
}

function providerDescriptor(name: IntelligenceProviderName) {
  const provider = PROVIDERS.find((entry) => entry.name === name);
  if (!provider) throw new Error(`Unknown intelligence provider: ${name}`);
  return provider;
}

function providerConfigured(provider: ProviderDescriptor) {
  return Boolean(env(provider.credentialEnv) && env(provider.modelEnv));
}

function configuredOrder(): IntelligenceProviderName[] {
  const raw = env('ASSET_FACTORY_INTELLIGENCE_PROVIDER_ORDER') || 'openai,anthropic,gemini';
  const values = raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set(PROVIDERS.map((provider) => provider.name));
  if (!values.length || values.some((value) => !allowed.has(value as IntelligenceProviderName))) {
    throw new Error('ASSET_FACTORY_INTELLIGENCE_PROVIDER_ORDER contains an unknown provider');
  }
  return [...new Set(values)] as IntelligenceProviderName[];
}

function providerHealthy(name: IntelligenceProviderName) {
  const failedAt = failures.get(name);
  return !failedAt || Date.now() - failedAt >= FAILURE_COOLDOWN_MS;
}

function assertExecutionAuthority(input: IntelligenceRouteRequest) {
  if (!input.prompt.trim()) throw new Error('Intelligence prompt is required');
  if (input.privacyClass === 'local-only') {
    throw new Error('Local-only intelligence requests may not use a third-party provider');
  }
  if (process.env.ASSET_FACTORY_INTELLIGENCE_CLOUD_PROCESSING_AUTHORIZED !== 'true') {
    throw new Error('Cloud intelligence processing is not authorized');
  }
  if (process.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED !== 'true') {
    throw new Error('External intelligence provider spend is not authorized');
  }
  if (input.privacyClass === 'sensitive-cloud-with-explicit-consent' && input.sensitiveCloudConsent !== true) {
    throw new Error('Sensitive cloud intelligence requires explicit consent');
  }
}

export function getIntelligenceProviderRegistry() {
  return PROVIDERS.map((provider) => ({
    ...provider,
    configured: providerConfigured(provider),
    model: env(provider.modelEnv) || null,
    credentialConfigured: Boolean(env(provider.credentialEnv)),
    healthy: providerHealthy(provider.name),
  }));
}

export function routeIntelligenceProviders(input: IntelligenceRouteRequest): IntelligenceProviderName[] {
  const explicitlyAllowed = input.allowedProviders?.length ? new Set(input.allowedProviders) : null;
  const order = configuredOrder();
  const preferred = input.preferredProvider;
  const prioritized = preferred
    ? [preferred, ...order.filter((provider) => provider !== preferred)]
    : order;

  return prioritized.filter((name, index, values) => {
    if (values.indexOf(name) !== index) return false;
    if (explicitlyAllowed && !explicitlyAllowed.has(name)) return false;
    const provider = providerDescriptor(name);
    return provider.capabilities.includes(input.task) && providerConfigured(provider) && providerHealthy(name);
  });
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: timeoutSignal() });
  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Provider request failed ${response.status}: ${text.slice(0, 800)}`);
  if (!payload || typeof payload !== 'object') throw new Error('Provider returned invalid JSON');
  return payload as Record<string, unknown>;
}

function extractOpenAiText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const entry of content) {
      if (!entry || typeof entry !== 'object') continue;
      const text = (entry as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) parts.push(text.trim());
    }
  }
  if (!parts.length) throw new Error('OpenAI response contained no text output');
  return parts.join('\n');
}

async function executeOpenAi(input: IntelligenceRouteRequest, model: string) {
  const payload = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('OPENAI_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: input.prompt,
      store: false,
      max_output_tokens: boundedMaxTokens(input.maxOutputTokens),
    }),
  });
  return extractOpenAiText(payload);
}

async function executeAnthropic(input: IntelligenceRouteRequest, model: string) {
  const payload = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': env('ASSET_FACTORY_ANTHROPIC_API_VERSION') || '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: boundedMaxTokens(input.maxOutputTokens),
      messages: [{ role: 'user', content: input.prompt }],
    }),
  });
  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = content
    .filter((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).type === 'text')
    .map((entry) => String((entry as Record<string, unknown>).text ?? '').trim())
    .filter(Boolean)
    .join('\n');
  if (!text) throw new Error('Anthropic response contained no text output');
  return text;
}

async function executeGemini(input: IntelligenceRouteRequest, model: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error('Gemini model id contains unsupported characters');
  const payload = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': env('GEMINI_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: { maxOutputTokens: boundedMaxTokens(input.maxOutputTokens) },
      }),
    },
  );
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const text: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const parts = Array.isArray((content as Record<string, unknown>).parts)
      ? (content as Record<string, unknown>).parts as unknown[]
      : [];
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const value = (part as Record<string, unknown>).text;
      if (typeof value === 'string' && value.trim()) text.push(value.trim());
    }
  }
  if (!text.length) throw new Error('Gemini response contained no text output');
  return text.join('\n');
}

async function executeProvider(provider: IntelligenceProviderName, input: IntelligenceRouteRequest, model: string) {
  if (provider === 'openai') return executeOpenAi(input, model);
  if (provider === 'anthropic') return executeAnthropic(input, model);
  return executeGemini(input, model);
}

export async function executeIntelligenceTask(input: IntelligenceRouteRequest): Promise<IntelligenceResult> {
  assertExecutionAuthority(input);
  const candidates = routeIntelligenceProviders(input);
  if (!candidates.length) throw new Error('No configured and healthy intelligence provider satisfies the request');

  const attempts: IntelligenceAttemptReceipt[] = [];
  for (const providerName of candidates) {
    const provider = providerDescriptor(providerName);
    const model = env(provider.modelEnv);
    const startedAt = Date.now();
    try {
      const text = await executeProvider(providerName, input, model);
      failures.delete(providerName);
      attempts.push({ provider: providerName, model, outcome: 'success', latencyMs: Date.now() - startedAt });
      return {
        text,
        receipt: {
          schemaVersion: 'urai-intelligence-execution-receipt-1',
          task: input.task,
          privacyClass: input.privacyClass,
          selectedProvider: providerName,
          selectedModel: model,
          attempts,
          fallbackUsed: attempts.length > 1,
          promptLogged: false,
          cloudProcessingAuthorized: true,
          spendAuthorized: true,
        },
      };
    } catch (error) {
      failures.set(providerName, Date.now());
      attempts.push({
        provider: providerName,
        model,
        outcome: 'failed',
        latencyMs: Date.now() - startedAt,
        failureClass: failureClass(error),
      });
    }
  }

  const summary = attempts.map((attempt) => `${attempt.provider}:${attempt.failureClass ?? 'failed'}`).join(', ');
  throw new Error(`All configured intelligence providers failed: ${summary}`);
}
