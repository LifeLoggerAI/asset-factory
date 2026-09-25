#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
const file=process.argv[2];
if(!file){console.error('usage: node model_forge/verify-promotion.mjs <receipt.json>');process.exit(2)}
const r=JSON.parse(fs.readFileSync(file,'utf8'));
const failures=[];
const need=(ok,msg)=>{if(!ok) failures.push(msg)};
need(r.schemaVersion==='urai-model-promotion-receipt-v1','schema');
need(Boolean(r.assetId),'assetId');
need(Boolean(r.candidate?.sha256),'candidate sha256');
need(r.structuralValidation?.passed===true,'structural validation');
need(r.cleanup?.passed===true,'cleanup');
need(Boolean(r.cleanup?.lod0)&&Boolean(r.cleanup?.lod1)&&Boolean(r.cleanup?.lod2),'LODs');
need(r.performance?.passed===true,'performance');
need(r.sceneIntegration?.integrated===true&&/^[a-f0-9]{40}$/.test(r.sceneIntegration?.exactHead??''),'exact-head scene integration');
need(r.literalPixelReview?.accepted===true,'literal pixel acceptance');
need(r.literalPixelReview?.desktop===true&&r.literalPixelReview?.phonePortrait===true&&r.literalPixelReview?.reducedMotion===true,'required viewport evidence');
need(r.explicitApproval?.approved===true&&Boolean(r.explicitApproval?.reviewer),'explicit approval');
need(r.governance?.promotionAllowed===true,'governance promotion permission');
need(r.promoted===true,'promotion completion');
if(failures.length){console.error('URAI_MODEL_PROMOTION=BLOCKED');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log('URAI_MODEL_PROMOTION=VERIFIED');
