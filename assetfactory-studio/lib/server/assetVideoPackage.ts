import { createHash } from 'node:crypto';

export type VideoAnimaticShot = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds?: number;
  prompt: string;
  camera?: string;
  caption?: string;
  audioDescription?: string;
  transition?: string;
  seed?: string;
};

export type VideoAnimatic = {
  schema: 'urai-video-animatic-1';
  status?: string;
  productionReady?: boolean;
  jobId: string;
  tenantId?: string;
  title: string;
  prompt?: string;
  aspectRatio?: string;
  dimensions: { width: number; height: number };
  durationSeconds: number;
  fps: number;
  totalFrames?: number;
  shots: VideoAnimaticShot[];
  accessibility?: {
    captionsRequired?: boolean;
    audioDescriptionRequired?: boolean;
    reducedMotionRequired?: boolean;
  };
};

export type ClaimEvidenceBinding = {
  claimId: string;
  text: string;
  evidenceClass: 'LIVE_VERIFIED' | 'VERIFIED_SYSTEM_DEMO' | 'CERTIFIED_DEVICE_INTEGRATION' | 'PROTOTYPE' | 'VISION';
  evidenceRefs: string[];
  approved: boolean;
};

export type VideoPackageOptions = {
  aspectRatios?: string[];
  cutDurationsSeconds?: number[];
  claims?: ClaimEvidenceBinding[];
  endCard?: {
    headline: string;
    subheadline?: string;
    cta?: string;
    durationSeconds?: number;
  };
};

export type VideoPackageArtifact = {
  fileName: string;
  mimeType: string;
  content: string;
  sha256: string;
  byteLength: number;
};

export type VideoPackageResult = {
  package: Record<string, unknown>;
  artifacts: VideoPackageArtifact[];
  receipt: Record<string, unknown>;
};

const allowedEvidenceClasses = new Set([
  'LIVE_VERIFIED',
  'VERIFIED_SYSTEM_DEMO',
  'CERTIFIED_DEVICE_INTEGRATION',
  'PROTOTYPE',
  'VISION',
]);

