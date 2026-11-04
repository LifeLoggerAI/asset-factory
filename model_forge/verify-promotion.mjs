#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
const file=process.argv[2];
if(!file){console.error('usage: node model_forge/verify-promotion.mjs <receipt.json>');process.exit(2)}
const r=JSON.parse(fs.readFileSync(file,'utf8'));
const failures=[];
const need=(ok,msg)=>{if(!ok) failures.push(msg)};
need(r.schemaVersion==='urai-model-promotion-receipt-v1','schema');
const text=(value)=>typeof value==='string'&&value.trim().length>0;
need(text(r.assetId),'assetId');
need(/^[a-f0-9]{64}$/.test(r.candidate?.sha256??''),'candidate sha256');
need(text(r.candidate?.provider)&&text(r.candidate?.providerModel)&&text(r.candidate?.taskId),'candidate provider identity');
need(text(r.candidate?.provenancePath),'candidate provenance path');
need(r.structuralValidation?.passed===true,'structural validation');
need(text(r.structuralValidation?.reportPath),'structural report path');
need(r.cleanup?.passed===true,'cleanup');
need(text(r.cleanup?.receiptPath),'cleanup receipt path');
need(text(r.cleanup?.lod0)&&text(r.cleanup?.lod1)&&text(r.cleanup?.lod2),'LODs');
need(r.performance?.passed===true,'performance');
need(r.performance?.triangleBudget===true&&r.performance?.textureBudget===true&&r.performance?.drawCallBudget===true,'all performance budgets');
need(r.sceneIntegration?.integrated===true&&/^[a-f0-9]{40}$/.test(r.sceneIntegration?.exactHead??''),'exact-head scene integration');
need(r.sceneIntegration?.spatialRepository==='LifeLoggerAI/urai-spatial','scene repository');
need(text(r.sceneIntegration?.route)&&r.sceneIntegration.route.startsWith('/')&&text(r.sceneIntegration?.targetPath),'scene route and target path');
need(r.literalPixelReview?.accepted===true,'literal pixel acceptance');
need(r.literalPixelReview?.desktop===true&&r.literalPixelReview?.phonePortrait===true&&r.literalPixelReview?.reducedMotion===true,'required viewport evidence');
need(text(r.literalPixelReview?.proofArtifact),'literal pixel proof artifact');
need(r.explicitApproval?.approved===true&&text(r.explicitApproval?.reviewer),'explicit approval');
need(typeof r.explicitApproval?.reviewedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(r.explicitApproval.reviewedAt)&&Number.isFinite(Date.parse(r.explicitApproval.reviewedAt)),'review timestamp');
need(r.governance?.promotionAllowed===true,'governance promotion permission');
need(r.promoted===true,'promotion completion');
if(failures.length){console.error('URAI_MODEL_PROMOTION=BLOCKED');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log('URAI_MODEL_PROMOTION=RECEIPT_CONTRACT_PASSED');
console.log('URAI_MODEL_PROMOTION_SCOPE=DECLARED_FIELDS_ONLY; reviewer, artifacts, runtime and governance require independent verification');
