import assert from 'node:assert/strict';
import {snapshot} from './prepare-launch-assets.mjs';

export function normalizeSkinRoots(document) {
 const root=document.getRoot(),scene=root.getDefaultScene();assert.ok(scene);
 const members=new Set();scene.traverse(n=>members.add(n));
 const targeted=new Set(root.listAnimations().flatMap(a=>a.listChannels().map(c=>c.getTargetNode())));
 const worldBefore=root.listNodes().map(n=>n.getWorldMatrix());
 const preserved=snapshot(document);preserved.nodes.forEach(n=>delete n.children);
 const before=JSON.stringify(preserved);let changed=0;const plans=[];
 for(const node of root.listNodes()){
  if(!node.getSkin()||!node.getParentNode())continue;
  assert.ok(members.has(node),'Skinned mesh must belong to the bound default scene');
  assert.ok(!targeted.has(node),'Animated skin mesh transform needs separate authority');
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  assert.ok(node.getMatrix().every((n,i)=>Math.abs(n-identity[i])<1e-12),'Nonidentity mesh transform needs separate authority');
  let parent=node.getParentNode();
  while(parent){
   assert.ok(!targeted.has(parent),'Animated skin ancestor requires pose/clip authority');
   const m=parent.getMatrix(),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
   assert.ok(m.every((n,i)=>Math.abs(n-identity[i])<1e-12),'Nonidentity skin ancestor requires binding correction');
   parent=parent.getParentNode();
  }
  plans.push(node);
 }
 for(const node of plans){node.getParentNode().removeChild(node);scene.addChild(node);changed++;}
 assert.equal(JSON.stringify(root.listNodes().map(n=>n.getWorldMatrix())),JSON.stringify(worldBefore));
 const after=snapshot(document);after.nodes.forEach(n=>delete n.children);assert.equal(JSON.stringify(after),before);
 return {identityAncestorSkinMeshesPromoted:changed,worldMatricesExact:true,
  skinsWeightsJointsInverseBindMatricesAnimationsExact:true,fullPoseEnvelopeVerified:false,runtimeAdmission:false};
}
export function pruneUnusedMaterials(document){
 const root=document.getRoot();let removed=0;
 for(const material of root.listMaterials()){
  if(material.listParents().every(parent=>parent===root)){material.dispose();removed++;}
 }
 return {unusedMaterialsRemoved:removed,runtimeAdmission:false};
}
