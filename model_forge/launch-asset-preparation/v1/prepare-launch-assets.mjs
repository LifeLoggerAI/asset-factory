import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import validator from 'gltf-validator';
import {evaluateModelByteBudget} from './asset-byte-budgets.mjs';
import {inspectSceneBounds} from './scene-bounds.mjs';
import {weldExactCorners} from './weld-exact-corners.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const typedBytes = array => Buffer.from(array.buffer,array.byteOffset,array.byteLength);
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});

function triangleCanonical(indices, mode) {
  if (mode!==4) return Array.from(indices);
  const result=[];
  for(let i=0;i<indices.length;i+=3) {
    const t=[indices[i],indices[i+1],indices[i+2]];
    const min=t.indexOf(Math.min(...t));result.push(t[min],t[(min+1)%3],t[(min+2)%3]);
  }
  return result;
}
export function snapshot(document) {
  const root=document.getRoot();
  return {
    meshes:root.listMeshes().map(mesh=>mesh.listPrimitives().map(primitive=>({mode:primitive.getMode(),attributes:Object.fromEntries(primitive.listSemantics().map(semantic=>{const a=primitive.getAttribute(semantic);return [semantic,{type:a.getType(),normalized:a.getNormalized(),bytes:sha(typedBytes(a.getArray()))}]})),indices:primitive.getIndices()?sha(JSON.stringify(triangleCanonical(primitive.getIndices().getArray(),primitive.getMode()))):null,targets:primitive.listTargets().map(target=>Object.fromEntries(target.listSemantics().map(semantic=>[semantic,sha(typedBytes(target.getAttribute(semantic).getArray()))])))}))),
    nodes:root.listNodes().map(node=>({name:node.getName(),matrix:node.getMatrix(),children:node.listChildren().map(child=>root.listNodes().indexOf(child)),mesh:root.listMeshes().indexOf(node.getMesh()),skin:root.listSkins().indexOf(node.getSkin())})),
    skins:root.listSkins().map(skin=>({joints:skin.listJoints().map(joint=>root.listNodes().indexOf(joint)),inverseBindMatrices:skin.getInverseBindMatrices()?sha(typedBytes(skin.getInverseBindMatrices().getArray())):null})),
    animations:root.listAnimations().map(animation=>animation.listSamplers().map(sampler=>({interpolation:sampler.getInterpolation(),input:sha(typedBytes(sampler.getInput().getArray())),output:sha(typedBytes(sampler.getOutput().getArray()))}))),
    textures:root.listTextures().map(texture=>sha(texture.getImage())),
    materials:root.listMaterials().map(material=>({name:material.getName(),alphaMode:material.getAlphaMode(),baseColor:material.getBaseColorFactor(),metallic:material.getMetallicFactor(),roughness:material.getRoughnessFactor(),doubleSided:material.getDoubleSided()}))
  };
}
export async function prepareModel(bytes, {prepareTangents = false} = {}) {
  const document=await io.readBinary(bytes);
  const staticSceneBounds=inspectSceneBounds(document);
  const originalSnapshot=snapshot(document);
  let zeroWeightJointsCleared=0;
  for(const mesh of document.getRoot().listMeshes()) for(const primitive of mesh.listPrimitives()) {
    for(const semantic of primitive.listSemantics().filter(s=>s.startsWith('JOINTS_'))) {
      const joints=primitive.getAttribute(semantic);const weights=primitive.getAttribute(semantic.replace('JOINTS_','WEIGHTS_'));
      assert.ok(weights,`Missing paired weights for ${semantic}`);
      const j=joints.getArray();const w=weights.getArray();assert.equal(j.length,w.length);
      for(let i=0;i<j.length;i++) if(w[i]===0&&j[i]!==0){j[i]=0;zeroWeightJointsCleared++;}
    }
  }
  const preparedSnapshot=snapshot(document);
  // Non-JOINT attributes, transforms, hierarchy, skin matrices, animations and textures stay exact.
  for(let m=0;m<originalSnapshot.meshes.length;m++) for(let p=0;p<originalSnapshot.meshes[m].length;p++) {
    const a=originalSnapshot.meshes[m][p].attributes,b=preparedSnapshot.meshes[m][p].attributes;
    for(const semantic of Object.keys(a)) if(!semantic.startsWith('JOINTS_')) assert.deepEqual(b[semantic],a[semantic]);
  }
  for(const key of ['nodes','skins','animations','textures','materials']) assert.deepEqual(preparedSnapshot[key],originalSnapshot[key]);
  let tangentPrimitivesPrepared = 0;
  if (prepareTangents) {
    const {MeshoptTangents} = await import('meshoptimizer/tangents');
    await MeshoptTangents.ready;
    for(const mesh of document.getRoot().listMeshes()) for(const primitive of mesh.listPrimitives()) {
      if(!primitive.getMaterial()?.getNormalTexture() || primitive.getAttribute('TANGENT')) continue;
      assert.equal(primitive.getMode(),4,'Tangent preparation currently requires triangle lists');
      const positions=primitive.getAttribute('POSITION'),normals=primitive.getAttribute('NORMAL'),uvs=primitive.getAttribute('TEXCOORD_0');
      assert.ok(positions&&normals&&uvs,'Tangent preparation needs positions, normals and primary UVs');
      assert.equal(primitive.getMaterial().getNormalTextureInfo().getTexCoord(),0,'Explicit secondary-UV tangent recipe required');
      const indices=primitive.getIndices()?.getArray();
      const tangents=MeshoptTangents.generateTangents(indices?new Uint32Array(indices):null,positions.getArray(),3,normals.getArray(),3,uvs.getArray(),2,['Compatible']);
      if(indices) {
        for(const semantic of primitive.listSemantics()) {
          const old=primitive.getAttribute(semantic),input=old.getArray(),size=old.getElementSize();
          const expanded=new input.constructor(indices.length*size);
          for(let i=0;i<indices.length;i++) for(let j=0;j<size;j++) expanded[i*size+j]=input[indices[i]*size+j];
          const accessor=old.clone().setArray(expanded);primitive.setAttribute(semantic,accessor);
        }
        for(const target of primitive.listTargets()) for(const semantic of target.listSemantics()) {
          const old=target.getAttribute(semantic),input=old.getArray(),size=old.getElementSize();const expanded=new input.constructor(indices.length*size);
          for(let i=0;i<indices.length;i++) for(let j=0;j<size;j++) expanded[i*size+j]=input[indices[i]*size+j];
          target.setAttribute(semantic,old.clone().setArray(expanded));
        }
        primitive.setIndices(null);
      }
      const tangent=document.createAccessor().setType('VEC4').setArray(tangents).setBuffer(positions.getBuffer());
      primitive.setAttribute('TANGENT',tangent);tangentPrimitivesPrepared++;
    }
  }
  const exactCornerWelding=prepareTangents?weldExactCorners(document):null;
  const outputSnapshot=snapshot(document);
  const clean=await io.writeBinary(document);
  const decodedValidation=await validator.validateBytes(clean,{maxIssues:0});
  assert.equal(decodedValidation.issues.numErrors,0);
  // QUANTIZE encoding method without a quantize/reorder transform selects raw, unfiltered lossless streams.
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  const compressed=await io.writeBinary(document);
  const repeated=await io.writeBinary(document);assert.equal(sha(compressed),sha(repeated));
  const decoded=await io.readBinary(compressed);
  // JSON has one zero representation; node matrices may lose the IEEE-754 sign of zero.
  assert.equal(JSON.stringify(snapshot(decoded)),JSON.stringify(outputSnapshot));
  const counts={};const samples={};
  for(const issue of decodedValidation.issues.messages){counts[issue.code]=(counts[issue.code]||0)+1;if(!samples[issue.code])samples[issue.code]=issue;}
  return {bytes:compressed,receipt:{staticSceneBounds,exactCornerWelding,sourceBytes:bytes.length,sourceSha256:sha(bytes),outputBytes:compressed.length,outputSha256:sha(compressed),compression:'EXT_meshopt_compression; raw unfiltered streams; no quantization, reordering or simplification',zeroWeightJointsCleared,tangentPrimitivesPrepared,tangentPreparation:prepareTangents?'MikkTSpace-compatible per-corner tangents with exact deindexing of prior attributes; normal-map visual and increased vertex/memory budgets require review':'NONE; no material/animation/transform/vertex-value change',semanticSnapshotSha256:sha(JSON.stringify(outputSnapshot)),decodedSemanticReadbackExact:true,triangleIndexCheck:'Face order and winding exact after cyclic rotation normalization',repeatedOutputHashExact:true,decodedKhronos:{version:validator.version(),numErrors:decodedValidation.issues.numErrors,numWarnings:decodedValidation.issues.numWarnings,numInfos:decodedValidation.issues.numInfos,truncated:decodedValidation.issues.truncated,countsByCode:counts,samplesByCode:samples},outputKhronosScope:'Full Khronos validation applies to decoded uncompressed candidate; compressed stream independently decoded and semantic graph verified. No native runtime/device/art acceptance.'}};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [sourceRoot,matrixPath,outputDir]=process.argv.slice(2);assert.ok(sourceRoot&&matrixPath&&outputDir,'Usage: node prepare-launch-assets.mjs SOURCE_ROOT MATRIX_JSON OUTPUT_DIR');
  const relativeOutput=path.relative(path.resolve(sourceRoot),path.resolve(outputDir));
  assert.ok(relativeOutput.startsWith('..'+path.sep)||path.isAbsolute(relativeOutput),'Candidate output must be outside the source tree');
  const matrix=JSON.parse(await fs.readFile(matrixPath,'utf8')).assetMatrix;
  await fs.mkdir(path.join(outputDir,'models'),{recursive:true});await fs.mkdir(path.join(outputDir,'receipts'),{recursive:true});
  const receipts=[];
  for(const asset of matrix.filter(a=>a.measured.format==='glb')) {
    assert.ok(!path.isAbsolute(asset.path)&&!asset.path.split(/[\\/]/).includes('..'),'Source paths must stay inside the source tree');
    const source=await fs.readFile(path.join(sourceRoot,asset.path));assert.equal(sha(source),asset.sha256,`Source mismatch ${asset.id}`);
    const prepared=await prepareModel(source);
    const byteBudget=evaluateModelByteBudget(prepared.bytes.length,asset.budgets.maxBytes);
    const outputPath=`models/${asset.id}.meshopt.glb`;await fs.writeFile(path.join(outputDir,outputPath),prepared.bytes);
    await fs.writeFile(path.join(outputDir,outputPath+'.gz'),zlib.gzipSync(prepared.bytes,{level:9,mtime:0}));
    const receipt={id:asset.id,sourceRepository:asset.sourceRepository,sourceSha:asset.sourceSha,sourcePath:asset.path,outputPath,classification:'MACHINE_PREPARED_CANDIDATE_NOT_ADMITTED',...prepared.receipt,sourceBoundsMeters:asset.budgets.actualBoundsMeters,targetBoundsMeters:asset.budgets.targetBoundsMeters,boundsPass:asset.budgets.boundsPass,sourceTriangleCount:asset.budgets.actualTriangles,byteBudgetPass:byteBudget.byteBudgetPass,byteBudget,sourceAnd22LosslessReviewCopiesPreserved:true};
    await fs.writeFile(path.join(outputDir,'receipts',asset.id+'.json'),JSON.stringify(receipt,null,2)+'\n');receipts.push(receipt);
    process.stdout.write(JSON.stringify({id:asset.id,bytes:prepared.bytes.length,warnings:receipt.decodedKhronos.numWarnings,cleared:receipt.zeroWeightJointsCleared})+'\n');
  }
  await fs.writeFile(path.join(outputDir,'model-receipts.json'),JSON.stringify({sourceSha:matrix[0].sourceSha,toolchain:{core:'4.5.1',extensions:'4.5.1',meshoptimizer:'1.3.0',validator:validator.version()},admitted:0,receipts},null,2)+'\n');
}
