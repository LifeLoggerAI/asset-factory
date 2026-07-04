import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const studioRoot = process.cwd().endsWith('assetfactory-studio') ? process.cwd() : path.join(process.cwd(), 'assetfactory-studio');
const requireFromStudio = createRequire(path.join(studioRoot, 'package.json'));
for (const [specifier, legacyPath] of [
  ['firebase-admin/app', 'firebase-admin/app/lib/index.js'],
  ['firebase-admin/firestore', 'firebase-admin/firestore/lib/index.js'],
  ['firebase-admin/storage', 'firebase-admin/storage/lib/index.js'],
]) {
  const resolved = requireFromStudio.resolve(specifier);
  const compatibilityPath = path.join(studioRoot, 'node_modules', legacyPath);
  fs.mkdirSync(path.dirname(compatibilityPath), { recursive: true });
  if (!fs.existsSync(compatibilityPath)) fs.symlinkSync(resolved, compatibilityPath);
}
await import('./test-asset-factory-emulator-core.mjs');
