import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {Document,NodeIO} from '@gltf-transform/core';import {prepareFloorFootprint} from './floor-footprint.mjs';
const io=new NodeIO(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture({outside=false,animated=false,shared=false,quantizedPosition=false,quantizedNormals=false}={}){
 const d=new Document(),b=d.createBuffer(),a=(type,values)=>d.createAccessor().setType(type).setArray(values).setBuffer(b);
 const p=d.createPrimitive().setAttribute('POSITION',a('VEC3',new Float32Array([-5,0,-5,5,0,-5,5,0,5,-5,0,5]))).setAttribute('NORMAL',a('VEC3',new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]))).setIndices(a('SCALAR',new Uint16Array([0,2,1,0,3,2])));
 if(quantizedPosition)p.getAttribute('POSITION').setArray(new Int16Array([-32767,0,-32767,32767,0,-32767,32767,0,32767,-32767,0,32767])).setNormalized(true);
 if(quantizedNormals)p.getAttribute('NORMAL').setArray(new Int16Array([0,32767,0,0,32767,0,0,32767,0,0,32767,0])).setNormalized(true);
 const mesh=d.createMesh().addPrimitive(p),floor=d.createNode('floor').setMesh(mesh),scene=d.createScene().addChild(floor);d.getRoot().setDefaultScene(scene);
 if(outside)scene.addChild(d.createNode('portal').setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',a('VEC3',new Float32Array([4,0,0,5,0,0,4,2,0]))))));
 if(shared)scene.addChild(d.createNode('other').setMesh(mesh));
 if(animated){const s=d.createAnimationSampler().setInput(a('SCALAR',new Float32Array([0,1]))).setOutput(a('VEC3',new Float32Array([0,0,0,0,0,1])));d.createAnimation().addSampler(s).addChannel(d.createAnimationChannel().setTargetNode(floor).setTargetPath('translation').setSampler(s));}
 return io.writeBinary(d);
}
test('Floor-only successor preserves height, topology and node placement and binds hashes',async()=>{
 const b=await fixture(),r=await prepareFloorFootprint(b,{sourceSha256:hash(b),floorNodeName:'floor',widthMeters:8,depthMeters:6});
 const p=(await io.readBinary(r.bytes)).getRoot().listMeshes()[0].listPrimitives()[0];
 assert.deepEqual(Array.from(p.getAttribute('POSITION').getArray()),[-4,0,-3,4,0,-3,4,0,3,-4,0,3]);
 assert.deepEqual(Array.from(p.getIndices().getArray()),[0,2,1,0,3,2]);assert.ok(Array.from(p.getAttribute('NORMAL').getArray()).every(Number.isFinite));
 assert.equal(r.receipt.runtimeAdmission,false);assert.equal(r.receipt.collisionNavigationVerified,false);assert.equal(r.receipt.repeatedOutputHashExact,true);
});
test('Floor rewrite refuses quantized storage instead of truncating new positions or normals',async()=>{
 for(const flags of [{quantizedPosition:true},{quantizedNormals:true}]){
  const b=await fixture(flags);
  await assert.rejects(prepareFloorFootprint(b,{sourceSha256:hash(b),floorNodeName:'floor',widthMeters:1,depthMeters:1}),/unnormalized float/);
 }
});
test('Refuses unsupported floor enlargement, hash, animated/shared floor and clipped content',async()=>{
 const base=await fixture();
 for(const cfg of [{sourceSha256:'0'.repeat(64)},{widthMeters:11},{depthMeters:NaN},{floorNodeName:'missing'}])
  await assert.rejects(prepareFloorFootprint(base,{sourceSha256:hash(base),floorNodeName:'floor',widthMeters:8,depthMeters:8,...cfg}));
 for(const f of [{outside:true},{animated:true},{shared:true}]){const b=await fixture(f);await assert.rejects(prepareFloorFootprint(b,{sourceSha256:hash(b),floorNodeName:'floor',widthMeters:8,depthMeters:8}));}
});
