import { execFileSync } from 'node:child_process';

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit' });
}

console.log('Refreshing life-map-pipeline/functions lockfile and verifying production-safe build path.');

run('npm', ['--prefix', 'life-map-pipeline/functions', 'install']);
run('npm', ['--prefix', 'life-map-pipeline/functions', 'run', 'build']);
run('npm', ['run', 'verify:local']);

console.log('\nNext steps:');
console.log('1. Review changes to life-map-pipeline/functions/package-lock.json.');
console.log('2. Run npm run deploy:verify against the live site.');
console.log('3. If the Firebase SDK warning is gone, consider restoring firebase.json predeploy from npm install to npm ci.');
