import { createHash } from 'node:crypto';
import path from 'node:path';
import { classifyAssetRequest, loadAssetAutonomyPolicy, promptFingerprint, type AssetAutonomyPolicyConfig, type AssetClassification, type ValidationSignal } from './assetAutonomyPolicy';
import { resolveAssetType } from './assetTypeCatalog';

export type AssetValidationCheck = ValidationSignal & {
  message: string;
  details?: Record<string, unknown>;
};

export type AssetValidationReport = {
  schemaVersion: 1;
  reportId: string;
  jobId: string;
  status: 'passed' | 'failed';
  validatedAt: string;
  policyVersion: string;
  promptHash: string;
  artifactSha256: string;
  classification: AssetClassification;
  repository: string | null;
  requiredChecks: string[];
  checks: AssetValidationCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    retryableFailures: number;
  };
};

type GenericRecord = Record<string, unknown>;

function record(value: unknown): GenericRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GenericRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extension(fileName: string) {
  return path.extname(fileName).replace(/^\./, '').toLowerCase();
}

function promotionRepository(canonicalType: string, classification: AssetClassification) {
  if (canonicalType === 'model3d') return 'LifeLoggerAI/urai-spatial';
  if (canonicalType === 'bundle' || classification.assetClass === 'content-variant') return 'LifeLoggerAI/urai-content';
  if (canonicalType === 'graphic' || canonicalType === 'audio') return 'LifeLoggerAI/UrAi';
  return null;
}

function check(
  checks: AssetValidationCheck[],
  input: {
    code: string;
    passed: boolean;
    message: string;
    severity?: 'info' | 'warning' | 'error';
    retryable?: boolean;
    details?: Record<string, unknown>;
    warning?: boolean;
  },
) {
  checks.push({
    code: input.code,
    status: input.passed ? (input.warning ? 'warn' : 'pass') : 'fail',
    severity: input.passed ? (input.warning ? 'warning' : 'info') : (input.severity ?? 'error'),
    retryable: input.retryable,
    message: input.message,
    details: input.details,
  });
}

