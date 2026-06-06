import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
const firebaseConfig = fs.readFileSync(path.join(root, 'firebase.json'), 'utf8');
const errors = [];

function requireText(source, label, text) {
  if (!source.includes(text)) errors.push(`${label} missing required text: ${text}`);
}

function requireAny(source, label, values) {
  if (!values.some((value) => source.includes(value))) {
    errors.push(`${label} missing one of: ${values.join(', ')}`);
  }
}

requireText(firebaseConfig, 'firebase.json', 'firestore.rules');
requireText(firebaseConfig, 'firebase.json', 'storage.rules');

for (const collection of [
  'assetManifests',
  'assetJobs',
  'assetPromptTemplates',
  'assetApprovals',
  'assetAuditLogs',
  'publicDemoAssets',
  'systemAssets',
]) {
  requireText(firestoreRules, 'firestore.rules', collection);
}

for (const rule of [
  'isAdmin()',
  'isPublicDemoSafeAsset()',
  'containsUserData == false',
  'sanitizedForDemo == true',
  'allow write: if false',
]) {
  requireText(firestoreRules, 'firestore.rules', rule);
}

for (const storagePath of [
  'system-assets',
  'public-demo-assets',
  'admin-assets',
  'asset-previews',
  'asset-audit-redacted',
  'users/{userId}/assets',
]) {
  requireText(storageRules, 'storage.rules', storagePath);
}

for (const guard of [
  'isAdmin()',
  'isRequestingUser(userId)',
  'model/gltf+json',
  'model/gltf-binary',
  'allow read, write: if false',
]) {
  requireText(storageRules, 'storage.rules', guard);
}

requireAny(storageRules, 'storage.rules', ['request.resource.size < 50 * 1024 * 1024', 'validUpload(50 * 1024 * 1024)']);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Firebase rules surface validation passed');
