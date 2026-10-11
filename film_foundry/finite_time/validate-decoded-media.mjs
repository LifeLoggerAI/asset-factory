import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const durationTolerance = 0.125;
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// Media is local, generated no-spend evidence. The parser must not resolve
// remote manifests or substitute a provider call for missing local bytes.
function mediaCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${command} rejected ${basename(args.at(-1))} or exceeded its local deadline`);
  return result;
}

export function probeMedia(file) {
  const result = mediaCommand('ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file,pipe',
    '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channels,duration',
    '-of', 'json', file,
  ]);
  return JSON.parse(result.stdout);
}

function assertDuration(value, expected, label) {
  const actual = Number(value);
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= durationTolerance, `${label} duration does not match the timeline`);
}

export function verifyPng(file, { width = 1920, height = 1080 } = {}) {
  const bytes = readFileSync(file);
  assert.ok(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${basename(file)} is not PNG bytes`);
  assert.equal(bytes.readUInt32BE(8), 13, `${basename(file)} has invalid PNG IHDR`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), width, `${basename(file)} width mismatch`);
  assert.equal(bytes.readUInt32BE(20), height, `${basename(file)} height mismatch`);
  const metadata = probeMedia(file);
  assert.equal(metadata.streams?.length, 1, `${basename(file)} has unexpected streams`);
  assert.equal(metadata.streams[0].codec_name, 'png');
  assert.equal(metadata.streams[0].width, width);
  assert.equal(metadata.streams[0].height, height);
  mediaCommand('ffmpeg', ['-v', 'error', '-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file,pipe', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-']);
  return { file: basename(file), sha256: sha(bytes), codec: 'png', width, height, decoded: true };
}

export function verifyAudio(file, { duration = 180, requireAudible = true } = {}) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${basename(file)} is not RIFF bytes`);
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', `${basename(file)} is not WAV bytes`);
  const metadata = probeMedia(file);
  assert.equal(metadata.format?.format_name, 'wav');
  assert.equal(metadata.streams?.length, 1, `${basename(file)} has unexpected streams`);
  const stream = metadata.streams[0];
  assert.equal(stream.codec_name, 'pcm_s16le');
  assert.equal(stream.sample_rate, '48000');
  assert.equal(stream.channels, 2);
  assertDuration(metadata.format.duration, duration, basename(file));
  const result = mediaCommand('ffmpeg', ['-v', 'info', '-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file,pipe', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
  const peak = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/.exec(result.stderr);
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/.exec(result.stderr);
  assert.ok(peak && mean, `${basename(file)} has no decoded audio measurement`);
  if (requireAudible) assert.ok(Number.isFinite(Number(peak[1])) && Number(peak[1]) > -60, `${basename(file)} is silent or inaudible`);
  return { file: basename(file), sha256: sha(bytes), codec: stream.codec_name, sampleRate: 48000, channels: 2, durationSeconds: Number(metadata.format.duration), peakDb: peak[1], meanDb: mean[1], decoded: true };
}

export function verifyMovie(file, { duration = 180, width = 1920, height = 1080 } = {}) {
  const metadata = probeMedia(file);
  assert.ok(metadata.format?.format_name.split(',').includes('mp4'), `${basename(file)} is not an MP4 container`);
  assert.equal(metadata.streams?.length, 2, `${basename(file)} must contain one video and one audio stream`);
  const video = metadata.streams.find(stream => stream.codec_type === 'video');
  const audio = metadata.streams.find(stream => stream.codec_type === 'audio');
  assert.ok(video && audio, `${basename(file)} requires decoded video and audio`);
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, width);
  assert.equal(video.height, height);
  assert.equal(video.pix_fmt, 'yuv420p');
  assert.equal(video.r_frame_rate, '24/1');
  assert.equal(audio.codec_name, 'aac');
  assert.equal(audio.sample_rate, '48000');
  assert.equal(audio.channels, 2);
  assertDuration(metadata.format.duration, duration, basename(file));
  assertDuration(video.duration, duration, `${basename(file)} video`);
  assertDuration(audio.duration, duration, `${basename(file)} audio`);
  const decoded = mediaCommand('ffmpeg', ['-v', 'info', '-xerror', '-err_detect', 'explode', '-protocol_whitelist', 'file,pipe', '-i', file, '-map', '0:v:0', '-map', '0:a:0', '-af', 'volumedetect', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-']);
  assert.match(decoded.stdout, /progress=end(?:\r?\n|$)/, `${basename(file)} did not finish decoding`);
  const frames = [...decoded.stdout.matchAll(/^frame=(\d+)\s*$/gm)].at(-1);
  assert.ok(frames && Math.abs(Number(frames[1]) - Math.round(duration * 24)) <= 2, `${basename(file)} decoded frame count does not match the timeline`);
  const peak = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf) dB/.exec(decoded.stderr);
  assert.ok(peak && Number.isFinite(Number(peak[1])) && Number(peak[1]) > -60, `${basename(file)} has a silent or inaudible soundtrack`);
  return { file: basename(file), sha256: sha(readFileSync(file)), videoCodec: 'h264', audioCodec: 'aac', width, height, fps: 24, durationSeconds: Number(metadata.format.duration), decodedFrames: Number(frames[1]), soundtrackPeakDb: peak[1], decoded: true };
}

export function validateDecodedStoryboard(outputDir) {
  const receipt = JSON.parse(readFileSync(join(outputDir, 'receipt.json'), 'utf8'));
  const timeline = JSON.parse(readFileSync(join(outputDir, 'timeline.json'), 'utf8'));
  assert.equal(receipt.schemaVersion, 'finite-time-no-spend-storyboard-receipt-v2');
  assert.equal(receipt.renderMode, 'deterministic-local-proof');
  assert.equal(receipt.providerCallsExecuted, 0);
  assert.equal(receipt.spendUsd, 0);
  assert.equal(receipt.finalRenderingAuthorized, false);
  assert.equal(receipt.mp4Generated, true, 'Playable local animatic is required for decoded-media acceptance');
  assert.equal(receipt.scratchNarrationGenerated, true, 'Audible local scratch narration is required for decoded-media acceptance');
  assert.equal(timeline.shots.length, 30);
  assert.equal(timeline.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 180);
  const frames = timeline.shots.map((shot, index) => {
    const id = `ft-fl-${String(index + 1).padStart(3, '0')}`;
    assert.equal(shot.id, id);
    assert.equal(shot.boardPng, `frames-png/${id}.png`, 'Frame paths must remain canonical local files');
    return verifyPng(join(outputDir, shot.boardPng));
  });
  const audio = ['temporary-ambience-foley.wav', 'scratch-narration.wav', 'scratch-mix.wav'].map(name => verifyAudio(join(outputDir, name)));
  const movie = verifyMovie(join(outputDir, 'farm-to-lake-storyboard-animatic-v2.mp4'));
  return { schemaVersion: 'finite-time-decoded-media-validation-v1', evidenceScope: 'local-no-spend-media-decode-only', sourceReceiptSha256: sha(readFileSync(join(outputDir, 'receipt.json'))), sourceTimelineSha256: sha(readFileSync(join(outputDir, 'timeline.json'))), providerCallsExecuted: 0, spendUsd: 0, finalRenderingAuthorized: false, productionVisualAcceptance: false, frames, audio, movie };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = resolve(process.argv[2] ?? 'film_foundry/finite_time/dist/farm-to-lake-storyboard-v2');
  const result = validateDecodedStoryboard(outputDir);
  writeFileSync(join(outputDir, 'decoded-media-validation.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Decoded all 30 PNG boards, three audible stereo audio tracks and the complete 180-second local animatic at ${outputDir}`);
}
