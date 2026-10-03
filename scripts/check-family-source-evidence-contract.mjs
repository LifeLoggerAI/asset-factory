import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(
  fs.readFileSync('manifests/film/family-life-reference-source-index.json', 'utf8'),
);

assert.equal(manifest.schemaVersion, '2.1.0');
assert.equal(manifest.classification, 'public-production-policy');

for (const invariant of [
  'immutable originals are never overwritten',
  'derivatives retain parent-source linkage',
  'equal byte size is not deduplication proof',
  'capture time is not promoted from file/cloud timestamps without proof',
  'filenames and folders are provenance labels, not identity proof',
  'generated media never becomes recorded source truth',
  'precise GPS remains private by default',
  'same-event clustering requires supporting evidence',
  'source specificity caps generated specificity',
]) {
  assert.ok(manifest.sourceEvidenceContract.invariants.includes(invariant), invariant);
}

for (const forbidden of [
  'preciseGpsCoordinates',
  'exactPrivateAddress',
  'privateDriveId',
  'privateGmailId',
  'familyIdentityAssertion',
  'rawPrivateMedia',
]) {
  assert.ok(manifest.sourceEvidenceContract.privateValuesNeverCommitted.includes(forbidden), forbidden);
}

for (const hardStop of [
  'conflicting identity',
  'conflicting place',
  'conflicting era',
  'generated derivative mistaken for original',
  'unresolved duplicate provenance',
]) {
  assert.ok(manifest.sameEventClustering.hardStops.includes(hardStop), hardStop);
}

const serialized = JSON.stringify(manifest);
assert.doesNotMatch(serialized, /drive\.google\.com|docs\.google\.com|mail\.google\.com|gmail\.com/i);

console.log('[PASS] family source evidence contract');
