import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest=JSON.parse(fs.readFileSync(new URL('../model_forge/digital-human-aaa-readiness.json', import.meta.url), 'utf8'));

assert.equal(manifest.schemaVersion,'urai-digital-human-aaa-readiness-v1');
assert.equal(manifest.status,'prepared-no-spend');
assert.equal(manifest.globalGates.providerSpendAuthorized,false);
assert.equal(manifest.globalGates.publicReleaseAuthorized,false);
assert.equal(manifest.globalGates.likenessGenerationAuthorized,false);
assert.equal(manifest.globalGates.voiceCloneAuthorized,false);

const ids=new Set(manifest.assetFamilies.map((x)=>x.id));
for(const id of [
 'identity-head-face',
 'eyes-mouth-dental',
 'hair-facial-hair',
 'body-hands-clothing',
 'facial-performance',
 'lip-viseme-performance',
 'voice-identity',
 'voice-dialogue-runtime',
 'motion-body-performance',
 'scene-light-camera',
 'accessibility-derivatives',
]){
 assert.ok(ids.has(id),`missing AAA digital-human family: ${id}`);
}

const p0=manifest.assetFamilies.filter((x)=>x.priority==='P0');
assert.ok(p0.length>=10,'AAA digital-human readiness must not collapse to a bare-bones subset');
assert.equal(manifest.minimumVariantPolicy.mobileFallbackRequired,true);
assert.equal(manifest.minimumVariantPolicy.nonPhotorealFallbackRequired,true);
assert.equal(manifest.promotionGate.exactHeadProofRequired,true);
assert.equal(manifest.promotionGate.humanApprovalRequired,true);
assert.equal(manifest.promotionGate.accessibilityDerivativesRequired,true);
assert.equal(manifest.promotionGate.licenseAndRightsReceiptsRequired,true);

console.log('AAA digital-human paid-asset readiness contract passed');
