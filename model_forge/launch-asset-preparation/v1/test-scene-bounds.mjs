import test from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '@gltf-transform/core';
import {inspectSceneBounds} from './scene-bounds.mjs';
function fixture(){
 const d=new Document(),b=d.createBuffer();
 const p=d.createPrimitive().setAttribute('POSITION',d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,2,1,0])).setBuffer(b));
 const mesh=d.createMesh().addPrimitive(p),scene=d.createScene();d.getRoot().setDefaultScene(scene);return {d,mesh,scene};
}
test('Actual default-scene vertices include translations, parent scales and repeated instances',()=>{
 const {d,mesh,scene}=fixture();const parent=d.createNode().setScale([2,2,2]).setTranslation([10,0,0]);
 parent.addChild(d.createNode().setMesh(mesh));scene.addChild(parent);scene.addChild(d.createNode().setMesh(mesh).setTranslation([-5,0,0]));
 d.createNode().setMesh(mesh).setTranslation([1000,1000,1000]);
 const r=inspectSceneBounds(d);assert.deepEqual(r.min,[-5,0,0]);assert.deepEqual(r.max,[14,2,0]);assert.equal(r.meshInstances,2);
 assert.equal(r.completeEnvelopeEstablished,true);assert.equal(r.runtimeAdmission,false);
});
test('Rotated vertex measurements preserve orientation rather than raw local accessor limits',()=>{
 const {d,mesh,scene}=fixture();scene.addChild(d.createNode().setMesh(mesh).setRotation([0,0,Math.SQRT1_2,Math.SQRT1_2]));
 const r=inspectSceneBounds(d);assert.ok(Math.abs(r.dimensionsMeters[0]-1)<1e-6);assert.ok(Math.abs(r.dimensionsMeters[1]-2)<1e-6);
});
test('Skin or animation geometry never becomes a complete measured envelope',()=>{
 const {d,mesh,scene}=fixture();scene.addChild(d.createNode().setMesh(mesh).setSkin(d.createSkin()));
 const r=inspectSceneBounds(d);assert.equal(r.skinnedInstances,1);assert.equal(r.completeEnvelopeEstablished,false);
 d.createAnimation();assert.equal(inspectSceneBounds(d).animations,1);
});
test('Missing default scene and non-finite world geometry fail closed',()=>{
 assert.throws(()=>inspectSceneBounds(new Document()));const {d,mesh,scene}=fixture();
 scene.addChild(d.createNode().setMesh(mesh).setTranslation([Infinity,0,0]));assert.throws(()=>inspectSceneBounds(d));
});
