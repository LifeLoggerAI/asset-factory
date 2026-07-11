#!/usr/bin/env node

import fs from 'node:fs';

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected exactly one occurrence, found ${occurrences}: ${JSON.stringify(before)}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  'README.md',
  'The fail-fast setup installs the package workspaces used by the current repo gates. Root dependency installation is skipped by default when root Firebase packages are missing because the current static validation path does not require them and the root lockfile is intentionally not committed.',
  'The fail-fast setup installs the package workspaces used by the current repo gates. Root dependency installation is skipped by default when root Firebase packages are missing because the current static validation path does not require them, but the committed root package-lock.json is authoritative whenever root packages are intentionally installed.'
);

replaceExact(
  'scripts/setup-local.mjs',
  "// Root package-lock.json is intentionally not committed in this repo. Avoid creating\n// a transient root lockfile during default bootstrap; use `npm run lockfile:refresh-root`\n// when intentionally refreshing and auditing the root lockfile.",
  "// The committed root package-lock.json is authoritative for optional root packages.\n// Default bootstrap may skip those packages, but intentional root installation must use\n// frozen `npm ci` so local dependency resolution cannot drift from reviewed evidence."
);

replaceExact(
  'scripts/setup-local.mjs',
  "run('Install root dependencies without generating a root lockfile', 'npm', ['install', '--package-lock=false']);",
  "run('Install root dependencies from the committed lockfile', 'npm', ['ci', '--ignore-scripts']);"
);

replaceExact(
  'scripts/doctor.mjs',
  "const rootPkg = readJson('package.json');\nconst studioPkg = readJson('assetfactory-studio/package.json');",
  "const rootPkg = readJson('package.json');\nconst rootLock = readJson('package-lock.json');\nconst studioPkg = readJson('assetfactory-studio/package.json');"
);

replaceExact(
  'scripts/doctor.mjs',
  "check('root package.json readable', !rootPkg.__error, rootPkg.__error ?? 'OK');\ncheck('studio package.json readable', !studioPkg.__error, studioPkg.__error ?? 'OK');",
  "check('root package.json readable', !rootPkg.__error, rootPkg.__error ?? 'OK');\ncheck('root package lock is readable', !rootLock.__error, rootLock.__error ?? 'OK');\ncheck('root package lock uses version 3', rootLock.lockfileVersion === 3, `Current ${rootLock.lockfileVersion ?? 'missing'}`);\ncheck(\n  'root package lock matches package dependencies',\n  JSON.stringify(rootLock.packages?.['']?.dependencies ?? {}) === JSON.stringify(rootPkg.dependencies ?? {}),\n  'Regenerate with npm run lockfile:refresh-root.'\n);\ncheck('studio package.json readable', !studioPkg.__error, studioPkg.__error ?? 'OK');"
);

replaceExact(
  'scripts/doctor.mjs',
  "check('fail-fast local setup avoids root lockfile generation', setupLocal.includes(\"'--package-lock=false'\"), 'Expected setup helper to avoid transient root package-lock generation.');",
  "check('fail-fast local setup uses committed root lockfile', setupLocal.includes(\"'ci', '--ignore-scripts'\"), 'Expected setup helper to install optional root packages from the committed lock.');"
);

replaceExact(
  'scripts/test-launch-readiness.mjs',
  "  'root lockfile is intentionally not committed',",
  "  'committed root package-lock.json is authoritative',"
);

replaceExact(
  'scripts/test-launch-readiness.mjs',
  "  'fail-fast local setup avoids root lockfile generation',",
  "  'root package lock is readable',\n  'root package lock uses version 3',\n  'root package lock matches package dependencies',\n  'fail-fast local setup uses committed root lockfile',"
);

replaceExact(
  'scripts/test-launch-readiness.mjs',
  "  'npm run lockfile:refresh-root',\n  \"'--package-lock=false'\",",
  "  'npm run lockfile:refresh-root',\n  'committed root package-lock.json',\n  \"'ci', '--ignore-scripts'\","
);

console.log('[PASS] prepared committed root lock contract migration');
