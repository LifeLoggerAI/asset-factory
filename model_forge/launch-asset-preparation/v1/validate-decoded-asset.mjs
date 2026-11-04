#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import validator from 'gltf-validator';
import { parseGlbContainer } from '../../glb-container.mjs';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const limitsKeys = ['maxFileBytes','maxDecodedAccessorBytes','maxTriangles','maxDrawCalls','maxTexturePixels'];
function* positionIndices(count) { for(let i=0;i<count;i++) yield i; }
export function validatePolicy(policy, bytes) {
  need(policy?.schemaVersion === 'urai-decoded-asset-policy-v1', 'Policy schema');
  need(typeof policy.limitsSource === 'string' && policy.limitsSource.trim().length > 0, 'Explicit limits source is required');
  need(policy.artifactSha256 === sha256(bytes), 'Policy artifact hash mismatch');
  for (const k of limitsKeys) need(positive(policy[k]), `Explicit positive integer ${k} required`);
  need(bytes.length <= policy.maxFileBytes, 'File byte budget exceeded');
  need(policy.bounds?.scope === 'default-scene-world-space', 'Explicit default-scene world bounds required');
  for (const k of ['min','max']) need(Array.isArray(policy.bounds[k]) && policy.bounds[k].length === 3 && policy.bounds[k].every(Number.isFinite), 'Finite three-dimensional bounds required');
  for (let a=0;a<3;a++) need(policy.bounds.min[a] <= policy.bounds.max[a], 'Bounds order');
}
export async function validateDecodedAsset(bytes, policy) {
  validatePolicy(policy, bytes);
  const { gltf } = parseGlbContainer(bytes);
  // This verifier consumes one self-contained artifact, never a network or arbitrary path.
  need((gltf.buffers ?? []).every(b => b.uri === undefined), 'External/data buffer resources are outside this policy');
  need((gltf.images ?? []).every(i => i.uri === undefined), 'External/data image resources are outside this policy');
  const componentBytes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  let declaredDecodedBytes = 0;
  for (const a of gltf.accessors ?? []) {
    need(positive(a.count) && componentBytes[a.componentType] && components[a.type], 'Invalid accessor dimensions');
    const size = a.count * componentBytes[a.componentType] * components[a.type];
    need(Number.isSafeInteger(size), 'Accessor size overflow');
    declaredDecodedBytes += size;
    need(Number.isSafeInteger(declaredDecodedBytes) && declaredDecodedBytes <= policy.maxDecodedAccessorBytes, 'Declared decoded accessor byte budget exceeded');
  }
  // Bound virtual Meshopt outputs before allocation, including unused views.
  for (const v of gltf.bufferViews ?? []) {
    const m = v.extensions?.EXT_meshopt_compression;
    if (m) need(positive(m.count) && positive(m.byteStride) && Number.isSafeInteger(m.count * m.byteStride) && m.count * m.byteStride === v.byteLength, 'Meshopt decoded dimensions mismatch');
  }
  const virtualBytes = (gltf.bufferViews ?? []).reduce((n,v) => n + (v.extensions?.EXT_meshopt_compression ? v.byteLength : 0), 0);
  need(Number.isSafeInteger(virtualBytes) && virtualBytes <= policy.maxDecodedAccessorBytes, 'Meshopt decoded view byte budget exceeded');
  const structure = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 1000 });
  need(structure.issues.numErrors === 0, `Khronos validation errors: ${structure.issues.numErrors}`);
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const document = await io.readBinary(new Uint8Array(bytes));
  const root = document.getRoot();
  let decodedAccessorBytes = 0;
  for (const a of root.listAccessors()) {
    const arr = a.getArray();
    need(arr, 'Accessor did not decode');
    decodedAccessorBytes += arr.byteLength;
    need(decodedAccessorBytes <= policy.maxDecodedAccessorBytes, 'Actual decoded accessor byte budget exceeded');
    for (const value of arr) need(Number.isFinite(value), 'Non-finite decoded accessor value');
  }
  const scene = root.getDefaultScene();
  need(scene, 'A default scene is required for geometry bounds');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let triangles=0,drawCalls=0,positionInstances=0;
  scene.traverse((node) => {
    const mesh=node.getMesh();if(!mesh)return;
    need(!node.getSkin(), 'Skinned pose bounds require separately measured animation-aware policy');
    need(!node.getExtension('EXT_mesh_gpu_instancing'), 'Instanced scene bounds require instance-aware policy');
    const m=node.getWorldMatrix();
    need(m.every(Number.isFinite), 'Non-finite node transform');
    for(const primitive of mesh.listPrimitives()) {
      need(primitive.listTargets().length===0, 'Morph pose bounds require separately measured animation-aware policy');
      const position=primitive.getAttribute('POSITION');
      need(position && position.getType()==='VEC3', 'Decoded POSITION VEC3 required');
      const index=primitive.getIndices();const count=index?index.getCount():position.getCount();
      if(index) {
        need(index.getType()==='SCALAR' && [5121,5123,5125].includes(index.getComponentType()), 'Unsigned scalar indices required');
        for(const n of index.getArray())need(Number.isInteger(n)&&n>=0&&n<position.getCount(), 'Decoded index exceeds vertex count');
      }
      for(const semantic of primitive.listSemantics())need(primitive.getAttribute(semantic).getCount()===position.getCount(), 'Attribute vertex count mismatch');
      const mode=primitive.getMode();
      if(mode===4){need(count%3===0,'Triangle list count mismatch');triangles+=count/3;}
      else if(mode===5||mode===6){need(count>=3,'Triangle strip/fan too short');triangles+=count-2;}
      else need([0,1,2,3].includes(mode),'Unsupported primitive mode');
      drawCalls++;need(triangles<=policy.maxTriangles,'Scene triangle budget exceeded');need(drawCalls<=policy.maxDrawCalls,'Scene draw-call budget exceeded');
      // Buffer storage may retain unused position elements. Bounds describe the
      // geometry this primitive can draw; allocation/finiteness above still
      // validates every stored element, including those not referenced here.
      const referenced = index ? new Set(index.getArray()) : null;
      const positions = referenced ?? positionIndices(position.getCount());
      for(const i of positions) {
        const p=position.getElement(i,[]);
        const out=[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
        for(let a=0;a<3;a++){need(Number.isFinite(out[a]),'Non-finite transformed vertex');min[a]=Math.min(min[a],out[a]);max[a]=Math.max(max[a],out[a]);need(out[a]>=policy.bounds.min[a]&&out[a]<=policy.bounds.max[a], 'Decoded geometry exceeds declared scene bounds');}
        positionInstances++;
      }
    }
  });
  need(positionInstances>0,'Default scene has no decoded geometry');
  need(root.listAnimations().length===0, 'Animated bounds require separately measured animation-aware policy');
  let texturePixels=0;
  for(const texture of root.listTextures()) {
    const image=texture.getImage();need(image,'Texture data did not decode');
    const metadata=await sharp(Buffer.from(image),{limitInputPixels:policy.maxTexturePixels}).metadata();
    need(positive(metadata.width)&&positive(metadata.height),'Texture dimensions missing');
    need((metadata.pages ?? 1) === 1, 'Animated/multipage textures need a separate policy');
    texturePixels+=metadata.width*metadata.height;
    need(Number.isSafeInteger(texturePixels)&&texturePixels<=policy.maxTexturePixels,'Texture pixel budget exceeded');
    // Decode pixels too: a readable header alone does not verify image integrity.
    const decoded = await sharp(Buffer.from(image),{limitInputPixels:policy.maxTexturePixels}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    need(decoded.info.width===metadata.width && decoded.info.height===metadata.height, 'Decoded texture dimensions mismatch');
  }
  return {schemaVersion:'urai-decoded-asset-validation-v1',artifactSha256:sha256(bytes),policySha256:sha256(Buffer.from(JSON.stringify(policy))),fileBytes:bytes.length,decodedAccessorBytes,declaredDecodedBytes,triangles,drawCalls,texturePixels,positionInstances,bounds:{min,max},khronosErrors:structure.issues.numErrors,khronosWarnings:structure.issues.numWarnings,verdict:'decoded-static-default-scene-within-declared-policy',visualAccepted:false,deviceAccepted:false,runtimeAccepted:false,promotionAllowed:false,limitsAuthorityVerified:false};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try {
  need(process.argv.length===4,'Usage: node validate-decoded-asset.mjs <artifact.glb> <policy.json>');
  console.log(JSON.stringify(await validateDecodedAsset(fs.readFileSync(process.argv[2]),JSON.parse(fs.readFileSync(process.argv[3],'utf8'))),null,2));
 }catch(e){console.error('URAI_DECODED_ASSET_BLOCKED='+e.message);process.exitCode=1;}
}
