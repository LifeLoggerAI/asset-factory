import { createHash } from 'node:crypto';
import defaultPolicyJson from '../../config/asset-autonomy-policy.json';

export type AutonomyDisposition = 'auto-approve' | 'manual-review' | 'reject' | 'retryable-failure';
export type ValidationStatus = 'passed' | 'failed';

export type ValidationSignal = {
  code: string;
  status: 'pass' | 'fail' | 'warn';
  severity: 'info' | 'warning' | 'error';
  retryable?: boolean;
};

export type AssetClassification = {
  assetClass: string;
  confidence: number;
  sensitivity: 'none' | 'low' | 'medium' | 'high';
  riskTags: string[];
  source: 'metadata' | 'deterministic-inference';
};

export type AssetAutonomyPolicyConfig = {
  version: string;
  minimumClassificationConfidence: number;
  maxAutoApproveCostCents: number;
  maxPerJobCostCents: number;
  maxDailyCostCents: number;
  maxAttempts: number;
  autoApproveAssetClasses: string[];
  manualReviewAssetClasses: string[];
  manualReviewRiskTags: string[];
  rejectRiskTags: string[];
  retryableValidationCodes: string[];
  limits: Record<string, {
    allowedExtensions: string[];
    maxBytes: number;
    maxWidth?: number;
    maxHeight?: number;
    maxDurationSeconds?: number;
    maxAssetCount?: number;
  }>;
  repositories: Record<string, {
    assetRoot: string;
    manifestRoot: string;
    reportRoot: string;
    requiredChecks: string[];
    supportedClasses: string[];
  }>;
};

export type AutonomyPolicyDecision = {
  disposition: AutonomyDisposition;
  policyVersion: string;
  reasons: string[];
  classification: AssetClassification;
  estimatedCostCents: number;
  confidenceThreshold: number;
  decidedAt: string;
};

type GenericRecord = Record<string, unknown>;

const sensitiveIndicators: Array<[RegExp, string]> = [
  [/\b(avatar|identity|face|likeness|selfie|portrait)\b/i, 'identity-related'],
  [/\b(autobiograph|my memory|my childhood|my trauma|life story)\b/i, 'autobiographical'],
  [/\b(biometric|face scan|iris|fingerprint)\b/i, 'biometric-looking'],
  [/\b(photorealistic|photo-real|realistic human)\b/i, 'photorealistic-human'],
  [/\b(marketing|advertisement|campaign|landing page|press claim)\b/i, 'public-facing'],
  [/\b(diagnos|medical|therapy|therapeutic|mental health)\b/i, 'medical'],
  [/\b(self-harm|suicide)\b/i, 'self-harm'],
  [/\b(sexual|explicit|nude)\b/i, 'sexual-content'],
  [/\b(violence|gore|weapon)\b/i, 'violence'],
  [/\b(child|minor|teen)\b/i, 'minor'],
];

const rejectIndicators: Array<[RegExp, string]> = [
  [/\b(api[_ -]?key|private key|password|credential|secret token)\b/i, 'contains-secret'],
  [/\b(ssn|social security number|passport number|credit card number)\b/i, 'raw-personal-data'],
  [/\b(malware|ransomware|credential stealer)\b/i, 'malware'],
];

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim().toLowerCase())
    : [];
}

function normalizeClass(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase().replaceAll('_', '-') : '';
}

function metadataRecord(input: GenericRecord) {
  return input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata as GenericRecord
    : {};
}

export function loadAssetAutonomyPolicy(): AssetAutonomyPolicyConfig {
  let policy = structuredClone(defaultPolicyJson) as AssetAutonomyPolicyConfig;
  const override = process.env.ASSET_FACTORY_AUTONOMY_POLICY_JSON;
  if (override) {
    const parsed = JSON.parse(override) as Partial<AssetAutonomyPolicyConfig>;
    policy = {
      ...policy,
      ...parsed,
      limits: { ...policy.limits, ...(parsed.limits ?? {}) },
      repositories: { ...policy.repositories, ...(parsed.repositories ?? {}) },
    };
  }

  policy.minimumClassificationConfidence = numberFromEnv(
    'ASSET_FACTORY_MIN_CLASSIFICATION_CONFIDENCE',
    policy.minimumClassificationConfidence,
  );
  policy.maxAutoApproveCostCents = numberFromEnv(
    'ASSET_FACTORY_MAX_AUTO_APPROVE_COST_CENTS',
    policy.maxAutoApproveCostCents,
  );
  policy.maxPerJobCostCents = numberFromEnv(
    'ASSET_FACTORY_MAX_JOB_COST_CENTS',
    policy.maxPerJobCostCents,
  );
  policy.maxDailyCostCents = numberFromEnv(
    'ASSET_FACTORY_MAX_DAILY_COST_CENTS',
    policy.maxDailyCostCents,
  );
  return policy;
}

function inferAssetClass(input: GenericRecord, metadata: GenericRecord) {
  const explicit = normalizeClass(metadata.assetClass ?? metadata.category ?? input.assetClass);
  if (explicit) return { assetClass: explicit, source: 'metadata' as const };

  const requested = normalizeClass(input.requestedType ?? input.type);
  const variant = normalizeClass(input.variant);
  const target = `${requested} ${variant} ${normalizeClass(input.targetModule)}`;
  if (target.includes('icon')) return { assetClass: 'icon', source: 'deterministic-inference' as const };
  if (target.includes('background')) return { assetClass: 'background', source: 'deterministic-inference' as const };
  if (target.includes('texture')) return { assetClass: 'environmental-texture', source: 'deterministic-inference' as const };
  if (target.includes('ambience') || target.includes('ambient')) return { assetClass: 'ambient-audio', source: 'deterministic-inference' as const };
  if (target.includes('content') || target.includes('variant')) return { assetClass: 'content-variant', source: 'deterministic-inference' as const };
  if (target.includes('avatar')) return { assetClass: 'avatar', source: 'deterministic-inference' as const };
  if (requested === 'model3d' || target.includes('scene') || target.includes('environment')) {
    return { assetClass: 'scene-asset', source: 'deterministic-inference' as const };
  }
  return { assetClass: 'unclassified', source: 'deterministic-inference' as const };
}

