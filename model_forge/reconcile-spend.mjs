#!/usr/bin/env node
import { loadProtectedRecovery } from './protected-execution.mjs';

// No provider client/credential is used. Exact native charge receipts must already
// be admitted by the separately trusted reconciler into the protected database.
const args = process.argv.slice(2);
const claim = args[args.indexOf('--claim') + 1];
const status = args[args.indexOf('--status') + 1];
const task = args.includes('--task') ? args[args.indexOf('--task') + 1] : null;
if (!args.includes('--claim') || !args.includes('--status') || !['SUCCEEDED', 'FAILED'].includes(status)) {
  console.error('usage: node model_forge/reconcile-spend.mjs --claim <sha256> --status SUCCEEDED|FAILED [--task <exact-task-id>]');
  process.exitCode = 2;
} else {
  let run;
  try {
    run = await loadProtectedRecovery(claim);
    const receipt = await run.reconcile({ status, taskId: task });
    console.log(JSON.stringify({ claimId: run.claimId, ...receipt, providerCallAuthorized: false, providerExecutionPerformed: false }));
    if (!receipt.chargeReconciled) process.exitCode = 1;
  } catch (error) {
    console.error(`URAI_MODEL_FORGE_RECONCILIATION_BLOCKED=${error.message}`);
    process.exitCode = 1;
  } finally { if (run) await run.stop().catch(() => {}); }
}
