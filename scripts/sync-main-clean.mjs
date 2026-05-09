import { execFileSync } from 'node:child_process';

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit' });
}

console.log('Syncing local checkout to origin/main. This preserves local work on a timestamped branch before hard reset.');

let branchName = 'local-before-sync';
try {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  branchName = `local-before-sync-${stamp}`;
  run('git', ['branch', branchName]);
  console.log(`Saved current local state as ${branchName}`);
} catch (error) {
  console.warn('Could not create local backup branch; continuing with fetch/reset.', error instanceof Error ? error.message : String(error));
}

run('git', ['fetch', 'origin', 'main']);
run('git', ['checkout', 'main']);
run('git', ['reset', '--hard', 'origin/main']);
run('git', ['status', '--short', '--branch']);

console.log('Local main is now exactly synced to origin/main.');