export function classifyAssetRequest(input: GenericRecord): AssetClassification {
  const metadata = metadataRecord(input);
  const inferred = inferAssetClass(input, metadata);
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const riskTags = new Set<string>([
    ...stringArray(metadata.riskTags),
    ...stringArray(metadata.sensitivityTags),
  ]);

  for (const [pattern, tag] of sensitiveIndicators) {
    if (pattern.test(prompt)) riskTags.add(tag);
  }
  for (const [pattern, tag] of rejectIndicators) {
    if (pattern.test(prompt)) riskTags.add(tag);
  }

  if (metadata.publicFacing === true) riskTags.add('public-facing');
  if (metadata.marketingClaim === true) riskTags.add('marketing-claim');
  if (metadata.photorealisticHuman === true) riskTags.add('photorealistic-human');
  if (metadata.identityRelated === true) riskTags.add('identity-related');
  if (metadata.autobiographical === true) riskTags.add('autobiographical');
  if (metadata.sensitive === true) riskTags.add('sensitive-content');

  const explicitConfidence = Number(metadata.classificationConfidence);
  const confidence = Number.isFinite(explicitConfidence)
    ? Math.max(0, Math.min(1, explicitConfidence))
    : inferred.source === 'metadata' ? 0.95 : inferred.assetClass === 'unclassified' ? 0.4 : 0.75;

  const explicitSensitivity = String(metadata.sensitivity ?? '').toLowerCase();
  const sensitivity = explicitSensitivity === 'high' || explicitSensitivity === 'medium' || explicitSensitivity === 'low' || explicitSensitivity === 'none'
    ? explicitSensitivity
    : riskTags.size > 0 ? 'medium' : 'none';

  return {
    assetClass: inferred.assetClass,
    confidence,
    sensitivity,
    riskTags: [...riskTags].sort(),
    source: inferred.source,
  };
}

export function promptFingerprint(prompt: unknown) {
  return createHash('sha256').update(typeof prompt === 'string' ? prompt : '').digest('hex');
}

export function decideAssetAutonomy(input: {
  job: GenericRecord;
  validationStatus: ValidationStatus;
  validationSignals: ValidationSignal[];
  estimatedCostCents?: number;
  policy?: AssetAutonomyPolicyConfig;
}): AutonomyPolicyDecision {
  const policy = input.policy ?? loadAssetAutonomyPolicy();
  const classification = classifyAssetRequest(input.job);
  const cost = Number(input.estimatedCostCents ?? input.job.actualCostCents ?? input.job.estimatedCostCents ?? 0);
  const reasons: string[] = [];
  let disposition: AutonomyDisposition = 'manual-review';

  const failedSignals = input.validationSignals.filter((signal) => signal.status === 'fail');
  const retryableFailures = failedSignals.filter((signal) => signal.retryable || policy.retryableValidationCodes.includes(signal.code));

  if (failedSignals.length > 0) {
    if (retryableFailures.length === failedSignals.length) {
      disposition = 'retryable-failure';
      reasons.push(`retryable validation failures: ${retryableFailures.map((item) => item.code).join(', ')}`);
    } else {
      disposition = 'reject';
      reasons.push(`terminal validation failures: ${failedSignals.map((item) => item.code).join(', ')}`);
    }
  } else if (input.validationStatus !== 'passed') {
    disposition = 'reject';
    reasons.push('validation did not produce a passed result');
  } else if (!Number.isFinite(cost) || cost < 0 || cost > policy.maxPerJobCostCents) {
    disposition = 'reject';
    reasons.push(`generation cost exceeds the per-job ceiling of ${policy.maxPerJobCostCents} cents`);
  } else if (classification.riskTags.some((tag) => policy.rejectRiskTags.includes(tag))) {
    disposition = 'reject';
    reasons.push('request contains a policy-blocking risk tag');
  } else if (
    policy.manualReviewAssetClasses.includes(classification.assetClass) ||
    classification.riskTags.some((tag) => policy.manualReviewRiskTags.includes(tag)) ||
    classification.sensitivity === 'high' || classification.sensitivity === 'medium'
  ) {
    disposition = 'manual-review';
    reasons.push('asset class, sensitivity, or risk tags require human review');
  } else if (classification.confidence < policy.minimumClassificationConfidence) {
    disposition = 'manual-review';
    reasons.push(`classification confidence ${classification.confidence.toFixed(2)} is below ${policy.minimumClassificationConfidence.toFixed(2)}`);
  } else if (cost > policy.maxAutoApproveCostCents) {
    disposition = 'manual-review';
    reasons.push(`generation cost exceeds the auto-approval ceiling of ${policy.maxAutoApproveCostCents} cents`);
  } else if (policy.autoApproveAssetClasses.includes(classification.assetClass)) {
    disposition = 'auto-approve';
    reasons.push(`low-risk class ${classification.assetClass} passed deterministic validation`);
  } else {
    disposition = 'manual-review';
    reasons.push(`asset class ${classification.assetClass} is not configured for automatic approval`);
  }

  return {
    disposition,
    policyVersion: policy.version,
    reasons,
    classification,
    estimatedCostCents: Number.isFinite(cost) ? cost : 0,
    confidenceThreshold: policy.minimumClassificationConfidence,
    decidedAt: new Date().toISOString(),
  };
}
