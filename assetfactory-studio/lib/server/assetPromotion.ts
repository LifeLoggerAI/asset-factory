import { createHash } from 'node:crypto';
import { loadAssetAutonomyPolicy, type AssetAutonomyPolicyConfig } from './assetAutonomyPolicy';
import type { AssetValidationReport } from './assetOutputValidation';

export type PromotionTarget = {
  repository: string;
  baseBranch: string;
  branch: string;
  assetPath: string;
  manifestPath: string;
  validationPath: string;
  requiredChecks: string[];
};

export type PromotionRecord = {
  promotionId: string;
  jobId: string;
  repository: string;
  baseBranch: string;
  branch: string;
  commitSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  requiredChecks: string[];
  status: 'draft-opened' | 'checks-pending' | 'checks-passed' | 'merged' | 'rolled-back';
  createdAt: string;
  updatedAt: string;
};

export type PromotionReconciliation = {
  status: 'checks-pending' | 'checks-passed' | 'merged' | 'rolled-back';
  missingChecks: string[];
  pendingChecks: string[];
  failedChecks: string[];
  record: PromotionRecord;
};

type GenericRecord = Record<string, unknown>;
type GithubErrorPayload = { message?: string };

function record(value: unknown): GenericRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GenericRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function safeSegment(value: unknown, fallback = 'asset') {
  const normalized = stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return normalized || fallback;
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function promotionToken() {
  return process.env.ASSET_FACTORY_PROMOTION_TOKEN || process.env.URAI_WHEEL_GITHUB_TOKEN || '';
}

function githubApiBase() {
  return (process.env.ASSET_FACTORY_GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
}

export function isAutoPromotionEnabled() {
  return process.env.ASSET_FACTORY_AUTO_PROMOTION_ENABLED === 'true';
}

function githubHeaders() {
  const token = promotionToken();
  if (!token) throw new Error('ASSET_FACTORY_PROMOTION_TOKEN or URAI_WHEEL_GITHUB_TOKEN is required for controlled promotion.');
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'urai-asset-factory-governed-autonomy',
  };
}

async function githubRequest<T = GenericRecord>(
  path: string,
  init: RequestInit = {},
  options: { allow404?: boolean } = {},
): Promise<T | null> {
  const response = await fetch(`${githubApiBase()}${path}`, {
    ...init,
    headers: { ...githubHeaders(), ...(init.headers ?? {}) },
  });
  if (options.allow404 && response.status === 404) return null;
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;
  if (!response.ok) {
    const githubError = payload as GithubErrorPayload;
    const error = new Error(`GitHub promotion request failed ${response.status}: ${githubError.message ?? text}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload;
}

function targetRepository(canonicalType: string, assetClass: string) {
  if (canonicalType === 'model3d') return 'LifeLoggerAI/urai-spatial';
  if (canonicalType === 'bundle' || assetClass === 'content-variant') return 'LifeLoggerAI/urai-content';
  if (canonicalType === 'graphic' || canonicalType === 'audio') return 'LifeLoggerAI/UrAi';
  return '';
}

export function selectPromotionTarget(input: {
  job: GenericRecord;
  asset: GenericRecord;
  validation: AssetValidationReport;
  policy?: AssetAutonomyPolicyConfig;
}): PromotionTarget {
  const policy = input.policy ?? loadAssetAutonomyPolicy();
  const jobId = safeSegment(input.job.jobId, 'unknown-job');
  const manifest = record(input.asset.manifest);
  const metadata = record(input.job.metadata);
  const canonicalType = stringValue(input.job.canonicalType || input.job.type || manifest.type);
  const assetClass = input.validation.classification.assetClass;
  const requestedRepository = stringValue(metadata.destinationRepository || metadata.ownerRepository);
  const repository = requestedRepository || targetRepository(canonicalType, assetClass);
  const repositoryPolicy = policy.repositories[repository];
  if (!repositoryPolicy) throw new Error(`No governed promotion policy is configured for ${repository || canonicalType}.`);
  if (!repositoryPolicy.supportedClasses.includes(assetClass)) {
    throw new Error(`Repository ${repository} does not accept asset class ${assetClass}.`);
  }

  const sourceFileName = stringValue(input.asset.fileName);
  const ext = fileExtension(sourceFileName);
  if (!ext) throw new Error('Generated asset file name does not have a usable extension.');
  const slug = safeSegment(metadata.promotionSlug || input.job.variant || jobId, jobId);
  const classPath = safeSegment(assetClass, 'unclassified');
  const branchHash = createHash('sha256').update(`${repository}:${jobId}:${stringValue(record(manifest.provenance).inputHash)}`).digest('hex').slice(0, 10);

  return {
    repository,
    baseBranch: stringValue(metadata.destinationBranch) || 'main',
    branch: `asset-factory/${jobId}-${branchHash}`,
    assetPath: `${repositoryPolicy.assetRoot}/${classPath}/${slug}.${ext}`,
    manifestPath: `${repositoryPolicy.manifestRoot}/${classPath}/${slug}.manifest.json`,
    validationPath: `${repositoryPolicy.reportRoot}/${classPath}/${slug}.validation.json`,
    requiredChecks: [...repositoryPolicy.requiredChecks],
  };
}

function sanitizedManifest(asset: GenericRecord, validation: AssetValidationReport) {
  const manifest = structuredClone(record(asset.manifest));
  delete manifest.prompt;
  const metadata = record(manifest.metadata);
  delete metadata.rawInput;
  delete metadata.sourceInput;
  delete metadata.personalData;
  manifest.metadata = metadata;
  manifest.promptHash = validation.promptHash;
  manifest.validationReportId = validation.reportId;
  manifest.artifactSha256 = validation.artifactSha256;
  manifest.promotionClassification = validation.classification;
  return manifest;
}

function promotionFiles(input: {
  asset: GenericRecord;
  assetBuffer: Buffer;
  validation: AssetValidationReport;
  target: PromotionTarget;
}) {
  const manifest = sanitizedManifest(input.asset, input.validation);
  return [
    { path: input.target.assetPath, encoding: 'base64' as const, content: input.assetBuffer.toString('base64') },
    { path: input.target.manifestPath, encoding: 'utf-8' as const, content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: input.target.validationPath, encoding: 'utf-8' as const, content: `${JSON.stringify(input.validation, null, 2)}\n` },
  ];
}

async function findExistingPullRequest(repository: string, branch: string) {
  const [owner] = repository.split('/');
  const response = await githubRequest<GenericRecord[]>(
    `/repos/${repository}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  );
  return Array.isArray(response) ? response[0] as GenericRecord | undefined : undefined;
}

export async function createPromotionPullRequest(input: {
  job: GenericRecord;
  asset: GenericRecord;
  assetBuffer: Buffer;
  validation: AssetValidationReport;
  policy?: AssetAutonomyPolicyConfig;
}): Promise<PromotionRecord> {
  if (!isAutoPromotionEnabled()) throw new Error('Automatic promotion is disabled by ASSET_FACTORY_AUTO_PROMOTION_ENABLED.');
  const target = selectPromotionTarget(input);
  if (target.requiredChecks.length === 0) throw new Error('Promotion is fail-closed because no required repository checks are configured.');
  const existingPr = await findExistingPullRequest(target.repository, target.branch);
  const now = new Date().toISOString();
  const jobId = stringValue(input.job.jobId);

  if (existingPr) {
    return {
      promotionId: `${target.repository}:${target.branch}`,
      jobId,
      repository: target.repository,
      baseBranch: target.baseBranch,
      branch: target.branch,
      commitSha: stringValue(record(existingPr.head).sha),
      pullRequestNumber: Number(existingPr.number),
      pullRequestUrl: stringValue(existingPr.html_url),
      requiredChecks: target.requiredChecks,
      status: existingPr.merged_at ? 'merged' : 'draft-opened',
      createdAt: stringValue(existingPr.created_at) || now,
      updatedAt: now,
    };
  }

  const baseRef = await githubRequest<GenericRecord>(`/repos/${target.repository}/git/ref/heads/${encodeURIComponent(target.baseBranch)}`);
  const baseSha = stringValue(record(baseRef?.object).sha);
  if (!baseSha) throw new Error(`Unable to resolve ${target.repository}@${target.baseBranch}.`);
  const baseCommit = await githubRequest<GenericRecord>(`/repos/${target.repository}/git/commits/${baseSha}`);
  const baseTreeSha = stringValue(record(baseCommit?.tree).sha);
  if (!baseTreeSha) throw new Error('Unable to resolve destination base tree.');

  const treeEntries: GenericRecord[] = [];
  for (const file of promotionFiles({ ...input, target })) {
    const blob = await githubRequest<GenericRecord>(`/repos/${target.repository}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.content, encoding: file.encoding }),
    });
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: stringValue(blob?.sha) });
  }

  const tree = await githubRequest<GenericRecord>(`/repos/${target.repository}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  const commit = await githubRequest<GenericRecord>(`/repos/${target.repository}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Promote governed asset ${jobId}`,
      tree: stringValue(tree?.sha),
      parents: [baseSha],
    }),
  });
  const commitSha = stringValue(commit?.sha);
  if (!commitSha) throw new Error('GitHub did not return a promotion commit SHA.');

  await githubRequest<GenericRecord>(`/repos/${target.repository}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${target.branch}`, sha: commitSha }),
  });

  const pr = await githubRequest<GenericRecord>(`/repos/${target.repository}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Promote governed asset ${jobId}`,
      head: target.branch,
      base: target.baseBranch,
      draft: true,
      body: [
        'Automated, governed Asset Factory promotion.',
        '',
        `- Job: \`${jobId}\``,
        `- Asset class: \`${input.validation.classification.assetClass}\``,
        `- Policy: \`${input.validation.policyVersion}\``,
        `- Validation: \`${input.validation.status}\``,
        `- Required checks: ${target.requiredChecks.map((name) => `\`${name}\``).join(', ')}`,
        '',
        'This pull request must remain unmerged until every required check is present and successful. Raw prompts and sensitive source inputs are intentionally excluded.',
      ].join('\n'),
    }),
  });

  return {
    promotionId: `${target.repository}:${target.branch}`,
    jobId,
    repository: target.repository,
    baseBranch: target.baseBranch,
    branch: target.branch,
    commitSha,
    pullRequestNumber: Number(pr?.number),
    pullRequestUrl: stringValue(pr?.html_url),
    requiredChecks: target.requiredChecks,
    status: 'draft-opened',
    createdAt: now,
    updatedAt: now,
  };
}

export async function rollbackPromotion(recordInput: PromotionRecord, reason: string): Promise<PromotionRecord> {
  const record = { ...recordInput };
  await githubRequest<GenericRecord>(`/repos/${record.repository}/pulls/${record.pullRequestNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', body: `Governed promotion rolled back automatically.\n\nReason: ${reason}` }),
  });
  await githubRequest<GenericRecord>(
    `/repos/${record.repository}/git/refs/heads/${record.branch.split('/').map(encodeURIComponent).join('/')}`,
    { method: 'DELETE' },
    { allow404: true },
  );
  return { ...record, status: 'rolled-back', updatedAt: new Date().toISOString() };
}

