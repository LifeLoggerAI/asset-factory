import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const failures = [];

const rootPackage = readJson('package.json');
const functionsPackage = readJson('functions/package.json');
const firebaseConfig = readJson('firebase.json');

if (!String(rootPackage.engines?.node || '').includes('20')) {
  failures.push('Root package.json must require Node 20 or newer.');
}

if (!String(functionsPackage.engines?.node || '').includes('20')) {
  failures.push('functions/package.json must require Node 20 or newer.');
}

if (firebaseConfig.functions?.source !== 'functions') {
  failures.push('firebase.json functions.source must be functions.');
}

if (firebaseConfig.functions?.runtime !== 'nodejs20') {
  failures.push('firebase.json functions.runtime must be nodejs20.');
}

if (!firebaseConfig.firestore?.indexes) {
  failures.push('firebase.json must deploy firestore.indexes.json.');
}

if (!fs.existsSync(path.join(root, 'firestore.indexes.json'))) {
  failures.push('firestore.indexes.json is missing.');
}

const studioPackage = readJson('assetfactory-studio/package.json');
if (!studioPackage.dependencies?.jszip) {
  failures.push('assetfactory-studio must declare jszip because packaging is imported by backend code.');
}

if (failures.length) {
  console.error('Runtime consistency check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Runtime consistency check passed.');
