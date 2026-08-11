import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputDir = resolve(process.argv[2] ?? 'film_foundry/finite_time/dist/farm-to-lake');
const readJson = (name) => JSON.parse(readFileSync(join(outputDir, name), 'utf8'));
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const receipt = readJson('receipt.json');
const timeline = readJson('timeline.json');
const haptics = readJson('haptics.json');

assert.equal(receipt.schemaVersion, 'finite-time-no-spend-receipt-v1');
assert.equal(receipt.renderMode, 'deterministic-local-proof');
assert.equal(receipt.deterministic, true);
assert.equal(receipt.providerCallsExecuted, 0);
assert.equal(receipt.spendUsd, 0);
assert.equal(receipt.secretsUsed, false);
assert.equal(receipt.networkRequired, false);
assert.equal(receipt.finalRenderingAuthorized, false);
assert.equal(receipt.shotCount, 30);
assert.equal(receipt.sceneCount, 10);
assert.equal(receipt.durationSeconds, 180);
assert.equal(timeline.providerSpendAuthorized, false);
assert.equal(timeline.finalRenderingAuthorized, false);
assert.equal(timeline.shots.length, 30);
assert.equal(timeline.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 180);
assert.ok(haptics.cues.length > 0);
assert.ok(haptics.cues.every((cue) => cue.atSeconds >= 0 && cue.atSeconds <= 180));

const frames = readdirSync(join(outputDir, 'frames')).filter((file) => file.endsWith('.svg')).sort();
assert.equal(frames.length, 30);
assert.deepEqual(frames, Array.from({ length: 30 }, (_, index) => `ft-fl-${String(index + 1).padStart(3, '0')}.svg`));
for (const frame of frames) {
  const source = readFileSync(join(outputDir, 'frames', frame), 'utf8');
  assert.match(source, /no provider · \$0 spend · final rendering not authorized/);
  assert.doesNotMatch(source, /drive\.google\.com|google\.com\/maps|private-user-images|OPENAI_API_KEY|REPLICATE_API_TOKEN/);
}

for (const [file, expected] of Object.entries(receipt.fileHashes)) {
  assert.ok(existsSync(join(outputDir, file)), `${file} is missing`);
  assert.equal(sha(readFileSync(join(outputDir, file))), expected, `${file} hash mismatch`);
  assert.ok(statSync(join(outputDir, file)).size > 0, `${file} is empty`);
}
assert.match(readFileSync(join(outputDir, 'captions.srt'), 'utf8'), /00:00:00,000 --> 00:00:06,000/);
assert.match(readFileSync(join(outputDir, 'audio-description.txt'), 'utf8'), /ft-fl-030/);
assert.match(readFileSync(join(outputDir, 'review-gallery.html'), 'utf8'), /30 shots · 180 seconds/);
if (receipt.mp4Generated) {
  assert.ok(existsSync(join(outputDir, 'farm-to-lake-animatic.mp4')));
  assert.ok(statSync(join(outputDir, 'farm-to-lake-animatic.mp4')).size > 100_000);
}
console.log(`Validated FINITE TIME Farm-to-Lake no-spend animatic at ${outputDir}`);
