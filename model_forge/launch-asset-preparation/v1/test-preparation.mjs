import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {prepareModel} from './prepare-launch-assets.mjs';

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
async function fixture({skin=false,normalMap=false}={}) {
  const d=new Document();const buffer=d.createBuffer();
  const accessor=(type,array)=>d.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const p=d.createPrimitive().setAttribute('POSITION',accessor('VEC3',new Float32Array([0,0,0,1,0,0,0,1,0]))).setAttribute('NORMAL',accessor('VEC3',new Float32Array([0,0,1,0,0,1,0,0,1]))).setAttribute('TEXCOORD_0',accessor('VEC2',new Float32Array([0,0,1,0,0,1]))).setIndices(accessor('SCALAR',new Uint16Array([0,1,2])));
  const material=d.createMaterial();p.setMaterial(material);
  if(normalMap){const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKX0AAAAASUVORK5CYII=','base64');material.setNormalTexture(d.createTexture().setImage(png).setMimeType('image/png'));}
  const mesh=d.createMesh().addPrimitive(p);const node=d.createNode().setMesh(mesh);const scene=d.createScene().addChild(node);d.getRoot().setDefaultScene(scene);
  if(skin){
    p.setAttribute('JOINTS_0',accessor('VEC4',new Uint16Array([0,1,2,3,0,1,2,3,0,1,2,3]))).setAttribute('WEIGHTS_0',accessor('VEC4',new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0])));
    const bones=Array.from({length:4},(_,i)=>d.createNode('bone'+i));bones.slice(1).forEach(b=>bones[0].addChild(b));scene.addChild(bones[0]);const s=d.createSkin().setSkeleton(bones[0]);bones.forEach(b=>s.addJoint(b));node.setSkin(s);
    const animation=d.createAnimation('translation-proof');const sampler=d.createAnimationSampler().setInput(accessor('SCALAR',new Float32Array([0,1]))).setOutput(accessor('VEC3',new Float32Array([0,0,0,0,0.1,0])));animation.addSampler(sampler).addChannel(d.createAnimationChannel().setSampler(sampler).setTargetNode(bones[0]).setTargetPath('translation'));
  }
  return io.writeBinary(d);
}
test('Raw meshopt preserves geometry/animation/transforms and emits identical bytes twice',async()=>{
  const input=await fixture({skin:true});const a=await prepareModel(input);const b=await prepareModel(input);
  assert.equal(a.receipt.outputSha256,b.receipt.outputSha256);assert.equal(a.receipt.decodedSemanticReadbackExact,true);assert.equal(a.receipt.decodedKhronos.numErrors,0);assert.equal(a.receipt.zeroWeightJointsCleared,9);
  const decoded=await io.readBinary(a.bytes);assert.deepEqual(Array.from(decoded.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('JOINTS_0').getArray()),Array(12).fill(0));assert.equal(decoded.getRoot().listAnimations().length,1);
});
test('Optional tangent proposal supplies finite normalized handed tangents and retains face positions',async()=>{
  const a=await prepareModel(await fixture({normalMap:true}),{prepareTangents:true});assert.equal(a.receipt.tangentPrimitivesPrepared,1);assert.equal(a.receipt.decodedKhronos.numWarnings,0);
  const p=(await io.readBinary(a.bytes)).getRoot().listMeshes()[0].listPrimitives()[0];assert.deepEqual(Array.from(p.getAttribute('POSITION').getArray()),[0,0,0,1,0,0,0,1,0]);const t=p.getAttribute('TANGENT').getArray();
  for(let i=0;i<t.length;i+=4){assert.ok(Math.abs(Math.hypot(t[i],t[i+1],t[i+2])-1)<1e-5);assert.ok(t[i+3]===1||t[i+3]===-1);}
});
test('Malformed GLB input fails closed',async()=>{await assert.rejects(prepareModel(new Uint8Array([0,1,2,3])));});
test('CLI rejects hash mismatch and refuses output inside source tree',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'urai-asset-prepare-'));const source=path.join(temp,'source'),out=path.join(temp,'candidate');await fs.mkdir(source);const bytes=await fixture();await fs.writeFile(path.join(source,'test.glb'),bytes);const matrix=path.join(temp,'matrix.json');await fs.writeFile(matrix,JSON.stringify({assetMatrix:[{id:'test',path:'test.glb',sha256:'0'.repeat(64),measured:{format:'glb'},budgets:{}}]}));const recipe=fileURLToPath(new URL('./prepare-launch-assets.mjs',import.meta.url));
  try {assert.throws(()=>execFileSync(process.execPath,[recipe,source,matrix,out],{stdio:'pipe'}));assert.deepEqual(await fs.readdir(path.join(out,'models')),[]);assert.throws(()=>execFileSync(process.execPath,[recipe,source,matrix,path.join(source,'candidates')],{stdio:'pipe'}));assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(source,'test.glb'))).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));} finally {await fs.rm(temp,{recursive:true,force:true});}
});

