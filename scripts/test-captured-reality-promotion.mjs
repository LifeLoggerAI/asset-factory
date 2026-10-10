// Receipt-contract fixtures only: no authentic source, reviewer or runtime approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const validator=fileURLToPath(new URL('../model_forge/captured-reality/verify-promotion.mjs',import.meta.url));
function receipt() {
  const artifact=(artifactId,format)=>({artifactId,format,sha256:'a'.repeat(64),byteSize:32});
  return {
    schemaVersion:'urai-captured-reality-promotion-receipt-v1',assetId:'synthetic-contract-only',
    sourceAuthority:{sourceReceiptRefs:['synthetic/source'],immutableOriginalsVerified:true,locationConsentPurpose:'location.context',privacyScreenPassed:true,thirdPartyAuthorityResolved:true},
    reconstruction:{method:'3dgs',providerSpendAuthorized:false,cameraSolveReceiptRef:'synthetic/camera',trainingReceiptRef:'synthetic/training',sourceVsReconstructionReceiptRef:'synthetic/comparison',generatedFillUsed:false,generatedFillTruthClass:'interpretive'},
    artifacts:{archival:artifact('synthetic/archive','ply-3dgs'),runtime:artifact('synthetic/runtime','splat'),collision:{...artifact('synthetic/collision','glb'),independentFromVisualSplat:true}},
    browserEvidence:{desktopPerformancePassed:true,mobilePerformancePassed:true,fallbackPassed:true,revocationPassed:true,proofRefs:['synthetic/browser']},
    sceneIntegration:{spatialRepository:'LifeLoggerAI/urai-spatial',exactHead:'b'.repeat(40),replayBindingVerified:true,publicRouteMounted:false},
    xrEvidence:{certified:false,physicalDeviceTested:false,proofRefs:[]},
    explicitApproval:{approved:true,reviewer:'synthetic-contract-only',reviewedAt:'2026-10-10T00:00:00Z'},
    governance:{publicReleaseAuthorized:false,promotionAllowed:true},promoted:true,
  };
}
function run(t,value) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'urai-captured-contract-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'receipt.json');fs.writeFileSync(file,JSON.stringify(value));
  return spawnSync(process.execPath,[validator,file],{encoding:'utf8',timeout:10000});
}
test('a complete declared receipt passes only field validation, not artifact or reviewer authentication',(t)=>{
  const result=run(t,receipt());assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.scope,'declared-fields-only');
  assert.equal(report.approvalAuthenticated,false);assert.equal(report.artifactBytesVerified,false);
  assert.equal(report.runtimeAcceptanceVerified,false);assert.equal(report.promotionAuthorized,false);
});
for (const field of ['cameraSolveReceiptRef','trainingReceiptRef','sourceVsReconstructionReceiptRef']) {
  for (const value of ['   ',true,{}]) test(`${field} needs a nonempty string receipt reference (${JSON.stringify(value)})`,(t)=>{
    const r=receipt();r.reconstruction[field]=value;assert.equal(run(t,r).status,1);
  });
}
for (const kind of ['archival','runtime','collision']) {
  for (const value of ['',true]) test(`${kind} needs an actual artifact identifier (${JSON.stringify(value)})`,(t)=>{
    const r=receipt();r.artifacts[kind].artifactId=value;assert.equal(run(t,r).status,1);
  });
}
for (const value of ['',true,{}]) test(`reviewer identity must be text (${JSON.stringify(value)})`,(t)=>{
  const r=receipt();r.explicitApproval.reviewer=value;assert.equal(run(t,r).status,1);
});
for (const value of ['',true,'yesterday']) test(`review requires an ISO timestamp (${JSON.stringify(value)})`,(t)=>{
  const r=receipt();r.explicitApproval.reviewedAt=value;assert.equal(run(t,r).status,1);
});
test('the declared exact head must bind the adopted Spatial repository',(t)=>{
  const r=receipt();r.sceneIntegration.spatialRepository='other/runtime';assert.equal(run(t,r).status,1);
});
for (const value of [undefined,'false',true]) test(`generated fill has explicit boolean/truth-class evidence (${JSON.stringify(value)})`,(t)=>{
  const r=receipt();r.reconstruction.generatedFillUsed=value;r.reconstruction.generatedFillTruthClass='recorded';assert.equal(run(t,r).status,1);
});
test('XR certification requires declared physical-device evidence references',(t)=>{
  const r=receipt();r.xrEvidence={certified:true,physicalDeviceTested:true,proofRefs:[]};assert.equal(run(t,r).status,1);
});
test('XR fields cannot be absent or replaced with truthy nonbooleans',(t)=>{
  for (const value of [{physicalDeviceTested:true},{certified:true,physicalDeviceTested:'yes',proofRefs:['synthetic/xr']}]) {
    const r=receipt();r.xrEvidence=value;assert.equal(run(t,r).status,1);
  }
});
test('declared XR proof and interpretive fill retain compatibility without certifying device or truth',(t)=>{
  const r=receipt();r.xrEvidence={certified:true,physicalDeviceTested:true,proofRefs:['synthetic/xr']};
  r.reconstruction.generatedFillUsed=true;
  assert.equal(run(t,r).status,0);
});
test('the incomplete template and malformed root remain blocked',(t)=>{
  const template=JSON.parse(fs.readFileSync(new URL('../model_forge/captured-reality/promotion-receipt.template.json',import.meta.url),'utf8'));
  for (const value of [template,null,[],{}]) assert.equal(run(t,value).status,1);
});
