#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const inventoryPath=path.join(root,'model_forge','launch-model-inventory.json');
const inventory=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
const errors=[];

function check(condition,message){ if(!condition) errors.push(message); }

check(inventory.schemaVersion==='urai-model-forge-launch-inventory-v1','unexpected inventory schema');
check(Array.isArray(inventory.assets) && inventory.assets.length>0,'inventory assets missing');
const ids=inventory.assets.map((asset)=>asset.id);
check(new Set(ids).size===ids.length,'duplicate asset ids');
const specTargets=new Set();

for(const asset of inventory.assets){
  check(typeof asset.id==='string' && asset.id.length>2,`invalid id: ${asset.id}`);
  check(['custom_procedural_urai_native','generated_cleaned_environmental','hero_close_camera','background_support'].includes(asset.class),`${asset.id}: invalid class`);
  if(asset.candidateSpec){
    const specPath=path.join(root,asset.candidateSpec);
    check(fs.existsSync(specPath),`${asset.id}: missing candidate spec ${asset.candidateSpec}`);
    if(fs.existsSync(specPath)){
      const spec=JSON.parse(fs.readFileSync(specPath,'utf8'));
      check(spec.id && typeof spec.id==='string',`${asset.id}: spec id missing`);
      check(Array.isArray(spec.providers) && spec.providers.length>0,`${asset.id}: providers missing`);
      check(spec.generation?.maxProviderAttempts>=1 && spec.generation?.maxProviderAttempts<=3,`${asset.id}: maxProviderAttempts outside bounded range`);
      check(spec.target?.pbr===true,`${asset.id}: production challenger must request PBR`);
      specTargets.add(asset.id);
    }
  }
  if(asset.providerAction==='do-not-generate'){
    check(!asset.candidateSpec,`${asset.id}: do-not-generate asset must not have provider spec`);
  }
}

for(const id of inventory.productionTargets ?? []){
  check(ids.includes(id),`production target missing from inventory: ${id}`);
}
for(const id of inventory.challengerTargets ?? []){
  check(ids.includes(id),`challenger target missing from inventory: ${id}`);
}

const protectedFragments=['orb','memory-star','focus-selected','portal'];
for(const fragment of protectedFragments){
  const matching=inventory.assets.filter((asset)=>asset.id.includes(fragment));
  for(const asset of matching){
    check(asset.providerAction==='do-not-generate' || asset.providerAction==='preserve' || asset.providerAction==='challenger-only',
      `${asset.id}: protected UrAi-native asset cannot become generic provider target`);
  }
}

if(errors.length){
  console.error('URAI_MODEL_INVENTORY=RED');
  for(const error of errors) console.error('- '+error);
  process.exit(1);
}
console.log('URAI_MODEL_INVENTORY=GREEN');
console.log(`ASSETS=${inventory.assets.length}`);
console.log(`PRODUCTION_TARGETS=${(inventory.productionTargets??[]).length}`);
console.log(`CHALLENGERS=${(inventory.challengerTargets??[]).length}`);
