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
const renderRound = read('image_asset_generator/render_v1_round.py');
const adapters = read('assetfactory-studio/lib/server/assetProviderAdapters.ts');
const manifestRoute = read('assetfactory-studio/app/api/system/manifest/route.ts');
const sourceLock = JSON.parse(read('multimodal/source-lock.json'));

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

includes(renderRound, 'ASSET_FORGE_ONLY_ASSET_IDS', 'exact asset selection');
includes(renderRound, 'Paid execution refuses to overwrite existing output', 'paid overwrite refusal');
includes(renderRound, 'retry_only = round_number > 1', 'bounded retry control');

for (const guard of ['ASSET_FACTORY_ENABLE_PAID_MEDIA', 'ASSET_FACTORY_PAID_APPROVAL_ID', 'ASSET_FACTORY_PAID_MAX_COST_CENTS']) {
  includes(adapters, guard, `${guard} adapter guard`);
  includes(manifestRoute, guard, `${guard} readiness declaration`);
}
includes(adapters, 'authorized: enabled && approvalIdPresent && coversMaximumPolicyRequest', 'bounded provider authorization rule');
includes(adapters, "return getPaidProviderAuthorization().authorized ? requested : 'local-proof'", 'fail-closed provider fallback');

console.log('PASS clean multimodal control-plane boundary');
