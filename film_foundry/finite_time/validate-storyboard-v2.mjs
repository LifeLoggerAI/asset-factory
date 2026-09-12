import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputDir = resolve(process.argv[2] ?? 'film_foundry/finite_time/dist/farm-to-lake-storyboard-v2');
const readJson = (name) => JSON.parse(readFileSync(join(outputDir, name), 'utf8'));
const readText = (name) => readFileSync(join(outputDir, name), 'utf8');
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const receipt = readJson('receipt.json');
const timeline = readJson('timeline.json');
const haptics = readJson('haptics.json');

const parseTimecode = (value) => {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value);
  assert.ok(match, `invalid SRT timecode: ${value}`);
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
};
const parseSrt = (name) => readText(name).trim().split(/\r?\n\r?\n/).map((block) => {
  const lines = block.split(/\r?\n/);
  assert.ok(lines.length >= 3, `${name} cue is incomplete`);
  const [startRaw, endRaw] = lines[1].split(' --> ');
  assert.ok(startRaw && endRaw, `${name} cue has invalid timing`);
  return {
    index: Number(lines[0]),
    startSeconds: parseTimecode(startRaw),
    endSeconds: parseTimecode(endRaw),
    text: lines.slice(2).join(' ').trim(),
  };
});

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
assert.equal(receipt.scratchNarrationLabel, 'timing-only-not-approved');
assert.equal(receipt.temporaryAmbienceFoleyGenerated, true);
assert.equal(receipt.captionsGenerated, true);
assert.equal(receipt.audioDescriptionGenerated, true);
assert.equal(receipt.hapticsGenerated, true);
assert.equal(receipt.reviewGalleryGenerated, true);

if (receipt.scratchNarrationGenerated) {
  assert.ok(statSync(join(outputDir, 'scratch-narration.wav')).size > 1_000_000);
  assert.ok(statSync(join(outputDir, 'scratch-mix.wav')).size > 1_000_000);
} else {
  assert.ok(statSync(join(outputDir, 'scratch-narration.wav')).size > 0);
  assert.ok(statSync(join(outputDir, 'scratch-mix.wav')).size > 0);
}
if (receipt.mp4Generated) {
  assert.ok(statSync(join(outputDir, 'farm-to-lake-storyboard-animatic-v2.mp4')).size > 500_000);
}
if (receipt.contactSheetGenerated) {
  assert.ok(statSync(join(outputDir, 'contact-sheet.png')).size > 100_000);
}

assert.equal(timeline.schemaVersion, 'finite-time-storyboard-timeline-v2');
assert.equal(timeline.providerSpendAuthorized, false);
assert.equal(timeline.finalRenderingAuthorized, false);
assert.equal(timeline.shots.length, 30);
assert.equal(timeline.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 180);
assert.deepEqual(timeline.shots.map((shot) => shot.durationSeconds), [8,6,6,5,4,6,5,5,7,6,5,5,4,4,6,6,8,6,5,6,7,5,5,7,9,7,8,5,5,9]);
assert.equal(timeline.shots[0].startSeconds, 0);
assert.equal(timeline.shots[0].endSeconds, 8);
assert.equal(timeline.shots.at(-1).endSeconds, 180);
assert.ok(timeline.shots.every((shot) => shot.scratchNarration && shot.audioDescription && shot.boardSvg && shot.boardPng));
for (const [index, shot] of timeline.shots.entries()) {
  assert.ok(shot.durationSeconds > 0, `${shot.id} duration must be positive`);
  assert.equal(shot.endSeconds - shot.startSeconds, shot.durationSeconds, `${shot.id} timing mismatch`);
  if (index > 0) assert.equal(shot.startSeconds, timeline.shots[index - 1].endSeconds, `${shot.id} timeline gap/overlap`);
}

const ids = Array.from({ length: 30 }, (_, index) => `ft-fl-${String(index + 1).padStart(3, '0')}`);
assert.deepEqual(timeline.shots.map((shot) => shot.id), ids);
assert.equal(new Set(timeline.shots.map((shot) => shot.id)).size, 30);
const expectedScenes = [
  'scene-land-before-water',
  'scene-ice-and-cow',
  'scene-farm-work',
  'scene-family-chaos',
  'scene-cat-and-mask',
  'scene-digital-door',
  'scene-school-mornings',
  'scene-snake-shoe',
  'scene-land-to-water',
  'scene-ski-nautique',
].flatMap((sceneId) => Array(3).fill(sceneId));
assert.deepEqual(timeline.shots.map((shot) => shot.sceneId), expectedScenes, 'storyboard scene sequence drifted');

const expectedSemanticMarkers = new Map([
  ['ft-fl-021', ['SCHOOL', 'DROP-OFF · DRIVE AWAY']],
  ['ft-fl-022', ['AFTER BOOT CAMP · BIGGER / STRONGER', 'LEAVING FOR SCHOOL']],
  ['ft-fl-023', ['DEAD SNAKE · SHOE']],
  ['ft-fl-024', ['COULD NOT. TRIED ANYWAY.']],
]);
const forbiddenSemanticMarkers = new Map([
  ['ft-fl-021', ['AFTER BOOT CAMP', 'BIGGER · STRONGER']],
  ['ft-fl-022', ['DEAD SNAKE · SHOE']],
  ['ft-fl-023', ['COULD NOT. TRIED ANYWAY.']],
]);

