import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { validateDecodedAsset } from './validate-decoded-asset.mjs';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const pad = b => Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
function source(){
 const positions=Buffer.alloc(36);[0,0,0,1,0,0,0,1,0].forEach((n,i)=>positions.writeFloatLE(n,i*4));
 const indices=Buffer.alloc(6);[0,1,2].forEach((n,i)=>indices.writeUInt16LE(n,i*2));
 return {d:{asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],buffers:[{byteLength:44}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}]},bin:Buffer.concat([positions,pad(indices)])};
}
function pack({d,bin}){d.buffers[0].byteLength=bin.length;let j=Buffer.from(JSON.stringify(d));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const b=Buffer.alloc(28+j.length+bin.length);b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(j.length,12);b.writeUInt32LE(0x4e4f534a,16);j.copy(b,20);b.writeUInt32LE(bin.length,20+j.length);b.writeUInt32LE(0x004e4942,24+j.length);bin.copy(b,28+j.length);return b;}
const policy = b => ({schemaVersion:'urai-decoded-asset-policy-v1',artifactSha256:sha(b),limitsSource:'synthetic regression fixture caps, not production limits',maxFileBytes:4096,maxDecodedAccessorBytes:1024,maxTriangles:10,maxDrawCalls:10,maxTexturePixels:16,bounds:{scope:'default-scene-world-space',min:[0,0,0],max:[1,1,0]}});
test('actual raw geometry decoded with declared bounds',async()=>{let b=pack(source()),r=await validateDecodedAsset(b,policy(b));assert.deepEqual(r.bounds,{min:[0,0,0],max:[1,1,0]});assert.equal(r.triangles,1);assert.equal(r.decodedAccessorBytes,42);assert.equal(r.drawCalls,1);assert.equal(r.promotionAllowed,false);assert.equal(r.deviceAccepted,false);});
test('actual Meshopt compressed vertices and indices decoded',async()=>{
 await MeshoptEncoder.ready;const s=source(),position=MeshoptEncoder.encodeGltfBuffer(new Uint8Array(s.bin.subarray(0,36)),3,12,'ATTRIBUTES'),indices=MeshoptEncoder.encodeGltfBuffer(new Uint8Array(s.bin.subarray(36,42)),3,2,'TRIANGLES');
 s.d.extensionsUsed=['EXT_meshopt_compression'];s.d.extensionsRequired=['EXT_meshopt_compression'];s.d.buffers.push({byteLength:44,extensions:{EXT_meshopt_compression:{fallback:true}}});
 s.d.bufferViews=[{buffer:1,byteLength:36,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:0,byteLength:position.length,byteStride:12,count:3,mode:'ATTRIBUTES'}}},{buffer:1,byteOffset:36,byteLength:6,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:pad(position).length,byteLength:indices.length,byteStride:2,count:3,mode:'TRIANGLES'}}}];s.bin=Buffer.concat([pad(position),pad(indices)]);let b=pack(s),r=await validateDecodedAsset(b,policy(b));assert.equal(r.triangles,1);assert.deepEqual(r.bounds,{min:[0,0,0],max:[1,1,0]});
 s.bin[0]=0; b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)));
});
for(const key of ['maxFileBytes','maxDecodedAccessorBytes','maxTriangles','maxDrawCalls','maxTexturePixels']){
 test('missing numerical limit '+key,async()=>{let b=pack(source()),p=policy(b);delete p[key];await assert.rejects(validateDecodedAsset(b,p),/Explicit positive/);});
 test('nonfinite numerical limit '+key,async()=>{let b=pack(source()),p=policy(b);p[key]=Infinity;await assert.rejects(validateDecodedAsset(b,p),/Explicit positive/);});
}
test('wrong exact artifact hash',async()=>{let b=pack(source()),p=policy(b);p.artifactSha256='0'.repeat(64);await assert.rejects(validateDecodedAsset(b,p),/hash mismatch/);});
test('file byte cap enforced',async()=>{let b=pack(source()),p=policy(b);p.maxFileBytes=b.length-1;await assert.rejects(validateDecodedAsset(b,p),/File byte/);});
test('decoded allocation cap before decoder',async()=>{let b=pack(source()),p=policy(b);p.maxDecodedAccessorBytes=41;await assert.rejects(validateDecodedAsset(b,p),/Declared decoded/);});
test('decoded index outside actual vertex count',async()=>{let s=source();s.bin.writeUInt16LE(500,36);let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)));});
test('nonfinite actual vertex data',async()=>{let s=source();s.bin.writeFloatLE(NaN,0);let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)));});
test('transformed geometry must fit scene bounds',async()=>{let s=source();s.d.nodes[0].translation=[2,0,0];let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)),/scene bounds/);let p=policy(b);p.bounds.min=[2,0,0];p.bounds.max=[3,1,0];assert.deepEqual((await validateDecodedAsset(b,p)).bounds,{min:[2,0,0],max:[3,1,0]});});
test('shared mesh instances count against scene budgets',async()=>{let s=source();s.d.nodes.push({mesh:0});s.d.scenes[0].nodes.push(1);let b=pack(s),p=policy(b);p.maxTriangles=1;await assert.rejects(validateDecodedAsset(b,p),/triangle budget/);p.maxTriangles=2;p.maxDrawCalls=1;await assert.rejects(validateDecodedAsset(b,p),/draw-call budget/);p.maxDrawCalls=2;let r=await validateDecodedAsset(b,p);assert.equal(r.triangles,2);assert.equal(r.drawCalls,2);});
test('finite and ordered numerical scene bounds required',async()=>{let b=pack(source()),p=policy(b);p.bounds.min=[Infinity,0,0];await assert.rejects(validateDecodedAsset(b,p),/Finite/);p.bounds.min=[2,0,0];await assert.rejects(validateDecodedAsset(b,p),/Bounds order/);});
test('external buffer resource rejected before IO',async()=>{let s=source();s.d.buffers[0].uri='https://example.com/private.bin';let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)));});
test('actual PNG dimensions against texture pixel cap',async()=>{let s=source();const png=await sharp({create:{width:2,height:2,channels:4,background:'#fff'}}).png().toBuffer();s.d.bufferViews.push({buffer:0,byteOffset:s.bin.length,byteLength:png.length});s.bin=Buffer.concat([s.bin,pad(png)]);s.d.images=[{bufferView:2,mimeType:'image/png'}];s.d.textures=[{source:0}];s.d.materials=[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}];s.d.meshes[0].primitives[0].material=0;/* no TEXCOORD: validator correctly blocks malformed material use */s.d.materials[0].pbrMetallicRoughness={};let b=pack(s),p=policy(b);const r=await validateDecodedAsset(b,p);assert.equal(r.texturePixels,4);p.maxTexturePixels=3;await assert.rejects(validateDecodedAsset(b,p));});

test('Meshopt dimensions cannot bypass allocation cap',async()=>{let s=source();s.d.bufferViews[0].extensions={EXT_meshopt_compression:{buffer:0,byteLength:36,byteStride:12,count:999999,mode:'ATTRIBUTES'}};let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)),/dimensions mismatch/);});
test('missing default scene fails closed',async()=>{let s=source();delete s.d.scene;let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)),/default scene/);});
test('skinned pose cannot silently use static bounds',async()=>{let s=source();s.d.nodes.push({});s.d.scenes[0].nodes.push(1);s.d.skins=[{joints:[1]}];s.d.nodes[0].skin=0;let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)));});
test('animated pose cannot silently use static bounds',async()=>{let s=source();s.d.animations=[{samplers:[{input:1,output:0}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}];let b=pack(s);await assert.rejects(validateDecodedAsset(b,policy(b)));});
