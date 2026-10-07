import test from 'node:test';import assert from 'node:assert/strict';
import {Document} from '@gltf-transform/core';import {normalizeSkinRoots,pruneUnusedMaterials} from './schema-normalization.mjs';
function fixture({translated=false,animated=false}={}){
 const d=new Document(),root=d.createNode('root'),body=d.createNode('body').setMesh(d.createMesh()).setSkin(d.createSkin());
 root.addChild(body);const scene=d.createScene().addChild(root);d.getRoot().setDefaultScene(scene);
 if(translated)root.setTranslation([1,0,0]);
 if(animated){const b=d.createBuffer(),input=d.createAccessor().setType('SCALAR').setArray(new Float32Array([0,1])).setBuffer(b),output=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,0,1,0])).setBuffer(b),sampler=d.createAnimationSampler().setInput(input).setOutput(output);d.createAnimation().addSampler(sampler).addChannel(d.createAnimationChannel().setTargetNode(root).setTargetPath('translation').setSampler(sampler));}
 return {d,root,body,scene};
}
test('Identity unanimated ancestor promotion retains skin binding/world matrices',()=>{
 const {d,root,body,scene}=fixture(),skin=body.getSkin();const r=normalizeSkinRoots(d);
 assert.equal(r.identityAncestorSkinMeshesPromoted,1);assert.equal(body.getParentNode(),null);
 assert.ok(scene.listChildren().includes(body));assert.equal(body.getSkin(),skin);assert.equal(root.listChildren().length,0);assert.equal(r.runtimeAdmission,false);
});
test('Ancestor transforms and animation cannot silently change skin semantics',()=>{
 for(const opts of [{translated:true},{animated:true}]){const {d,body}=fixture(opts);assert.throws(()=>normalizeSkinRoots(d),opts.animated?/Animated skin ancestor/:/Nonidentity skin ancestor/);assert.ok(body.getParentNode());}
});
test('Only demonstrably unreferenced materials are removed',()=>{
 const d=new Document(),used=d.createMaterial('used'),unused=d.createMaterial('unused');
 d.createMesh().addPrimitive(d.createPrimitive().setMaterial(used));
 const r=pruneUnusedMaterials(d);assert.equal(r.unusedMaterialsRemoved,1);assert.deepEqual(d.getRoot().listMaterials(),[used]);assert.equal(unused.isDisposed(),true);
});

test('Unsupported later mesh rejects before any earlier mesh is moved',()=>{
 const {d,root,body,scene}=fixture(),badRoot=d.createNode('bad').setTranslation([1,0,0]);
 badRoot.addChild(d.createNode('otherBody').setMesh(d.createMesh()).setSkin(d.createSkin()));scene.addChild(badRoot);
 assert.throws(()=>normalizeSkinRoots(d),/Nonidentity/);assert.equal(body.getParentNode(),root);
});