export async function reconcilePromotion(recordInput: PromotionRecord): Promise<PromotionReconciliation> {
  const pr = await githubRequest<GenericRecord>(`/repos/${recordInput.repository}/pulls/${recordInput.pullRequestNumber}`);
  const headSha = stringValue(record(pr?.head).sha) || recordInput.commitSha;
  const checkResponse = await githubRequest<GenericRecord>(`/repos/${recordInput.repository}/commits/${headSha}/check-runs?per_page=100`);
  const checkRuns = Array.isArray(checkResponse?.check_runs) ? checkResponse?.check_runs as GenericRecord[] : [];
  const byName = new Map(checkRuns.map((item) => [stringValue(item.name), item]));
  const missingChecks = recordInput.requiredChecks.filter((name) => !byName.has(name));
  const pendingChecks = recordInput.requiredChecks.filter((name) => {
    const item = byName.get(name);
    return item && stringValue(item.status) !== 'completed';
  });
  const failedChecks = recordInput.requiredChecks.filter((name) => {
    const item = byName.get(name);
    if (!item || stringValue(item.status) !== 'completed') return false;
    return stringValue(item.conclusion) !== 'success';
  });

  if (failedChecks.length > 0) {
    const rolledBack = await rollbackPromotion(recordInput, `Required checks failed: ${failedChecks.join(', ')}`);
    return { status: 'rolled-back', missingChecks, pendingChecks, failedChecks, record: rolledBack };
  }

  if (missingChecks.length > 0 || pendingChecks.length > 0) {
    return {
      status: 'checks-pending',
      missingChecks,
      pendingChecks,
      failedChecks,
      record: { ...recordInput, status: 'checks-pending', updatedAt: new Date().toISOString() },
    };
  }

  const merged = Boolean(pr?.merged_at || pr?.merged === true);
  const status = merged ? 'merged' : 'checks-passed';
  return {
    status,
    missingChecks,
    pendingChecks,
    failedChecks,
    record: { ...recordInput, status, commitSha: headSha, updatedAt: new Date().toISOString() },
  };
}