assert.deepEqual(readdirSync(join(outputDir, 'frames-svg')).filter((file) => file.endsWith('.svg')).sort(), ids.map((id) => `${id}.svg`));
assert.deepEqual(readdirSync(join(outputDir, 'frames-png')).filter((file) => file.endsWith('.png')).sort(), ids.map((id) => `${id}.png`));
for (const id of ids) {
  const source = readText(join('frames-svg', `${id}.svg`));
  assert.match(source, /STORYBOARD ANIMATIC V2/);
  assert.match(source, /SCRATCH NARRATION · TIMING ONLY/);
  assert.match(source, /no provider · \$0 spend · final rendering not authorized/);
  assert.match(source, new RegExp(id));
  const drawingGeometryCount = (source.match(/<(?:line|path|circle|ellipse|rect)\b/g) ?? []).length;
  assert.ok(drawingGeometryCount >= 3, `${id} has no scene-specific drawing geometry`);
  for (const marker of expectedSemanticMarkers.get(id) ?? []) assert.ok(source.includes(marker), `${id} missing semantic marker: ${marker}`);
  for (const marker of forbiddenSemanticMarkers.get(id) ?? []) assert.ok(!source.includes(marker), `${id} contains stale semantic marker: ${marker}`);
  assert.doesNotMatch(source, /drive\.google\.com|google\.com\/maps|private-user-images|OPENAI_API_KEY|REPLICATE_API_TOKEN|ELEVENLABS_API_KEY|sk-proj-/);
  assert.ok(statSync(join(outputDir, 'frames-png', `${id}.png`)).size > 10_000, `${id}.png suspiciously small`);
}

const captions = parseSrt('captions.srt');
const descriptions = parseSrt('audio-description.srt');
for (const [name, cues] of [['captions.srt', captions], ['audio-description.srt', descriptions]]) {
  assert.equal(cues.length, 30, `${name} must contain 30 cues`);
  for (const [index, cue] of cues.entries()) {
    const shot = timeline.shots[index];
    assert.equal(cue.index, index + 1, `${name} cue numbering drifted`);
    assert.equal(cue.startSeconds, shot.startSeconds, `${name} ${shot.id} start mismatch`);
    assert.equal(cue.endSeconds, shot.endSeconds, `${name} ${shot.id} end mismatch`);
    assert.ok(cue.endSeconds > cue.startSeconds, `${name} ${shot.id} has zero/negative duration`);
    if (index > 0) assert.ok(cue.startSeconds >= cues[index - 1].endSeconds, `${name} has overlapping cues`);
  }
}
assert.deepEqual(captions.map((cue) => cue.text), timeline.shots.map((shot) => shot.scratchNarration), 'caption/narration drifted');
assert.deepEqual(descriptions.map((cue) => cue.text), timeline.shots.map((shot) => shot.audioDescription), 'audio-description planning text drifted');

assert.ok(haptics.cues.length > 0);
const allowedHapticPatterns = new Set(['soft-pulse', 'texture', 'rising', 'double-pulse', 'impact']);
const hapticKeys = new Set();
for (const cue of haptics.cues) {
  const shot = timeline.shots.find((candidate) => candidate.id === cue.shotId);
  assert.ok(shot, `haptic references unknown shot ${cue.shotId}`);
  assert.ok(cue.atSeconds >= shot.startSeconds && cue.atSeconds <= shot.endSeconds, `${cue.shotId} haptic escapes shot boundary`);
  assert.ok(Number.isFinite(cue.intensity) && cue.intensity >= 0 && cue.intensity <= 1, `${cue.shotId} haptic intensity invalid`);
  assert.ok(allowedHapticPatterns.has(cue.pattern), `${cue.shotId} haptic pattern invalid`);
  const key = `${cue.shotId}|${cue.atSeconds}|${cue.pattern}`;
  assert.ok(!hapticKeys.has(key), `duplicate haptic cue ${key}`);
  hapticKeys.add(key);
}

for (const [file, expected] of Object.entries(receipt.fileHashes)) {
  assert.ok(existsSync(join(outputDir, file)), `${file} missing`);
  assert.equal(sha(readFileSync(join(outputDir, file))), expected, `${file} hash mismatch`);
  assert.ok(statSync(join(outputDir, file)).size > 0, `${file} empty`);
}

const secretPattern = /OPENAI_API_KEY|REPLICATE_API_TOKEN|ELEVENLABS_API_KEY|sk-proj-[A-Za-z0-9_-]+/;
for (const file of ['README.md', 'captions.srt', 'audio-description.srt', 'haptics.json', 'timeline.json', 'review-gallery.html', 'sha256sums.txt']) {
  assert.doesNotMatch(readText(file), secretPattern, `${file} contains a secret marker/value`);
}
assert.match(readText('captions.srt'), /00:00:00,000 --> 00:00:08,000/);
assert.match(readText('captions.srt'), /Lake O’ the Pines/);
assert.match(readText('review-gallery.html'), /30 scene-specific boards/);
assert.match(readText('README.md'), /separate from the audited static-card v1/);
console.log(`Validated FINITE TIME Farm-to-Lake storyboard animatic v2 at ${outputDir}`);