export function validateGeneratedAsset(input: {
  job: GenericRecord;
  asset: GenericRecord;
  assetBuffer?: Buffer | null;
  policy?: AssetAutonomyPolicyConfig;
}): AssetValidationReport {
  const policy = input.policy ?? loadAssetAutonomyPolicy();
  const job = input.job;
  const asset = input.asset;
  const manifest = record(asset.manifest);
  const metadata = record(manifest.metadata);
  const provenance = record(manifest.provenance);
  const classification = classifyAssetRequest(job);
  const definition = resolveAssetType(job.canonicalType ?? job.type);
  const canonicalType = definition.canonicalType;
  const limits = policy.limits[canonicalType];
  const fileName = stringValue(asset.fileName);
  const fileExtension = extension(fileName);
  const formats = Array.isArray(manifest.formats) ? manifest.formats.filter((item): item is string => typeof item === 'string') : [];
  const dimensions = record(manifest.dimensions);
  const repository = promotionRepository(canonicalType, classification);
  const repositoryPolicy = repository ? policy.repositories[repository] : undefined;
  const checks: AssetValidationCheck[] = [];

  check(checks, {
    code: 'job-id-match',
    passed: Boolean(stringValue(job.jobId)) && stringValue(job.jobId) === stringValue(asset.jobId) && stringValue(job.jobId) === stringValue(manifest.jobId),
    message: 'Job, asset, and manifest identifiers must match.',
  });

  check(checks, {
    code: 'manifest-schema',
    passed: Boolean(
      stringValue(manifest.jobId) &&
      stringValue(manifest.tenantId) &&
      stringValue(manifest.type) &&
      stringValue(manifest.rendererMode) &&
      stringValue(manifest.generatedAt) &&
      numberValue(manifest.version) !== undefined &&
      Array.isArray(manifest.targetModules) &&
      Array.isArray(manifest.dependencies)
    ),
    message: 'Manifest contains the required schema fields.',
  });

  check(checks, {
    code: 'manifest-type',
    passed: stringValue(manifest.type) === canonicalType && stringValue(metadata.canonicalType) === canonicalType,
    message: `Manifest canonical type must be ${canonicalType}.`,
  });

  check(checks, {
    code: 'artifact-extension',
    passed: Boolean(limits && limits.allowedExtensions.includes(fileExtension) && formats.includes(fileExtension)),
    message: `Artifact extension must be allowed for ${canonicalType}.`,
    details: { extension: fileExtension, allowedExtensions: limits?.allowedExtensions ?? [] },
  });

  const bytes = input.assetBuffer?.byteLength ?? numberValue(asset.sizeBytes) ?? 0;
  const artifactSha256 = input.assetBuffer && input.assetBuffer.byteLength > 0
    ? createHash('sha256').update(input.assetBuffer).digest('hex')
    : '';
  check(checks, {
    code: 'artifact-size',
    passed: Boolean(limits && bytes > 0 && bytes <= limits.maxBytes),
    message: `Artifact size must be between 1 and ${limits?.maxBytes ?? 0} bytes.`,
    retryable: bytes === 0,
    details: { bytes, maxBytes: limits?.maxBytes ?? null },
  });

  check(checks, {
    code: 'provenance',
    passed: Boolean(
      stringValue(provenance.engine) &&
      stringValue(provenance.rendererContract) &&
      /^[a-f0-9]{64}$/i.test(stringValue(provenance.inputHash))
    ),
    message: 'Provenance must include engine, renderer contract, and a SHA-256 input hash.',
  });

  const providerBacked = metadata.providerBacked === true;
  const rendererContract = stringValue(provenance.rendererContract);
  check(checks, {
    code: 'generator-configuration',
    passed: rendererContract === 'deterministic-local-v1' || (providerBacked && Boolean(stringValue(metadata.provider))),
    message: 'Generator configuration must identify deterministic-local or provider-backed execution.',
    details: {
      rendererContract,
      provider: stringValue(metadata.provider) || null,
      providerModel: stringValue(metadata.providerModel) || null,
    },
  });

  if (canonicalType === 'graphic' || canonicalType === 'model3d') {
    const width = numberValue(dimensions.width) ?? 0;
    const height = numberValue(dimensions.height) ?? 0;
    check(checks, {
      code: 'dimensions',
      passed: Boolean(limits && width > 0 && height > 0 && width <= (limits.maxWidth ?? width) && height <= (limits.maxHeight ?? height)),
      message: 'Dimensions must be positive and within configured limits.',
      details: { width, height, maxWidth: limits?.maxWidth ?? null, maxHeight: limits?.maxHeight ?? null },
    });
  }

  if (canonicalType === 'audio') {
    const audio = record(metadata.audio);
    const durationSeconds = numberValue(audio.durationSeconds) ?? numberValue(record(job.metadata).durationSeconds) ?? 0;
    check(checks, {
      code: 'audio-duration',
      passed: Boolean(limits && durationSeconds > 0 && durationSeconds <= (limits.maxDurationSeconds ?? durationSeconds)),
      message: 'Audio duration must be positive and within the configured limit.',
      details: { durationSeconds, maxDurationSeconds: limits?.maxDurationSeconds ?? null },
    });
  }

  if (canonicalType === 'bundle') {
    const bundleAssets = Array.isArray(record(job.metadata).assets) ? record(job.metadata).assets as unknown[] : [];
    check(checks, {
      code: 'asset-count',
      passed: Boolean(limits && bundleAssets.length <= (limits.maxAssetCount ?? 0)),
      message: 'Bundle asset count must be within the configured limit.',
      details: { assetCount: bundleAssets.length, maxAssetCount: limits?.maxAssetCount ?? null },
    });
  }

  const estimatedCostCents = numberValue(job.actualCostCents) ?? numberValue(job.estimatedCostCents) ?? 0;
  check(checks, {
    code: 'job-cost-limit',
    passed: estimatedCostCents >= 0 && estimatedCostCents <= policy.maxPerJobCostCents,
    message: 'Generation cost must remain within the configured per-job ceiling.',
    details: { estimatedCostCents, maxPerJobCostCents: policy.maxPerJobCostCents },
  });

  const blockedRiskTags = classification.riskTags.filter((tag) => policy.rejectRiskTags.includes(tag));
  check(checks, {
    code: 'content-policy',
    passed: blockedRiskTags.length === 0,
    message: blockedRiskTags.length === 0 ? 'No policy-blocking deterministic indicators were detected.' : 'Policy-blocking deterministic indicators were detected.',
    details: { blockedRiskTags, riskTags: classification.riskTags },
  });

  const reviewRiskTags = classification.riskTags.filter((tag) => policy.manualReviewRiskTags.includes(tag));
  check(checks, {
    code: 'sensitivity-classification',
    passed: true,
    warning: reviewRiskTags.length > 0 || classification.confidence < policy.minimumClassificationConfidence,
    message: reviewRiskTags.length > 0
      ? 'Sensitivity indicators require human review.'
      : 'Sensitivity classification is eligible for policy evaluation.',
    details: {
      assetClass: classification.assetClass,
      confidence: classification.confidence,
      sensitivity: classification.sensitivity,
      reviewRiskTags,
    },
  });

  check(checks, {
    code: 'promotion-target',
    passed: Boolean(repository && repositoryPolicy && repositoryPolicy.supportedClasses.includes(classification.assetClass)),
    message: 'A configured repository owns this asset class.',
    details: { repository, assetClass: classification.assetClass },
  });

  check(checks, {
    code: 'promotion-gates-configured',
    passed: Boolean(repositoryPolicy && repositoryPolicy.requiredChecks.length > 0),
    message: 'The destination repository must define at least one required promotion check.',
    details: { requiredChecks: repositoryPolicy?.requiredChecks ?? [] },
  });

  const failed = checks.filter((item) => item.status === 'fail');
  const warnings = checks.filter((item) => item.status === 'warn');
  const passed = checks.filter((item) => item.status === 'pass');
  const retryableFailures = failed.filter((item) => item.retryable || policy.retryableValidationCodes.includes(item.code));
  const jobId = stringValue(job.jobId) || 'unknown';

  return {
    schemaVersion: 1,
    reportId: `${jobId}:validation:1`,
    jobId,
    status: failed.length === 0 ? 'passed' : 'failed',
    validatedAt: new Date().toISOString(),
    policyVersion: policy.version,
    promptHash: promptFingerprint(job.prompt),
    artifactSha256,
    classification,
    repository,
    requiredChecks: repositoryPolicy?.requiredChecks ?? [],
    checks,
    summary: {
      passed: passed.length,
      warnings: warnings.length,
      failed: failed.length,
      retryableFailures: retryableFailures.length,
    },
  };
}
