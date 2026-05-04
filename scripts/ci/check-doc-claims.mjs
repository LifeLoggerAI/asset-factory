import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const requiredFiles = [
  'docs/adr/0001-canonical-asset-factory-architecture.md',
  'README.md',
  'firestore.rules',
  'storage.rules',
  'firestore.indexes.json'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

const checkedFiles = [
  'README.md',
  'assetfactory-studio/app/legal/privacy-policy/page.tsx'
].filter((file) => fs.existsSync(path.join(root, file)));

for (const file of checkedFiles) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (/Coming soon\.? Please check back later\./i.test(content)) {
    failures.push(`${file} contains placeholder launch copy.`);
  }
  if (/Product is LIVE|LIVE and stable|sealed forever/i.test(content)) {
    failures.push(`${file} contains unsupported production lock/live claims.`);
  }
}

const readme = fs.existsSync(path.join(root, 'README.md')) ? fs.readFileSync(path.join(root, 'README.md'), 'utf8') : '';
if (readme.includes('cd life-map-pipeline/functions && npm run deploy')) {
  failures.push('README.md still instructs Firebase deploy from life-map-pipeline/functions.');
}

if (failures.length) {
  console.error('Documentation claim check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Documentation claim check passed.');