test('CLI binds missing model budget to pinned Spatial policy and refuses malformed declarations',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'urai-asset-budget-'));
  const source=path.join(temp,'source'), out=path.join(temp,'candidate');
  await fs.mkdir(source);
  const bytes=await fixture();await fs.writeFile(path.join(source,'test.glb'),bytes);
  const matrix=path.join(temp,'matrix.json');
  const record={id:'test',path:'test.glb',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceRepository:'fixture',sourceSha:'fixture',measured:{format:'glb'},budgets:{}};
  const recipe=fileURLToPath(new URL('./prepare-launch-assets.mjs',import.meta.url));
  try {
    await fs.writeFile(matrix,JSON.stringify({assetMatrix:[record]}));
    execFileSync(process.execPath,[recipe,source,matrix,out],{stdio:'pipe'});
    const receipt=JSON.parse(await fs.readFile(path.join(out,'receipts/test.json'),'utf8'));
    assert.equal(receipt.byteBudget.effectiveMaxBytes,3145728);
    assert.equal(receipt.byteBudget.initialAssetBytes,2500000);
    assert.equal(receipt.byteBudget.authority.commit,'c75eb8a10aa1712fe64030d82aafeb3a1d31e702');
    assert.equal(receipt.byteBudgetPass,true);
    assert.equal(receipt.classification,'MACHINE_PREPARED_CANDIDATE_NOT_ADMITTED');
    record.budgets.maxBytes='99999999';
    await fs.writeFile(matrix,JSON.stringify({assetMatrix:[record]}));
    const rejected=path.join(temp,'rejected');
    assert.throws(()=>execFileSync(process.execPath,[recipe,source,matrix,rejected],{stdio:'pipe'}));
    assert.deepEqual(await fs.readdir(path.join(rejected,'models')),[]);
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});

for(const modelCount of [1,21]) test(`CLI verifies preserved source hashes and reports ${modelCount} actual models without claiming 22 review copies`,async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'urai-asset-preservation-'));
  const source=path.join(temp,'source'),out=path.join(temp,'candidate');await fs.mkdir(source);
  const bytes=await fixture(),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const matrix=path.join(temp,'matrix.json'),records=[];
  const recipe=fileURLToPath(new URL('./prepare-launch-assets.mjs',import.meta.url));
  try {
    for(let i=0;i<modelCount;i++){
      const id='model-'+i,pathName=id+'.glb';await fs.writeFile(path.join(source,pathName),bytes);
      records.push({id,path:pathName,sha256,sourceSha:'fixture',measured:{format:'glb'},budgets:{}});
    }
    records.push({id:'not-a-model',measured:{format:'json'}});
    await fs.writeFile(matrix,JSON.stringify({assetMatrix:records}));
    execFileSync(process.execPath,[recipe,source,matrix,out],{stdio:'pipe'});
    const summary=JSON.parse(await fs.readFile(path.join(out,'model-receipts.json'),'utf8'));
    assert.equal(summary.matrixAssetCount,modelCount+1);assert.equal(summary.preparedModelCount,modelCount);assert.equal(summary.sourceInputsVerifiedUnchanged,modelCount);assert.equal(summary.receipts.length,modelCount);assert.equal(summary.admitted,0);
    assert.equal(summary.reviewCopiesPreservation,'NOT_VERIFIED_BY_THIS_RECIPE');
    for(const row of summary.receipts){
      assert.equal(row.matrixAssetCount,modelCount+1);assert.equal(row.preparedModelCount,modelCount);
      assert.equal(Object.hasOwn(row,'sourceAnd22LosslessReviewCopiesPreserved'),false);
      assert.deepEqual(row.sourceInputPreservation,{verified:true,sha256Before:sha256,sha256After:sha256});
      assert.equal(row.reviewCopiesPreservation,'NOT_VERIFIED_BY_THIS_RECIPE');
      assert.equal(row.classification,'MACHINE_PREPARED_CANDIDATE_NOT_ADMITTED');
      assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(source,row.sourcePath))).digest('hex'),sha256);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(out,'receipts',row.id+'.json'),'utf8')),row);
    }
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});

test('CLI rejects a source changed after its initial hash instead of publishing a preservation receipt',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'urai-asset-source-change-'));
  const source=path.join(temp,'source'),out=path.join(temp,'candidate');await fs.mkdir(source);
  const bytes=await fixture(),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),sourceFile=path.join(source,'test.glb');
  const matrix=path.join(temp,'matrix.json'),preload=path.join(temp,'concurrent-source-change.mjs');
  const recipe=fileURLToPath(new URL('./prepare-launch-assets.mjs',import.meta.url));
  try {
    await fs.writeFile(sourceFile,bytes);
    await fs.writeFile(matrix,JSON.stringify({assetMatrix:[{id:'test',path:'test.glb',sha256,sourceSha:'fixture',measured:{format:'glb'},budgets:{}}]}));
    // Deterministically model a concurrent edit before the second real filesystem read.
    await fs.writeFile(preload,`import fs from 'node:fs/promises';\nimport path from 'node:path';\nconst read=fs.readFile.bind(fs),target=${JSON.stringify(sourceFile)};let reads=0;\nfs.readFile=async function(file,...args){if(typeof file==='string'&&path.resolve(file)===target&&++reads===2)await fs.writeFile(target,'concurrent changed source');return read(file,...args);};\n`);
    assert.throws(()=>execFileSync(process.execPath,['--import',preload,recipe,source,matrix,out],{stdio:'pipe'}),error=>error.status===1&&/Source changed during preparation test/.test(error.stderr.toString()));
    assert.deepEqual(await fs.readdir(path.join(out,'receipts')),[]);
    await assert.rejects(fs.readFile(path.join(out,'model-receipts.json')),error=>error.code==='ENOENT');
    assert.equal(await fs.readFile(sourceFile,'utf8'),'concurrent changed source');
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
