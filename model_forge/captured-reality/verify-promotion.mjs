#!/usr/bin/env node
import fs from 'node:fs'

const file = process.argv[2]
if (!file) throw new Error('usage: verify-captured-reality-promotion.mjs <receipt.json>')
const r = JSON.parse(fs.readFileSync(file, 'utf8'))
const failures = []
const need = (condition, message) => { if (!condition) failures.push(message) }
const sha = (value) => /^[a-f0-9]{64}$/.test(String(value || ''))
const head = (value) => /^[a-f0-9]{40}$/.test(String(value || ''))
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0
const nonEmptyRefs = (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmpty)

need(r.schemaVersion === 'urai-captured-reality-promotion-receipt-v1', 'schemaVersion mismatch')
need(nonEmpty(r.assetId) && /^[A-Za-z0-9._:-]{1,128}$/.test(r.assetId.trim()), 'asset identifier required')
need(nonEmptyRefs(r.sourceAuthority?.sourceReceiptRefs), 'source receipts required')
need(r.sourceAuthority?.immutableOriginalsVerified === true, 'immutable originals must be verified')
need(r.sourceAuthority?.locationConsentPurpose === 'location.context', 'C3 location.context required')
need(r.sourceAuthority?.privacyScreenPassed === true, 'privacy screen required')
need(r.sourceAuthority?.thirdPartyAuthorityResolved === true, 'third-party authority must be resolved')

need(['3dgs','photogrammetry','nerf-derived','hybrid'].includes(r.reconstruction?.method), 'supported reconstruction method required')
need(r.reconstruction?.providerSpendAuthorized === false, 'provider spend must remain hard-off')
need(nonEmpty(r.reconstruction?.cameraSolveReceiptRef), 'camera solve receipt required')
need(nonEmpty(r.reconstruction?.trainingReceiptRef), 'training receipt required')
need(nonEmpty(r.reconstruction?.sourceVsReconstructionReceiptRef), 'source-vs-reconstruction receipt required')
need(typeof r.reconstruction?.generatedFillUsed === 'boolean', 'generated fill use must be explicitly declared')
if (r.reconstruction?.generatedFillUsed === true) {
  need(r.reconstruction?.generatedFillTruthClass === 'interpretive', 'generated fill must stay interpretive')
}

need(['ply-3dgs','compressed-ply-3dgs','spz','sog'].includes(r.artifacts?.archival?.format), 'archival interchange artifact required')
need(r.artifacts?.runtime?.format === 'splat', 'first browser runtime format must be .splat')
need(['glb','navmesh-json'].includes(r.artifacts?.collision?.format), 'independent collision proxy required')
need(r.artifacts?.collision?.independentFromVisualSplat === true, 'collision proxy cannot be inferred from splat')
for (const artifact of [r.artifacts?.archival, r.artifacts?.runtime, r.artifacts?.collision]) {
  need(nonEmpty(artifact?.artifactId), 'artifact identifier required')
  need(sha(artifact?.sha256), 'artifact SHA-256 required')
  need(Number.isSafeInteger(artifact?.byteSize) && artifact.byteSize > 0, 'artifact byte size required')
}

need(r.browserEvidence?.desktopPerformancePassed === true, 'desktop performance proof required')
need(r.browserEvidence?.mobilePerformancePassed === true, 'mobile performance proof required')
need(r.browserEvidence?.fallbackPassed === true, 'fallback proof required')
need(r.browserEvidence?.revocationPassed === true, 'consent-revocation proof required')
need(nonEmptyRefs(r.browserEvidence?.proofRefs), 'browser evidence proof refs required')
need(head(r.sceneIntegration?.exactHead), 'exact Spatial head required')
need(r.sceneIntegration?.spatialRepository === 'LifeLoggerAI/urai-spatial', 'adopted Spatial repository required')
need(r.sceneIntegration?.replayBindingVerified === true, 'Replay binding proof required')
need(r.sceneIntegration?.publicRouteMounted === false, 'captured reality promotion must remain private before separate public release authority')

need(typeof r.xrEvidence?.certified === 'boolean' && typeof r.xrEvidence?.physicalDeviceTested === 'boolean', 'XR certification and physical-device state must be explicitly declared')
if (r.xrEvidence?.certified === true) {
  need(r.xrEvidence?.physicalDeviceTested === true, 'XR certification requires physical-device evidence')
  need(nonEmptyRefs(r.xrEvidence?.proofRefs), 'XR certification requires physical-device proof refs')
}
need(r.explicitApproval?.approved === true, 'explicit human review required')
need(nonEmpty(r.explicitApproval?.reviewer), 'reviewer identity required')
need(typeof r.explicitApproval?.reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(r.explicitApproval.reviewedAt) && Number.isFinite(Date.parse(r.explicitApproval.reviewedAt)), 'review timestamp required')
need(r.governance?.publicReleaseAuthorized === false, 'this receipt cannot authorize public release')

const expectedPromotion = failures.length === 0
need(r.governance?.promotionAllowed === expectedPromotion, 'promotionAllowed must equal verified evidence state')
need(r.promoted === expectedPromotion, 'promoted must equal verified evidence state')

if (failures.length) {
  console.error(JSON.stringify({ok:false,failures},null,2))
  process.exit(1)
}
console.log(JSON.stringify({
  ok:true,
  result:'receipt-contract-passed',
  scope:'declared-fields-only',
  assetId:r.assetId,
  spatialExactHead:r.sceneIntegration.exactHead,
  approvalAuthenticated:false,
  artifactBytesVerified:false,
  runtimeAcceptanceVerified:false,
  promotionAuthorized:false
},null,2))
