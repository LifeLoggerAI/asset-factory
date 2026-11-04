import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { verifyAudio, verifyMovie, verifyPng } from '../film_foundry/finite_time/validate-decoded-media.mjs';

// Genuine small encoded fixtures exercise local media decoders. They are not
// family media, provider lifecycles, artistic approval or final rendering.
let folder;
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `Required local ffmpeg fixture encoder failed: ${result.stderr}`);
}
before(() => {
  folder = mkdtempSync(join(tmpdir(), 'urai-finite-time-media-'));
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=64x64:r=24', '-frames:v', '1', '-threads', '1', join(folder, 'frame.png')]);
  for (const [name, signal] of [['audible.wav', 'sine=frequency=440:sample_rate=48000'], ['silent.wav', 'anullsrc=r=48000:cl=stereo']]) {
    ffmpeg(['-f', 'lavfi', '-i', signal, '-t', '1', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', join(folder, name)]);
  }
  for (const [name, duration, rate, sound] of [
    ['movie.mp4', '1', '24', 'sine=frequency=440:sample_rate=48000'],
    ['short.mp4', '0.5', '24', 'sine=frequency=440:sample_rate=48000'],
    ['wrong-fps.mp4', '1', '30', 'sine=frequency=440:sample_rate=48000'],
    ['silent.mp4', '1', '24', 'anullsrc=r=48000:cl=stereo'],
  ]) {
    ffmpeg(['-f', 'lavfi', '-i', `testsrc2=s=64x64:r=${rate}`, '-f', 'lavfi', '-i', sound,
      '-t', duration, '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', join(folder, name)]);
  }
});
after(() => { if (folder) rmSync(folder, { recursive: true, force: true }); });

test('real PNG board bytes decode at their declared dimensions', () => {
  const result = verifyPng(join(folder, 'frame.png'), { width: 64, height: 64 });
  assert.equal(result.decoded, true);
  assert.equal(result.codec, 'png');
});
test('oversized random bytes cannot pass as a PNG board', () => {
  const file = join(folder, 'corrupt.png');
  writeFileSync(file, 'corrupt-media'.repeat(2000));
  assert.throws(() => verifyPng(file, { width: 64, height: 64 }), /not PNG bytes/);
});
test('PNG extension containing SVG is rejected', () => {
  const file = join(folder, 'svg.png');
  writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>');
  assert.throws(() => verifyPng(file, { width: 64, height: 64 }), /not PNG bytes/);
});
test('PNG dimensions must match the actual board contract', () => {
  assert.throws(() => verifyPng(join(folder, 'frame.png')), /width mismatch/);
});
test('a valid PNG header cannot conceal truncated image data', () => {
  const file = join(folder, 'truncated.png');
  writeFileSync(file, readFileSync(join(folder, 'frame.png')).subarray(0, 100));
  assert.throws(() => verifyPng(file, { width: 64, height: 64 }));
});
test('real stereo PCM audio fully decodes and has audible samples', () => {
  const result = verifyAudio(join(folder, 'audible.wav'), { duration: 1 });
  assert.equal(result.decoded, true);
  assert.equal(result.channels, 2);
  assert.ok(Number(result.peakDb) > -60);
});
test('silent scratch narration is rejected', () => {
  assert.throws(() => verifyAudio(join(folder, 'silent.wav'), { duration: 1 }), /silent or inaudible/);
});
test('audio duration is bound to the timeline', () => {
  assert.throws(() => verifyAudio(join(folder, 'audible.wav'), { duration: 2 }), /duration/);
});
test('oversized random bytes cannot pass as WAV audio', () => {
  const file = join(folder, 'corrupt.wav');
  writeFileSync(file, 'corrupt-media'.repeat(2000));
  assert.throws(() => verifyAudio(file, { duration: 1 }), /not RIFF bytes/);
});
test('real H264/AAC movie fully decodes all frames and its soundtrack', () => {
  const result = verifyMovie(join(folder, 'movie.mp4'), { duration: 1, width: 64, height: 64 });
  assert.equal(result.decoded, true);
  assert.equal(result.decodedFrames, 24);
});
test('oversized random bytes cannot pass as a claimed MP4', () => {
  const file = join(folder, 'corrupt.mp4');
  writeFileSync(file, 'corrupt-media'.repeat(50000));
  assert.throws(() => verifyMovie(file, { duration: 1, width: 64, height: 64 }), /ffprobe rejected/);
});
test('short movie cannot pass the full timeline', () => {
  assert.throws(() => verifyMovie(join(folder, 'short.mp4'), { duration: 1, width: 64, height: 64 }), /duration/);
});
test('incorrect movie frame rate is rejected', () => {
  assert.throws(() => verifyMovie(join(folder, 'wrong-fps.mp4'), { duration: 1, width: 64, height: 64 }));
});
test('movie silence is caught after decoding an otherwise valid audio stream', () => {
  assert.throws(() => verifyMovie(join(folder, 'silent.mp4'), { duration: 1, width: 64, height: 64 }), /silent or inaudible soundtrack/);
});
test('valid container metadata cannot conceal a truncated movie', () => {
  const file = join(folder, 'truncated.mp4');
  const bytes = readFileSync(join(folder, 'movie.mp4'));
  writeFileSync(file, bytes.subarray(0, bytes.length - 500));
  assert.throws(() => verifyMovie(file, { duration: 1, width: 64, height: 64 }));
});
