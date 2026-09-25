import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const schema = JSON.parse(fs.readFileSync(new URL('../model_forge/captured-reality/reconstruction-artifact.schema.json', import.meta.url), 'utf8'))
const receipt = JSON.parse(fs.readFileSync(new URL('../model_forge/captured-reality/promotion-receipt.template.json', import.meta.url), 'utf8'))
const verify = fs.readFileSync(new URL('../model_forge/captured-reality/verify-promotion.mjs', import.meta.url), 'utf8')

test('captured reality is classified as reconstruction rather than generic model generation', () => {
  assert.equal(schema.properties.sourceAuthority.properties.locationConsentPurpose.const, 'location.context')
  assert.equal(schema.properties.truth.properties.generatedFillCountsAsRecordedTruth.const, false)
  assert.equal(schema.properties.artifacts.properties.runtime.allOf[1].properties.format.const, 'splat')
  assert.equal(schema.$defs.collisionArtifact.properties.independentFromVisualSplat.const, true)
})

test('promotion template grants no provider spend, public release, XR certification or promotion authority', () => {
  assert.equal(receipt.reconstruction.providerSpendAuthorized, false)
  assert.equal(receipt.governance.publicReleaseAuthorized, false)
  assert.equal(receipt.xrEvidence.certified, false)
  assert.equal(receipt.governance.promotionAllowed, false)
  assert.equal(receipt.promoted, false)
  assert.equal(receipt.sceneIntegration.spatialPr, 1314)
  assert.equal(receipt.sceneIntegration.spatialRuntimePr, 1316)
})

test('promotion validator requires source review privacy browser mobile revocation and human approval', () => {
  for (const marker of [
    'immutable originals must be verified',
    'privacy screen required',
    'source-vs-reconstruction receipt required',
    'desktop performance proof required',
    'mobile performance proof required',
    'consent-revocation proof required',
    'explicit human review required',
  ]) assert.ok(verify.includes(marker), marker)
  assert.match(verify, /XR certification requires physical-device evidence/)
  assert.match(verify, /generated fill must stay interpretive/)
})
