import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const certify = fs.readFileSync(path.join(root, 'image_asset_generator', 'certify_dropin.py'), 'utf8');
const rights = fs.readFileSync(path.join(root, 'multimodal', 'validate_rights.py'), 'utf8');
const manifestValidator = fs.readFileSync(path.join(root, 'multimodal', 'validate_manifest.py'), 'utf8');
const manifestSchema = JSON.parse(fs.readFileSync(path.join(root, 'multimodal', 'full-multimodal-asset-manifest.schema.json'), 'utf8'));

for (const [source, needle, label] of [
  [certify, 'SUPPORTED_RIGHTS_REPORT_SCHEMAS = {"1.1.0", "1.2.0"}', 'supported rights report schema set'],
  [certify, 'rights.get("schemaVersion") not in SUPPORTED_RIGHTS_REPORT_SCHEMAS', 'certifier schema compatibility check'],
  [rights, '"schemaVersion": "1.2.0"', 'current rights report schema'],
  [manifestValidator, 'not isinstance(asset["promotionPr"], str)', 'certified promotion PR string requirement'],
  [manifestValidator, '"github.com/LifeLoggerAI/" not in asset["promotionPr"]', 'canonical promotion PR host requirement'],
]) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

const promotionPr = manifestSchema?.properties?.assets?.items?.properties?.promotionPr;
if (!promotionPr || JSON.stringify(promotionPr.type) !== JSON.stringify(['string', 'null'])) {
  throw new Error(`promotionPr schema must allow string or null: ${JSON.stringify(promotionPr)}`);
}
const expectedPattern = '^https://github\\.com/LifeLoggerAI/[A-Za-z0-9_.-]+/pull/[1-9][0-9]*$';
if (promotionPr.pattern !== expectedPattern) {
  throw new Error(`promotionPr schema pattern drifted: ${promotionPr.pattern}`);
}

console.log('PASS rights report, certification, and promotion PR schema compatibility');