function finitePositive(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(normalize(value));
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function parseRatio(value: string) {
  const match = /^([1-9]\d*):([1-9]\d*)$/.exec(value.trim());
  if (!match) throw new Error(`invalid aspect ratio: ${value}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  return { label: `${width}:${height}`, value: width / height };
}

function timestamp(seconds: number, separator: ',' | '.') {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const wholeSeconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
}

function validateAnimatic(animatic: VideoAnimatic) {
  if (!animatic || animatic.schema !== 'urai-video-animatic-1') {
    throw new Error('animatic schema must equal urai-video-animatic-1');
  }
  if (!animatic.jobId || !/^[a-zA-Z0-9._-]+$/.test(animatic.jobId)) {
    throw new Error('animatic jobId is invalid');
  }
  finitePositive(animatic.durationSeconds, 'durationSeconds');
  finitePositive(animatic.fps, 'fps');
  finitePositive(animatic.dimensions?.width, 'dimensions.width');
  finitePositive(animatic.dimensions?.height, 'dimensions.height');
  if (!Array.isArray(animatic.shots) || animatic.shots.length === 0) {
    throw new Error('animatic must contain at least one shot');
  }

  let previousEnd = 0;
  for (const [index, shot] of animatic.shots.entries()) {
    if (!shot || typeof shot !== 'object') throw new Error(`shot ${index + 1} is invalid`);
    if (!shot.id || !/^[a-zA-Z0-9._-]+$/.test(shot.id)) throw new Error(`shot ${index + 1} id is invalid`);
    finitePositive(shot.endSeconds, `shot ${shot.id} endSeconds`);
    if (!Number.isFinite(shot.startSeconds) || shot.startSeconds < 0) throw new Error(`shot ${shot.id} startSeconds is invalid`);
    if (shot.endSeconds <= shot.startSeconds) throw new Error(`shot ${shot.id} must end after it starts`);
    if (shot.startSeconds + 0.001 < previousEnd) throw new Error(`shot ${shot.id} overlaps the previous shot`);
    if (shot.endSeconds > animatic.durationSeconds + 0.001) throw new Error(`shot ${shot.id} exceeds animatic duration`);
    previousEnd = shot.endSeconds;
  }
}

function validateClaims(claims: ClaimEvidenceBinding[]) {
  const ids = new Set<string>();
  for (const claim of claims) {
    if (!claim.claimId || ids.has(claim.claimId)) throw new Error(`duplicate or missing claimId: ${claim.claimId}`);
    ids.add(claim.claimId);
    if (!claim.text?.trim()) throw new Error(`claim ${claim.claimId} has no text`);
    if (!allowedEvidenceClasses.has(claim.evidenceClass)) throw new Error(`claim ${claim.claimId} has invalid evidence class`);
    if (!Array.isArray(claim.evidenceRefs)) throw new Error(`claim ${claim.claimId} evidenceRefs must be an array`);
    if (claim.approved && claim.evidenceRefs.length === 0) throw new Error(`approved claim ${claim.claimId} requires evidence refs`);
  }
}

function buildCaptions(animatic: VideoAnimatic) {
  const cues = animatic.shots
    .filter((shot) => typeof shot.caption === 'string' && shot.caption.trim())
    .map((shot, index) => ({
      index: index + 1,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      text: shot.caption!.trim(),
      shotId: shot.id,
    }));

  const srt = cues.map((cue) => [
    String(cue.index),
    `${timestamp(cue.startSeconds, ',')} --> ${timestamp(cue.endSeconds, ',')}`,
    cue.text,
    '',
  ].join('\n')).join('\n');

  const vttBody = cues.map((cue) => [
    cue.shotId,
    `${timestamp(cue.startSeconds, '.')} --> ${timestamp(cue.endSeconds, '.')}`,
    cue.text,
    '',
  ].join('\n')).join('\n');

  return {
    cues,
    srt: srt ? `${srt}\n` : '',
    vtt: `WEBVTT\n\n${vttBody}`,
  };
}

function buildAudioDescription(animatic: VideoAnimatic) {
  const cues = animatic.shots
    .filter((shot) => typeof shot.audioDescription === 'string' && shot.audioDescription.trim())
    .map((shot) => ({
      shotId: shot.id,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      text: shot.audioDescription!.trim(),
      status: 'draft',
    }));
  return {
    schema: 'urai-audio-description-cues-1',
    required: animatic.accessibility?.audioDescriptionRequired === true,
    cues,
    complete: animatic.accessibility?.audioDescriptionRequired !== true || cues.length === animatic.shots.length,
  };
}

function buildCrop(sourceWidth: number, sourceHeight: number, ratioLabel: string) {
  const ratio = parseRatio(ratioLabel);
  const sourceRatio = sourceWidth / sourceHeight;
  if (Math.abs(sourceRatio - ratio.value) < 0.0001) {
    return { aspectRatio: ratio.label, x: 0, y: 0, width: sourceWidth, height: sourceHeight, strategy: 'none' };
  }
  if (sourceRatio > ratio.value) {
    const width = Math.round(sourceHeight * ratio.value);
    return {
      aspectRatio: ratio.label,
      x: Math.round((sourceWidth - width) / 2),
      y: 0,
      width,
      height: sourceHeight,
      strategy: 'center-crop-horizontal',
    };
  }
  const height = Math.round(sourceWidth / ratio.value);
  return {
    aspectRatio: ratio.label,
    x: 0,
    y: Math.round((sourceHeight - height) / 2),
    width: sourceWidth,
    height,
    strategy: 'center-crop-vertical',
  };
}

function buildCut(animatic: VideoAnimatic, targetSeconds: number) {
  const durationSeconds = Math.min(animatic.durationSeconds, targetSeconds);
  const shots = animatic.shots
    .filter((shot) => shot.startSeconds < durationSeconds)
    .map((shot) => ({
      ...shot,
      endSeconds: Math.min(shot.endSeconds, durationSeconds),
      durationSeconds: Math.max(0, Math.min(shot.endSeconds, durationSeconds) - shot.startSeconds),
    }))
    .filter((shot) => shot.durationSeconds > 0);
  return {
    cutId: `${animatic.jobId}-${Math.round(targetSeconds)}s`,
    requestedDurationSeconds: targetSeconds,
    durationSeconds,
    truncated: durationSeconds < animatic.durationSeconds,
    shots,
    rendered: false,
  };
}

function artifact(fileName: string, mimeType: string, value: unknown, raw = false): VideoPackageArtifact {
  const content = raw ? String(value) : `${JSON.stringify(value, null, 2)}\n`;
  return {
    fileName,
    mimeType,
    content,
    sha256: sha256(content),
    byteLength: Buffer.byteLength(content),
  };
}

export function buildVideoPackage(animatic: VideoAnimatic, options: VideoPackageOptions = {}): VideoPackageResult {
  validateAnimatic(animatic);
  const claims = options.claims ?? [];
  validateClaims(claims);

  const ratios = [...new Set(options.aspectRatios ?? ['16:9', '9:16', '1:1'])];
  const cutDurations = [...new Set((options.cutDurationsSeconds ?? [6, 15, 30, 60, 90])
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Number(value)))]
    .sort((a, b) => a - b);
  const captions = buildCaptions(animatic);
  const audioDescription = buildAudioDescription(animatic);
  const crops = ratios.map((ratio) => buildCrop(animatic.dimensions.width, animatic.dimensions.height, ratio));
  const cuts = cutDurations.map((seconds) => buildCut(animatic, seconds));
  const warnings: string[] = [];

  if (animatic.accessibility?.captionsRequired !== false && captions.cues.length === 0) {
    warnings.push('captions-required-but-no-caption-cues');
  }
  if (audioDescription.required && !audioDescription.complete) {
    warnings.push('audio-description-required-but-incomplete');
  }
  if (claims.some((claim) => !claim.approved)) {
    warnings.push('unapproved-public-claims-present');
  }
  if (animatic.productionReady === true) {
    warnings.push('input-animatic-incorrectly-marked-production-ready');
  }

  const timeline = {
    schema: 'urai-video-timeline-1',
    jobId: animatic.jobId,
    title: animatic.title,
    durationSeconds: animatic.durationSeconds,
    fps: animatic.fps,
    dimensions: animatic.dimensions,
    shots: animatic.shots,
    endCard: options.endCard ?? null,
    rendered: false,
  };
  const claimManifest = {
    schema: 'urai-video-claims-1',
    claims,
    allApproved: claims.every((claim) => claim.approved),
  };
  const packageManifest = {
    schema: 'urai-video-package-1',
    jobId: animatic.jobId,
    title: animatic.title,
    sourceSchema: animatic.schema,
    sourceInputHash: sha256(canonicalJson(animatic)),
    durationSeconds: animatic.durationSeconds,
    fps: animatic.fps,
    deliverables: {
      timeline: 'timeline.json',
      captionsSrt: 'captions.srt',
      captionsVtt: 'captions.vtt',
      audioDescription: 'audio-description.json',
      crops: 'crops.json',
      cuts: 'cuts.json',
      claims: 'claims.json',
    },
    accessibility: {
      captionsRequired: animatic.accessibility?.captionsRequired !== false,
      captionCueCount: captions.cues.length,
      audioDescriptionRequired: audioDescription.required,
      audioDescriptionComplete: audioDescription.complete,
      reducedMotionRequired: animatic.accessibility?.reducedMotionRequired === true,
    },
    approvals: {
      creative: false,
      productTruth: false,
      privacy: false,
      claims: claimManifest.allApproved && claims.length > 0,
      accessibility: false,
      rights: false,
      spend: false,
      finalPublish: false,
    },
    rendered: false,
    encodedMaster: null,
    warnings,
  };

  const artifacts = [
    artifact('timeline.json', 'application/json; charset=utf-8', timeline),
    artifact('captions.srt', 'application/x-subrip; charset=utf-8', captions.srt, true),
    artifact('captions.vtt', 'text/vtt; charset=utf-8', captions.vtt, true),
    artifact('audio-description.json', 'application/json; charset=utf-8', audioDescription),
    artifact('crops.json', 'application/json; charset=utf-8', { schema: 'urai-video-crops-1', crops }),
    artifact('cuts.json', 'application/json; charset=utf-8', { schema: 'urai-video-cuts-1', cuts }),
    artifact('claims.json', 'application/json; charset=utf-8', claimManifest),
    artifact('package.json', 'application/json; charset=utf-8', packageManifest),
  ];

  const receiptCore = {
    schema: 'urai-video-package-receipt-1',
    jobId: animatic.jobId,
    sourceInputHash: packageManifest.sourceInputHash,
    packageHash: sha256(canonicalJson(packageManifest)),
    artifacts: artifacts.map(({ fileName, mimeType, sha256: digest, byteLength }) => ({
      fileName,
      mimeType,
      sha256: digest,
      byteLength,
    })),
    rendered: false,
    providerSpend: false,
  };
  const receipt = {
    ...receiptCore,
    receiptHash: sha256(canonicalJson(receiptCore)),
  };
  artifacts.push(artifact('receipt.json', 'application/json; charset=utf-8', receipt));

  return { package: packageManifest, artifacts, receipt };
}