import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const plan = JSON.parse(fs.readFileSync(new URL('../model_forge/evidence/home-gaussian-execution-plan-20261006.json', import.meta.url), 'utf8'))

test('Home Gaussian execution plan is exact, reproducible, and hard-off', () => {
  assert.equal(plan.schemaVersion, 'urai-home-gaussian-execution-plan-v1')
  assert.equal(plan.worldId, 'URAI-IW-001-QUIET-RESET')
  assert.equal(plan.classification, 'PREPARED_HARD_OFF_NO_PAID_EXECUTION')
  assert.equal(plan.truthClass, 'INTERPRETIVE')
  assert.equal(plan.autobiographical, false)
  assert.equal(plan.verifiedPreflight.registeredViews, 54)
  assert.equal(plan.verifiedPreflight.totalViews, 54)
  assert.equal(plan.verifiedPreflight.sparsePoints, 17394)
  assert.equal(plan.verifiedPreflight.sparsePlySha256, '24a7bf0f9ce60f0fa0eabc81655c5e33a0354f1eab735e8fde12bb7bd8c87834')
  assert.equal(plan.executionPrerequisites.cudaWorkerAuthorized, false)
  assert.equal(plan.executionPrerequisites.providerSpendAuthorized, false)
  assert.equal(plan.executionPrerequisites.paidComputeAllowed, false)
  assert.equal(plan.executionPrerequisites.acceptedFramesMaterialized, false)
})

test('Home Gaussian plan locks the canonical no-guess training path and required receipts', () => {
  assert.deepEqual(plan.canonicalTrainingPath.commands, [
    'ns-process-data images --data 04_frames_accepted --output-dir 05_colmap_processed',
    'ns-train splatfacto --data 05_colmap_processed',
    'ns-export gaussian-splat --load-config <trained-config> --output-dir 07_archival',
  ])
  const ids = new Set(plan.requiredOutputs.map((item) => item.id))
  for (const id of ['camera-solve','training','source-vs-reconstruction','archival-gaussian','runtime-splat','collision-proxy']) assert.ok(ids.has(id))
  assert.equal(plan.requiredOutputs.find((item) => item.id === 'collision-proxy').independentFromVisualSplat, true)
})

test('Home Gaussian plan cannot be mistaken for final-art or production acceptance', () => {
  assert.equal(plan.acceptance.denseSurface, 'UNVERIFIED')
  assert.equal(plan.acceptance.trainedGaussianSplat, 'UNVERIFIED')
  assert.equal(plan.acceptance.collisionNavmesh, 'UNVERIFIED')
  assert.equal(plan.acceptance.runtimeSplat, 'UNVERIFIED')
  assert.equal(plan.acceptance.shippingArt, 'NOT_ACCEPTED')
  assert.equal(plan.acceptance.founderAcceptance, false)
  assert.equal(plan.acceptance.independentApproval, false)
  assert.equal(plan.acceptance.productionPromotion, false)
})
