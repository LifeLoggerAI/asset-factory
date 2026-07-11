import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const typescriptPath = path.join(studioRoot, 'node_modules', 'typescript', 'lib', 'typescript.js');

if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}. Run npm --prefix assetfactory-studio install first.`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-video-package-test-'));
const sourcePath = path.join(studioRoot, 'lib', 'server', 'assetVideoPackage.ts');
const compiledPath = path.join(tmpDir, 'assetVideoPackage.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    skipLibCheck: true,
  },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(compiledPath, output);

const { buildVideoPackage } = await import(pathToFileURL(compiledPath).href);

function sampleAnimatic() {
  return {
    schema: 'urai-video-animatic-1',
    status: 'proof-only',
    productionReady: false,
    jobId: 'day-00-the-doorway-exists',
    tenantId: 'launch',
    title: 'The Door',
    prompt: 'A person reaches a doorway into URAI',
    aspectRatio: '16:9',
    dimensions: { width: 1920, height: 1080 },
    durationSeconds: 20,
    fps: 24,
    shots: [
      {
        id: 'shot-01',
        startSeconds: 0,
        endSeconds: 6,
        prompt: 'A person approaches a dark doorway',
        camera: 'slow push-in',
        caption: 'Every system knew a piece of you.',
        audioDescription: 'A person walks toward a doorway in a quiet room.',
      },
      {
        id: 'shot-02',
        startSeconds: 6,
        endSeconds: 14,
        prompt: 'The doorway opens into URAI',
        camera: 'controlled reveal',
        caption: 'None knew the life between the pieces.',
        audioDescription: 'The doorway opens onto a luminous private world.',
      },
      {
        id: 'shot-03',
        startSeconds: 14,
        endSeconds: 20,
        prompt: 'The person steps through',
        camera: 'follow through threshold',
        caption: 'Step inside.',
        audioDescription: 'The person crosses the threshold as the orb wakes.',
      },
    ],
    accessibility: {
      captionsRequired: true,
      audioDescriptionRequired: true,
      reducedMotionRequired: true,
    },
  };
}

function sampleOptions() {
  return {
    aspectRatios: ['16:9', '9:16', '1:1'],
    cutDurationsSeconds: [6, 15, 30],
    claims: [{
      claimId: 'doorway-exists',
      text: 'The doorway already exists.',
      evidenceClass: 'VERIFIED_SYSTEM_DEMO',
      evidenceRefs: ['spatial-route-capture-day-00'],
      approved: true,
    }],
    endCard: {
      headline: 'URAI',
      subheadline: 'Your life is the interface.',
      cta: 'Step inside.',
      durationSeconds: 2,
    },
  };
}

function artifactMap(result) {
  return Object.fromEntries(result.artifacts.map((artifact) => [artifact.fileName, artifact]));
}

function testDeterministicPackage() {
  const first = buildVideoPackage(sampleAnimatic(), sampleOptions());
  const second = buildVideoPackage(sampleAnimatic(), sampleOptions());
  assert.equal(first.receipt.receiptHash, second.receipt.receiptHash);
  assert.equal(first.package.rendered, false);
  assert.equal(first.receipt.providerSpend, false);
  assert.equal(first.package.approvals.finalPublish, false);
  assert.equal(first.package.approvals.claims, true);

  const artifacts = artifactMap(first);
  for (const fileName of [
    'timeline.json',
    'captions.srt',
    'captions.vtt',
    'audio-description.json',
    'crops.json',
    'cuts.json',
    'claims.json',
    'package.json',
    'receipt.json',
  ]) {
    assert.ok(artifacts[fileName], `missing ${fileName}`);
    assert.match(artifacts[fileName].sha256, /^[a-f0-9]{64}$/);
  }

  assert.match(artifacts['captions.srt'].content, /00:00:00,000 --> 00:00:06,000/);
  assert.match(artifacts['captions.vtt'].content, /^WEBVTT/);
  const crops = JSON.parse(artifacts['crops.json'].content).crops;
  assert.equal(crops.length, 3);
  assert.equal(crops.find((crop) => crop.aspectRatio === '16:9').strategy, 'none');
  assert.equal(crops.find((crop) => crop.aspectRatio === '9:16').strategy, 'center-crop-horizontal');

  const cuts = JSON.parse(artifacts['cuts.json'].content).cuts;
  assert.equal(cuts.length, 3);
  assert.equal(cuts.find((cut) => cut.requestedDurationSeconds === 6).durationSeconds, 6);
  assert.equal(cuts.find((cut) => cut.requestedDurationSeconds === 30).durationSeconds, 20);
  assert.equal(cuts.find((cut) => cut.requestedDurationSeconds === 30).truncated, false);
}

function testApprovedClaimRequiresEvidence() {
  const options = sampleOptions();
  options.claims[0].evidenceRefs = [];
  assert.throws(
    () => buildVideoPackage(sampleAnimatic(), options),
    /approved claim doorway-exists requires evidence refs/,
  );
}

function testOverlappingShotsFailClosed() {
  const animatic = sampleAnimatic();
  animatic.shots[1].startSeconds = 5;
  assert.throws(
    () => buildVideoPackage(animatic, sampleOptions()),
    /overlaps the previous shot/,
  );
}

function testMissingAccessibilityCuesProduceWarnings() {
  const animatic = sampleAnimatic();
  animatic.shots = animatic.shots.map((shot) => ({ ...shot, caption: '', audioDescription: '' }));
  const result = buildVideoPackage(animatic, sampleOptions());
  assert.ok(result.package.warnings.includes('captions-required-but-no-caption-cues'));
  assert.ok(result.package.warnings.includes('audio-description-required-but-incomplete'));
  assert.equal(result.package.accessibility.audioDescriptionComplete, false);
}

try {
  testDeterministicPackage();
  testApprovedClaimRequiresEvidence();
  testOverlappingShotsFailClosed();
  testMissingAccessibilityCuesProduceWarnings();
  console.log('PASS Asset Factory deterministic video package tests');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}