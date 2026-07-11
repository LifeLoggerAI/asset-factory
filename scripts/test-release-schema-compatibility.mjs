import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const certify = fs.readFileSync(path.join(root, 'image_asset_generator', 'certify_dropin.py'), 'utf8');
const rights = fs.readFileSync(path.join(root, 'multimodal', 'validate_rights.py'), 'utf8');

for (const [source, needle, label] of [
  [certify, 'SUPPORTED_RIGHTS_REPORT_SCHEMAS = {"1.1.0", "1.2.0"}', 'supported rights report schema set'],
  [certify, 'rights.get("schemaVersion") not in SUPPORTED_RIGHTS_REPORT_SCHEMAS', 'certifier schema compatibility check'],
  [rights, '"schemaVersion": "1.2.0"', 'current rights report schema'],
]) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

console.log('PASS rights report and certification schema compatibility');
