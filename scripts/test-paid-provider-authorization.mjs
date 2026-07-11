import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

requireText(source, 'STUDIO_PAID_PROVIDER_RUNTIME_ENABLED = false', 'compile-time paid runtime disable');
requireText(source, "STUDIO_PAID_PROVIDER_BLOCKER = 'disabled-pending-atomic-one-time-ledger'", 'atomic-ledger blocker');
requireText(source, 'atomicLedgerConfigured: false', 'missing atomic ledger declaration');
requireText(source, 'runtimeExecutionEnabled: STUDIO_PAID_PROVIDER_RUNTIME_ENABLED', 'runtime execution state');
requireText(source, 'authorized: false', 'paid authorization fail-closed state');
requireText(source, 'executionAuthorized: false', 'paid execution fail-closed state');
requireText(source, "return 'local-proof';", 'unconditional local-proof runtime selection');
requireText(source, 'executable: false', 'diagnostic-only paid adapters');
requireText(source, 'assertPaidProviderRequestAuthorized', 'paid request assertion');
requireText(source, 'atomic one-time authorization and consumption ledger exists', 'paid request denial reason');

requireText(manifest, 'const paidProviderReady = false', 'manifest paid readiness fail-closed state');
requireText(manifest, 'providerBackedRendering: false', 'provider rendering disabled capability');
requireText(manifest, 'paidProviderAuthorized: false', 'manifest paid authorization state');
requireText(manifest, 'paidProviderExecution: providers.paidAuthorization.blocker', 'manifest blocker evidence');
requireText(manifest, 'atomicPaidLedgerConfigured: providers.paidAuthorization.atomicLedgerConfigured', 'manifest atomic-ledger evidence');
requireText(manifest, "'ready-for-local-proof-smoke'", 'local-proof-only readiness classification');

forbidText(source, 'authorized: enabled && approvalIdPresent && coversMaximumPolicyRequest', 'weak environment-only authorization rule');
forbidText(source, "return getPaidProviderAuthorization().authorized ? requested : 'local-proof'", 'environment-enabled paid provider selection');
forbidText(manifest, "providers.selected !== 'local-proof'", 'paid provider readiness inference');
forbidText(manifest, "'ASSET_FACTORY_ENABLE_PAID_MEDIA'", 'paid enable flag as production requirement');
forbidText(manifest, "'ASSET_FACTORY_PAID_APPROVAL_ID'", 'approval ID as production requirement');
forbidText(manifest, "'ASSET_FACTORY_PAID_MAX_COST_CENTS'", 'cost ceiling as production requirement');

console.log('PASS Studio paid providers are diagnostic-only pending an atomic one-time ledger');
