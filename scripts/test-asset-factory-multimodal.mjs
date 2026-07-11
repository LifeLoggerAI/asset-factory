import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd().endsWith('assetfactory-studio')
  ? path.dirname(process.cwd())
  : process.cwd();

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function includes(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

function excludes(source, needle, label) {
  if (source.includes(needle)) throw new Error(`Forbidden ${label}: ${needle}`);
}

function absent(relativePath, label) {
  if (fs.existsSync(path.join(root, relativePath))) throw new Error(`Forbidden ${label}: ${relativePath}`);
}

const audit = read('.github/workflows/full-multimodal-asset-audit.yml');
const offline = read('.github/workflows/offline-evidence-package.yml');
const lockfile = read('.github/workflows/root-lockfile-candidate.yml');
const planner = read('multimodal/plan_paid_dispatch.py');
const providerRegistry = read('multimodal/provider-registry.json');
const certification = read('image_asset_generator/certify_dropin.py');
const rights = read('multimodal/validate_rights.py');
const rightsLedger = JSON.parse(read('multimodal/rights-ledger.json'));
const renderRound = read('image_asset_generator/render_v1_round.py');
const adapters = read('assetfactory-studio/lib/server/assetProviderAdapters.ts');
const manifestRoute = read('assetfactory-studio/app/api/system/manifest/route.ts');
const sourceLock = JSON.parse(read('multimodal/source-lock.json'));
const manifestSchema = JSON.parse(read('multimodal/full-multimodal-asset-manifest.schema.json'));
const manifestValidator = read('multimodal/validate_manifest.py');

for (const [file, label] of [
  ['.github/workflows/authorized-multimodal-execution.yml', 'authorized paid batch workflow'],
  ['.github/workflows/one-paid-v1-smoke-push.yml', 'legacy one-paid-smoke workflow'],
  ['.github/workflows/promote-reviewed-multimodal-batch.yml', 'multimodal promotion workflow'],
  ['docs/release-evidence/URAI-WSC-20260711-PAID-V1-SMOKE-012.json', 'stale paid receipt'],
  ['WORK-COMPLETION-REPORT.md', 'stale completion report'],
]) absent(file, label);

const checkoutPin = 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683';
const pythonPin = 'actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065';
const nodePin = 'actions/setup-node@1e60f620b9541d80c77f7b4a3bcd8bf5e940c37';
const artifactPin = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';

for (const [workflow, label] of [[audit, 'audit'], [offline, 'offline evidence'], [lockfile, 'lockfile']]) {
  includes(workflow, checkoutPin, `${label} immutable checkout`);
  includes(workflow, artifactPin, `${label} immutable artifact upload`);
  includes(workflow, 'persist-credentials: false', `${label} non-persistent checkout credentials`);
  includes(workflow, 'permissions:\n  contents: read', `${label} read-only default permissions`);
  includes(workflow, 'runs-on: windows-latest', `${label} proven runner pool`);
  excludes(workflow, 'secrets.', `${label} secret access`);
  excludes(workflow, 'actions: write', `${label} Actions write permission`);
  excludes(workflow, 'contents: write', `${label} contents write permission`);
  excludes(workflow, '@v4', `${label} mutable v4 action tag`);
  excludes(workflow, '@v5', `${label} mutable v5 action tag`);
}

includes(audit, pythonPin, 'audit immutable Python setup');
includes(offline, pythonPin, 'offline immutable Python setup');
includes(audit, "plan.get('dispatchAuthorized') is not False", 'zero-spend authorization assertion');
includes(audit, "budget.get('maxProviderCalls') != 0", 'zero provider-call assertion');
includes(audit, "budget.get('maxTotalExposureUsd') != 0", 'zero approved-spend assertion');
includes(audit, `URAI_SPATIAL_LOCKED_SHA: ${sourceLock.spatialMainSha}`, 'Spatial source-lock identity');

includes(offline, 'EXPECTED_HEAD: ${{ github.event.pull_request.head.sha || github.sha }}', 'PR-head receipt environment');
includes(offline, "tree.get('headSha') == expected_head", 'source tree bound to checked-out PR head');
includes(offline, "'commit': expected_head", 'receipt commit bound to checked-out PR head');
includes(offline, "'workflowSha': os.getenv('GITHUB_SHA')", 'separate workflow merge-ref trace');
excludes(offline, "tree.get('headSha') == os.getenv('GITHUB_SHA')", 'PR receipt merge-ref comparison');

const expectedLifecycleStatuses = [
  'required', 'planned', 'queued', 'generating', 'generated', 'candidate',
  'blocked', 'review-pending', 'approved', 'promoted', 'certified', 'removed-from-scope',
];
const schemaLifecycleStatuses = manifestSchema?.properties?.assets?.items?.properties?.currentStatus?.enum;
if (JSON.stringify(schemaLifecycleStatuses) !== JSON.stringify(expectedLifecycleStatuses)) {
  throw new Error(`Manifest schema lifecycle states drifted: ${JSON.stringify(schemaLifecycleStatuses)}`);
}
for (const status of expectedLifecycleStatuses) {
  includes(manifestValidator, `"${status}"`, `${status} validator lifecycle state`);
}

includes(lockfile, nodePin, 'lockfile immutable Node setup');
includes(lockfile, "node-version: '20.19.5'", 'exact Node version');
includes(lockfile, 'npm install --global npm@10.9.2', 'exact npm version');
includes(lockfile, 'npm install --package-lock-only --ignore-scripts --fund=false --audit=false', 'lock-only install');
includes(lockfile, "startsWith('https://registry.npmjs.org/')", 'public registry provenance');
includes(lockfile, 'if (!entry.integrity)', 'package integrity requirement');
includes(lockfile, 'npm ci --ignore-scripts --fund=false --audit=false', 'frozen root install');
includes(lockfile, 'npm audit --audit-level=high --omit=dev', 'high-severity audit gate');
excludes(lockfile, 'npm publish', 'package publication');
excludes(lockfile, 'git push', 'repository mutation');

for (const guard of [
  'ASSET_FACTORY_PAID_APPROVAL_SHA',
  'ASSET_FACTORY_PAID_AUTHORIZATION_EXPIRES_AT',
  'ASSET_FACTORY_PAID_ASSET_IDS',
]) {
  includes(planner, guard, `${guard} planner guard`);
  includes(providerRegistry, guard, `${guard} provider policy`);
}
includes(planner, 'has_existing_paid_progress', 'existing paid progress exclusion');
includes(planner, 'dispatch_authorized = not blockers', 'blocked-by-default planning verdict');
includes(planner, '"maxProviderCalls": planned_calls if dispatch_authorized else 0', 'zero calls without authorization');
excludes(planner, '"dispatchAuthorized": True', 'hardcoded paid authorization');
excludes(planner, '"maxTotalExposureUsd": 200.00', 'hardcoded exposure');

includes(certification, '"technically-validated"', 'technical-only certification status');
includes(certification, '--require-promotion-clearance', 'separate promotion clearance');
includes(certification, 'rights.get("promotionAllowed") is not True', 'rights promotion enforcement');
includes(certification, 'approval.get("humanReview") is not True', 'human review enforcement');
includes(certification, 'approved_map != expected_map', 'exact approved hash map');
includes(rights, '--require-promotion-ready', 'rights promotion mode');
includes(rights, 'MUST_VERIFY', 'mandatory rights rule');
includes(rights, 'MANIFEST = ROOT / "full-multimodal-asset-manifest.json"', 'manifest-scoped rights source');
includes(rights, 'voiceConsentAssetIds', 'voice consent asset scope');
includes(rights, 'likenessConsentAssetIds', 'likeness consent asset scope');
includes(rights, 'scopeContradictions', 'plan-only not-applicable contradiction evidence');
includes(rights, 'blocking_ids.add("manifest-scope")', 'missing manifest promotion blocker');

for (const recordId of ['voice-consent', 'likeness-consent']) {
  const record = rightsLedger.records.find((entry) => entry.recordId === recordId);
  if (!record) throw new Error(`Missing rights record ${recordId}`);
  if (record.status !== 'pending') throw new Error(`${recordId} must remain pending until exact outputs are reviewed`);
  if (record.commercialUse !== null) throw new Error(`${recordId} commercial use must remain unknown before exact-output review`);
}

includes(renderRound, 'ASSET_FORGE_ONLY_ASSET_IDS', 'exact asset selection');
includes(renderRound, 'Paid execution refuses to overwrite existing output', 'paid overwrite refusal');
includes(renderRound, 'retry_only = round_number > 1', 'bounded retry control');

includes(adapters, 'STUDIO_PAID_PROVIDER_RUNTIME_ENABLED = false', 'compile-time Studio paid runtime disable');
includes(adapters, "STUDIO_PAID_PROVIDER_BLOCKER = 'disabled-pending-atomic-one-time-ledger'", 'atomic-ledger blocker');
includes(adapters, 'atomicLedgerConfigured: false', 'missing atomic ledger declaration');
includes(adapters, 'authorized: false', 'Studio provider authorization fail-closed state');
includes(adapters, 'executionAuthorized: false', 'Studio provider execution fail-closed state');
includes(adapters, "return 'local-proof';", 'unconditional local-proof runtime selection');
includes(adapters, 'executable: false', 'diagnostic-only paid adapters');
includes(manifestRoute, 'const paidProviderReady = false', 'paid provider readiness disabled');
includes(manifestRoute, 'providerBackedRendering: false', 'provider rendering disabled capability');
includes(manifestRoute, 'paidProviderAuthorized: false', 'manifest paid authorization disabled');
includes(manifestRoute, "'ready-for-local-proof-smoke'", 'local-proof-only readiness classification');
excludes(adapters, 'authorized: enabled && approvalIdPresent && coversMaximumPolicyRequest', 'weak environment-only paid authorization');
excludes(adapters, "return getPaidProviderAuthorization().authorized ? requested : 'local-proof'", 'environment-enabled provider selection');
excludes(manifestRoute, "providers.selected !== 'local-proof'", 'paid provider readiness inference');

console.log('PASS clean multimodal control-plane boundary');
