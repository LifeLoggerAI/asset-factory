import assert from 'node:assert/strict';
import fs from 'node:fs';

// Node's test file patterns can silently omit missing explicit inputs. Refuse
// incomplete source admission before the suite can report a smaller green run.
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
assert.ok(pkg.scripts.test.startsWith('node --test '), 'Explicit test-file command required');
const files = pkg.scripts.test.slice('node --test '.length).trim().split(/\s+/);
assert.ok(files.length > 0, 'Test inputs required');
for (const file of files) {
  assert.match(file, /^[\w.-]+\.mjs$/, 'Explicit local test files required');
  assert.ok(fs.existsSync(new URL(file, import.meta.url)), `Missing declared test input: ${file}`);
}
