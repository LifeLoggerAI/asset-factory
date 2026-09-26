import assert from 'node:assert/strict';
import fs from 'node:fs';

const identity = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-identity-authority-v1.json', import.meta.url), 'utf8'));
const providers = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-provider-matrix-v1.json', import.meta.url), 'utf8'));
const sources = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-source-inventory-v1.json', import.meta.url), 'utf8'));
const receipt = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/provider-execution-receipt-v1.json', import.meta.url), 'utf8'));
const motion = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-rig-motion-contract-v1.json', import.meta.url), 'utf8'));
const handoff = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-spatial-handoff-v1.json', import.meta.url), 'utf8'));
const presentation = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-rested-neutral-qa-v1.json', import.meta.url), 'utf8'));

assert.equal(identity.schemaVersion, 'urai-adam-identity-authority-v1');
assert.equal(identity.goldMaster, false);
assert.equal(identity.authorityClasses.currentAdult.classification, 'REAL_CAPTURE_PRIVATE');
assert.equal(identity.authorityClasses.currentAdult.use, 'PRIMARY_LAUNCH_LIKENESS_AUTHORITY');
assert.equal(identity.authorityClasses.currentAdult.sha256, 'd89d7e2e660ca4e60819ddd7600ed8bea0e32addaf6199f42319eb0414ac3b60');
assert.equal(identity.authorityClasses.currentAdult.video.audioTrackPresent, false);
assert.equal(identity.authorityClasses.generatedDerived.use, 'CANDIDATE_ONLY');
assert.equal(identity.presentationAuthority.target, 'CURRENT_ADULT_RESTED_NEUTRAL');
assert.ok(identity.presentationAuthority.transientCaptureStatesMustNotBecomeIdentityTruth.includes('slumped or exhausted posture'));
assert.ok(identity.presentationAuthority.captureTimingRule.includes('can wait until Adam is rested enough'));

assert.equal(providers.schemaVersion, 'urai-adam-digital-human-provider-matrix-v1');
assert.equal(providers.promotionAuthorized, false);
assert.equal(providers.publicReleaseAuthorized, false);

const byName = new Map(providers.providers.map((provider) => [provider.provider, provider]));
assert.equal(byName.get('Runway')?.connection, 'AUTHENTICATED');
assert.equal(byName.get('HeyGen')?.founderVoiceCloneAttempt?.result, 'BLOCKED');
assert.equal(byName.get('HeyGen')?.founderVoiceCloneAttempt?.reason, 'plan_upgrade_required');
assert.equal(byName.get('ElevenLabs')?.privateFounderVoiceId, null);
assert.equal(byName.get('Meshy')?.identityFaceAuthority, false);
assert.equal(byName.get('Tripo')?.identityFaceAuthority, false);
assert.equal(byName.get('Rodin/Hyper3D')?.identityFaceAuthority, false);

assert.equal(sources.rules.rawPrivateDriveIdsInGitHub, false);
assert.equal(sources.rules.generatedOutputMayBecomeIdentityTruthAutomatically, false);
assert.equal(sources.rules.holdoutMayBeUsedForTraining, false);
assert.equal(sources.sources.find((x) => x.assetKey === 'adam-current-adult-canonical-video-v1')?.coverage?.fullBody, false);
assert.ok(sources.missingGoldMasterInputs.includes('current-adult high-resolution multi-view head capture'));

const retry = receipt.events.find((x) => x.taskId === '4cf28ecf-dfdb-4482-b20a-9d7781308073');
assert.ok(retry, 'missing corrected Runway challenger receipt');
assert.equal(retry.result, 'OUTPUT_GENERATED_QA_BLOCKED');
assert.equal(retry.audioContract?.requestedAudioGeneration, false);
assert.equal(retry.audioContract?.providerReturnedAudioTrack, true);
assert.equal(retry.audioContract?.audioDisposition, 'REJECT_FOR_CANONICAL_USE');
assert.equal(retry.visualQa?.promotionAllowed, false);
assert.equal(retry.canonicalCandidate, false);

assert.equal(motion.captureGap.newCaptureRequiredForGoldMaster, true);
assert.equal(motion.promotionAuthorized, false);
assert.equal(handoff.spatialMutationAuthorized, false);
assert.equal(handoff.release.publicReleaseAuthorized, false);
assert.equal(presentation.schemaVersion, 'urai-adam-rested-neutral-qa-v1');
assert.equal(presentation.target, 'CURRENT_ADULT_RESTED_NEUTRAL');
assert.equal(presentation.cameraQa.rejectCloseUltraWidePerspective, true);
assert.equal(presentation.bodyQa.singleFrameBodyVolumeAuthority, false);
assert.equal(presentation.bodyQa.generatedBodyMayOverrideRealEvidence, false);
assert.equal(presentation.faceQa.fatigueExpressionMayDefineCanonicalNeutral, false);
assert.equal(presentation.promotionAuthorized, false);

console.log('Adam digital-human authority contract passed');
