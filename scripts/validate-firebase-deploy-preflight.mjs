import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const errors = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function hasDependency(lock, name) {
  const packages = lock.packages || {};
  return Object.keys(packages).some((pkgPath) => pkgPath === `node_modules/${name}` || pkgPath.endsWith(`/node_modules/${name}`));
}

const firebaseConfig = readJson('firebase.json');
const functionsSource = firebaseConfig.functions?.source;
if (!functionsSource) errors.push('firebase.json missing functions.source');
if (!firebaseConfig.hosting?.site) errors.push('firebase.json missing hosting.site');
if (!firebaseConfig.hosting?.rewrites?.some((rewrite) => rewrite.source === '/api/health')) {
  errors.push('firebase.json missing /api/health hosting rewrite');
}

if (functionsSource) {
  const packagePath = `${functionsSource}/package.json`;
  const lockPath = `${functionsSource}/package-lock.json`;
  const packageJson = readJson(packagePath);
  if (!fs.existsSync(path.join(root, lockPath))) {
    errors.push(`${lockPath} is missing`);
  } else {
    const lock = readJson(lockPath);
    for (const dependencyName of Object.keys(packageJson.dependencies || {})) {
      if (!hasDependency(lock, dependencyName)) {
        errors.push(`${lockPath} does not include dependency ${dependencyName}`);
      }
    }
    for (const dependencyName of Object.keys(packageJson.devDependencies || {})) {
      if (!hasDependency(lock, dependencyName)) {
        errors.push(`${lockPath} does not include devDependency ${dependencyName}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Firebase deploy preflight validation passed');
