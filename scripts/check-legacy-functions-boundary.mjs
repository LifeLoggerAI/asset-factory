#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const source = firebase?.functions?.source;

if (source !== 'life-map-pipeline/functions') {
  console.error(`LEGACY_FUNCTIONS_BOUNDARY=RED: expected active Firebase Functions source life-map-pipeline/functions, got ${JSON.stringify(source)}`);
  process.exit(1);
}

const legacyPackage = JSON.parse(fs.readFileSync(path.join(root, 'functions', 'package.json'), 'utf8'));
if (legacyPackage?.engines?.node !== '18') {
  console.error('LEGACY_FUNCTIONS_BOUNDARY=RED: historical functions tree changed runtime identity; re-audit before altering the boundary.');
  process.exit(1);
}

console.log('LEGACY_FUNCTIONS_BOUNDARY=GREEN');
console.log('ACTIVE_FUNCTIONS_SOURCE=life-map-pipeline/functions');
console.log('LEGACY_FUNCTIONS_SOURCE=functions');
console.log('LEGACY_DEPLOY_AUTHORITY=false');
