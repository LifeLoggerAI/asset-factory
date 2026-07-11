import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = path.join(root, 'assetfactory-studio', 'lib', 'server', 'assetProviderAdapters.ts');
const manifestPath = path.join(root, 'assetfactory-studio', 'app', 'api', 'system', 'manifest', 'route.ts');

const source = fs.readFileSync(sourcePath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`Missing ${label}: ${fragment}`);
}

function forbidText(text, fragment, label) {
  if (text.includes(fragment)) throw new Error(`Forbidden ${label}: ${fragment}`);
}

for (const guard of [
  'ASSET_FACTORY_ENABLE_PAID_MEDIA',
  'ASSET_FACTORY_PAID_APPROVAL_ID',
  'ASSET_FACTORY_PAID_MAX_COST_CENTS',
]) {
  requireText(source, guard, `${guard} adapter guard`);
  requireText(manifest, guard, `${guard} manifest readiness signal`);
}

requireText(source, 'const enabled = process.env.ASSET_FACTORY_ENABLE_PAID_MEDIA ===', 'explicit paid enablement');
requireText(source, 'const approvalIdPresent = Boolean(process.env.ASSET_FACTORY_PAID_APPROVAL_ID?.trim())', 'nonempty approval ID');
requireText(source, 'coversMaximumPolicyRequest', 'maximum-request ceiling coverage');
requireText(source, 'authorized: enabled && approvalIdPresent && coversMaximumPolicyRequest', 'all-guards authorization rule');
requireText(source, "return getPaidProviderAuthorization().authorized ? requested : 'local-proof'", 'fail-closed local-proof fallback');
requireText(source, 'assertPaidProviderRequestAuthorized', 'per-request authorization assertion');
requireText(source, 'exceeds approved ceiling', 'ceiling rejection');
requireText(manifest, 'paidProviderReady', 'paid provider readiness declaration');
requireText(manifest, "providers.selected !== 'local-proof'", 'local proof excluded from production readiness');

forbidText(source, 'authorized: true', 'hardcoded provider authorization');
forbidText(source, "return requested;", 'unguarded provider selection');
forbidText(source, 'ASSET_FACTORY_ENABLE_PAID_MEDIA ?? true', 'paid mode default-on');

console.log('PASS dependency-free paid provider authorization guards');
