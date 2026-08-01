import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputDir = resolve(process.argv[2] ?? 'film_foundry/finite_time/dist/farm-to-lake-storyboard-v2');
const readJson = (name) => JSON.parse(readFileSync(join(outputDir, name), 'utf8'));
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const receipt = readJson('receipt.json');
const timeline = readJson('timeline.json');
const haptics = readJson('haptics.json');

assert.equal(receipt.schemaVersion, 'finite-time-no-spend-storyboard-receipt-v2');
assert.equal(receipt.storyboardVersion, 2);
assert.equal(receipt.sceneSpecificBoards, true);
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
assert.ok(receipt.distinctDurations >= 5);
assert.equal(receipt.scratchNarrationGenerated, true);
assert.equal(receipt.scratchNarrationLabel, 'timing-only-not-approved');
assert.equal(receipt.temporaryAmbienceFoleyGenerated, true);
assert.equal(receipt.captionsGenerated, true);
assert.equal(receipt.audioDescriptionGenerated, true);
assert.equal(receipt.hapticsGenerated, true);
assert.equal(receipt.contactSheetGenerated, true);
assert.equal(receipt.reviewGalleryGenerated, true);
assert.equal(receipt.mp4Generated, true);

assert.equal(timeline.schemaVersion, 'finite-time-storyboard-timeline-v2');
assert.equal(timeline.providerSpendAuthorized, false);
assert.equal(timeline.finalRenderingAuthorized, false);
assert.equal(timeline.shots.length, 30);
assert.equal(timeline.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 180);
assert.deepEqual(timeline.shots.map((shot) => shot.durationSeconds), [8,6,6,5,4,6,5,5,7,6,5,5,4,4,6,6,8,6,5,6,7,5,5,7,9,7,8,5,5,9]);
assert.equal(timeline.shots[0].startSeconds, 0);
assert.equal(timeline.shots[0].endSeconds, 8);
assert.equal(timeline.shots.at(-1).endSeconds, 180);
assert.ok(timeline.shots.every((shot) => shot.scratchNarration && shot.boardSvg && shot.boardPng));

assert.ok(haptics.cues.length > 0);
assert.ok(haptics.cues.every((cue) => cue.atSeconds >= 0 && cue.atSeconds <= 180));
const ids = Array.from({ length: 30 }, (_, index) => `ft-fl-${String(index + 1).padStart(3, '0')}`);
assert.deepEqual(readdirSync(join(outputDir, 'frames-svg')).filter((file) => file.endsWith('.svg')).sort(), ids.map((id) => `${id}.svg`));
assert.deepEqual(readdirSync(join(outputDir, 'frames-png')).filter((file) => file.endsWith('.png')).sort(), ids.map((id) => `${id}.png`));
for (const id of ids) {
  const source = readFileSync(join(outputDir, 'frames-svg', `${id}.svg`), 'utf8');
  assert.match(source, /STORYBOARD ANIMATIC V2/);
  assert.match(source, /SCRATCH NARRATION · TIMING ONLY/);
  assert.match(source, /no provider · \$0 spend · final rendering not authorized/);
  assert.match(source, new RegExp(id));
  assert.doesNotMatch(source, /drive\.google\.com|google\.com\/maps|private-user-images|OPENAI_API_KEY|REPLICATE_API_TOKEN|ELEVENLABS_API_KEY/);
  assert.ok(statSync(join(outputDir, 'frames-png', `${id}.png`)).size > 10_000);
}
for (const [file, expected] of Object.entries(receipt.fileHashes)) {
  assert.ok(existsSync(join(outputDir, file)), `${file} missing`);
  assert.equal(sha(readFileSync(join(outputDir, file))), expected, `${file} hash mismatch`);
  assert.ok(statSync(join(outputDir, file)).size > 0, `${file} empty`);
}
assert.match(readFileSync(join(outputDir, 'captions.srt'), 'utf8'), /00:00:00,000 --> 00:00:08,000/);
assert.match(readFileSync(join(outputDir, 'captions.srt'), 'utf8'), /Lake O’ the Pines/);
assert.match(readFileSync(join(outputDir, 'review-gallery.html'), 'utf8'), /30 scene-specific boards/);
assert.match(readFileSync(join(outputDir, 'README.md'), 'utf8'), /separate from the audited static-card v1/);
assert.ok(statSync(join(outputDir, 'farm-to-lake-storyboard-animatic-v2.mp4')).size > 500_000);
assert.ok(statSync(join(outputDir, 'scratch-narration.wav')).size > 1_000_000);
assert.ok(statSync(join(outputDir, 'scratch-mix.wav')).size > 1_000_000);
assert.ok(statSync(join(outputDir, 'contact-sheet.png')).size > 100_000);
console.log(`Validated FINITE TIME Farm-to-Lake storyboard animatic v2 at ${outputDir}`);
