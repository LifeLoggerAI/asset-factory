import assert from 'node:assert/strict';
import fs from 'node:fs';

const identity = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-identity-authority-v1.json', import.meta.url), 'utf8'));
const providers = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/adam-provider-matrix-v1.json', import.meta.url), 'utf8'));

assert.equal(identity.schemaVersion, 'urai-adam-identity-authority-v1');
assert.equal(identity.goldMaster, false);
assert.equal(identity.authorityClasses.currentAdult.classification, 'REAL_CAPTURE_PRIVATE');
assert.equal(identity.authorityClasses.currentAdult.use, 'PRIMARY_LAUNCH_LIKENESS_AUTHORITY');
assert.equal(identity.authorityClasses.currentAdult.sha256, 'd89d7e2e660ca4e60819ddd7600ed8bea0e32addaf6199f42319eb0414ac3b60');
assert.equal(identity.authorityClasses.currentAdult.video.audioTrackPresent, false);
assert.equal(identity.authorityClasses.generatedDerived.use, 'CANDIDATE_ONLY');

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

console.log('Adam digital-human authority contract passed');
