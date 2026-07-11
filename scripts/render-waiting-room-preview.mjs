import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node scripts/render-waiting-room-preview.mjs <package-dir> <output-mp4>');
}

if (process.argv.length !== 4) {
  usage();
  process.exit(2);
}

const packageDir = path.resolve(process.cwd(), process.argv[2]);
const outputFile = path.resolve(process.cwd(), process.argv[3]);
const timelineFile = path.join(packageDir, 'timeline.json');
const packageFile = path.join(packageDir, 'package.json');
const packageReceiptFile = path.join(packageDir, 'receipt.json');
const captionsFile = path.join(packageDir, 'captions.srt');

for (const required of [timelineFile, packageFile, packageReceiptFile, captionsFile]) {
  if (!fs.existsSync(required) || !fs.statSync(required).isFile()) {
    console.error(`Missing required video package file: ${required}`);
    process.exit(2);
  }
}

function readJson(fileName) {
  try {
    return JSON.parse(fs.readFileSync(fileName, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256File(fileName) {
  return createHash('sha256').update(fs.readFileSync(fileName)).digest('hex');
}

function commandExists(command) {
  const result = spawnSync(command, ['-version'], { encoding: 'utf8' });
  return result.status === 0;
}

if (!commandExists('ffmpeg')) {
  console.error('ffmpeg is required to encode the deterministic technical preview');
  process.exit(2);
}
if (!commandExists('ffprobe')) {
  console.error('ffprobe is required to verify the deterministic technical preview');
  process.exit(2);
}

const timeline = readJson(timelineFile);
const packageManifest = readJson(packageFile);
const packageReceipt = readJson(packageReceiptFile);

if (timeline.schema !== 'urai-video-timeline-1') throw new Error('timeline schema mismatch');
if (packageManifest.schema !== 'urai-video-package-1') throw new Error('package schema mismatch');
if (packageReceipt.schema !== 'urai-video-package-receipt-1') throw new Error('package receipt schema mismatch');
if (timeline.rendered !== false || packageManifest.rendered !== false) {
  throw new Error('source package must be explicitly unrendered before technical preview encoding');
}
if (packageReceipt.providerSpend !== false) {
  throw new Error('technical preview source must prove no provider spend');
}

const durationSeconds = Number(timeline.durationSeconds);
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 90) {
  throw new Error(`invalid timeline duration: ${timeline.durationSeconds}`);
}

const outputDir = path.dirname(outputFile);
fs.mkdirSync(outputDir, { recursive: true });
if (fs.existsSync(outputFile)) {
  throw new Error(`Refusing to overwrite existing encoded preview: ${outputFile}`);
}

const temporaryOutput = `${outputFile}.tmp-${process.pid}.mp4`;
const subtitleFilter = [
  'subtitles=captions.srt',
  "force_style='FontName=DejaVu Sans,FontSize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=54'",
].join(':');

const ffmpegArgs = [
  '-nostdin',
  '-hide_banner',
  '-loglevel', 'error',
  '-f', 'lavfi',
  '-i', `color=c=0x070914:s=1280x720:r=24:d=${durationSeconds}`,
  '-f', 'lavfi',
  '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-vf', subtitleFilter,
  '-t', String(durationSeconds),
  '-metadata', `title=${timeline.title ?? timeline.jobId ?? 'URAI Waiting Room technical preview'}`,
  '-metadata', 'comment=URAI deterministic technical preview; not final footage; no provider spend',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-shortest',
  '-y',
  temporaryOutput,
];

const encoded = spawnSync('ffmpeg', ffmpegArgs, {
  cwd: packageDir,
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
if (encoded.status !== 0) {
  fs.rmSync(temporaryOutput, { force: true });
  throw new Error(`ffmpeg preview encoding failed: ${encoded.stderr || encoded.stdout || `exit ${encoded.status}`}`);
}

const probed = spawnSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration,format_name:stream=index,codec_type,codec_name,width,height,pix_fmt,sample_rate,channels',
  '-of', 'json',
  temporaryOutput,
], {
  encoding: 'utf8',
  maxBuffer: 5 * 1024 * 1024,
});
if (probed.status !== 0) {
  fs.rmSync(temporaryOutput, { force: true });
  throw new Error(`ffprobe verification failed: ${probed.stderr || probed.stdout || `exit ${probed.status}`}`);
}

const probe = JSON.parse(probed.stdout);
const videoStream = Array.isArray(probe.streams)
  ? probe.streams.find((stream) => stream.codec_type === 'video')
  : null;
const audioStream = Array.isArray(probe.streams)
  ? probe.streams.find((stream) => stream.codec_type === 'audio')
  : null;
const actualDuration = Number(probe.format?.duration);

if (!videoStream || videoStream.codec_name !== 'h264') {
  fs.rmSync(temporaryOutput, { force: true });
  throw new Error('encoded preview does not contain the required H.264 video stream');
}
if (videoStream.width !== 1280 || videoStream.height !== 720 || videoStream.pix_fmt !== 'yuv420p') {
  fs.rmSync(temporaryOutput, { force: true });
  throw new Error('encoded preview dimensions or pixel format do not match the technical-preview contract');
}
if (!audioStream || audioStream.codec_name !== 'aac') {
  fs.rmSync(temporaryOutput, { force: true });
  throw new Error('encoded preview does not contain the required AAC audio stream');
}
if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - durationSeconds) > 0.25) {
  fs.rmSync(temporaryOutput, { force: true });
  throw new Error(`encoded preview duration mismatch: expected ${durationSeconds}, got ${probe.format?.duration}`);
}

fs.renameSync(temporaryOutput, outputFile);
const receiptCore = {
  schema: 'urai-video-technical-preview-receipt-1',
  jobId: timeline.jobId,
  sourcePackageReceiptHash: packageReceipt.receiptHash,
  sourceTimelineHash: sha256File(timelineFile),
  sourceCaptionsHash: sha256File(captionsFile),
  outputFile: path.basename(outputFile),
  outputSha256: sha256File(outputFile),
  outputBytes: fs.statSync(outputFile).size,
  durationSeconds: actualDuration,
  video: {
    codec: videoStream.codec_name,
    width: videoStream.width,
    height: videoStream.height,
    pixelFormat: videoStream.pix_fmt,
  },
  audio: {
    codec: audioStream.codec_name,
    sampleRate: Number(audioStream.sample_rate),
    channels: audioStream.channels,
    content: 'silence-only',
  },
  captionsBurnedIn: fs.readFileSync(captionsFile, 'utf8').trim().length > 0,
  technicalPreview: true,
  productionReady: false,
  finalFootage: false,
  providerSpend: false,
  humanReviewRequired: true,
};
const receipt = {
  ...receiptCore,
  receiptHash: createHash('sha256').update(JSON.stringify(receiptCore)).digest('hex'),
};
const receiptFile = `${outputFile}.receipt.json`;
fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

console.log(JSON.stringify({
  ok: true,
  outputFile,
  receiptFile,
  outputSha256: receipt.outputSha256,
  receiptHash: receipt.receiptHash,
  technicalPreview: true,
  productionReady: false,
  providerSpend: false,
}, null, 2));