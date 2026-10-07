import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {inspectSceneBounds} from './scene-bounds.mjs';
import {snapshot} from './prepare-launch-assets.mjs';

const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const finitePositive=n=>Number.isFinite(n)&&n>0;

function pointBounds(node) {
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],m=node.getWorldMatrix();
 for(const p of node.getMesh()?.listPrimitives()??[]){
  const position=p.getAttribute('POSITION');assert.ok(position?.getArray(),'Decoded positions required');
  for(let i=0;i<position.getCount();i++){const [x,y,z]=position.getElement(i,[]);
   const v=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
   assert.ok(v.every(Number.isFinite));v.forEach((n,i)=>{min[i]=Math.min(min[i],n);max[i]=Math.max(max[i],n);});
  }
 }
 return {min,max};
}
function recomputeNormals(primitive){
 const a=primitive.getAttribute('POSITION').getArray(),n=new Float32Array(a.length),indices=primitive.getIndices()?.getArray();
 const count=indices?.length??a.length/3;assert.equal(count%3,0);
 for(let i=0;i<count;i+=3){
  const ids=[indices?.[i]??i,indices?.[i+1]??i+1,indices?.[i+2]??i+2];
  assert.ok(ids.every(x=>Number.isInteger(x)&&x>=0&&x<a.length/3));
  const [u,v,w]=ids.map(x=>x*3),ax=a[v]-a[u],ay=a[v+1]-a[u+1],az=a[v+2]-a[u+2],bx=a[w]-a[u],by=a[w+1]-a[u+1],bz=a[w+2]-a[u+2];
  const c=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];
  assert.ok(Math.hypot(...c)>1e-12,'Degenerate floor triangle');
  for(const id of ids)for(let k=0;k<3;k++)n[id*3+k]+=c[k];
 }
 for(let i=0;i<n.length;i+=3){const length=Math.hypot(n[i],n[i+1],n[i+2]);assert.ok(length>1e-12);for(let k=0;k<3;k++)n[i+k]/=length;}
 const prior=primitive.getAttribute('NORMAL');assert.ok(prior&&prior.getType()==='VEC3','Normal binding required');
 primitive.setAttribute('NORMAL',prior.clone().setArray(n));
}
export async function prepareFloorFootprint(bytes,{sourceSha256,floorNodeName,widthMeters,depthMeters}){
 assert.equal(digest(bytes),sourceSha256,'Exact source hash required');
 assert.ok(typeof floorNodeName==='string'&&floorNodeName.length);
 assert.ok(finitePositive(widthMeters)&&finitePositive(depthMeters));
 const document=await io.readBinary(bytes),root=document.getRoot(),scene=root.getDefaultScene();
 assert.ok(scene,'Default scene required');
 const matches=root.listNodes().filter(n=>n.getName()===floorNodeName);
 assert.equal(matches.length,1,'Exactly one named floor required');
 const floor=matches[0],mesh=floor.getMesh();assert.ok(mesh);
 assert.equal(root.listNodes().filter(n=>n.getMesh()===mesh).length,1,'Shared floor mesh needs separate authority');
 assert.ok(!floor.getSkin()&&mesh.listPrimitives().every(p=>p.listTargets().length===0));
 assert.ok(root.listAnimations().every(a=>a.listChannels().every(c=>c.getTargetNode()!==floor)),
   'Animated floor transform needs explicit collision successor');
 const m=floor.getWorldMatrix(),expected=[1,0,0,0,0,1,0,0,0,0,1,0];
 assert.ok(expected.every((n,i)=>Math.abs(m[i]-n)<1e-10),'Only unscaled axis-aligned floor supported');
 const before=pointBounds(floor),width=before.max[0]-before.min[0],depth=before.max[2]-before.min[2];
 assert.ok(widthMeters<=width&&depthMeters<=depth,'Floor-only correction cannot enlarge footprint');
 const center=[(before.min[0]+before.max[0])/2,(before.min[2]+before.max[2])/2];
 const box={min:[center[0]-widthMeters/2,center[1]-depthMeters/2],max:[center[0]+widthMeters/2,center[1]+depthMeters/2]};
 let containedMeshInstances=0;
 scene.traverse(node=>{
  if(!node.getMesh()||node===floor)return;
  const b=pointBounds(node);
  assert.ok(b.min[0]>=box.min[0]-1e-6&&b.max[0]<=box.max[0]+1e-6&&b.min[2]>=box.min[1]-1e-6&&b.max[2]<=box.max[1]+1e-6,
    'Authored static content would extend beyond corrected floor');
  containedMeshInstances++;
 });
 const changedPrimitives=mesh.listPrimitives().length;
 const protectedSnapshot=doc=>{const s=snapshot(doc),r=doc.getRoot();
  const floorMesh=r.listNodes().find(n=>n.getName()===floorNodeName).getMesh();
  s.meshes[r.listMeshes().indexOf(floorMesh)].forEach(p=>{delete p.attributes.POSITION;delete p.attributes.NORMAL;});
  s.animationBindings=r.listAnimations().map(a=>a.listChannels().map(c=>({node:r.listNodes().indexOf(c.getTargetNode()),path:c.getTargetPath(),sampler:a.listSamplers().indexOf(c.getSampler())})));
  return s;};
 const protectedBefore=JSON.stringify(protectedSnapshot(document));
 const sourceNodeMatrices=root.listNodes().map(n=>n.getMatrix());
 for(const p of mesh.listPrimitives()){
  assert.equal(p.getMode(),4,'Triangle floor required');assert.ok(!p.getAttribute('TANGENT'),'Floor tangent recipe required');
  const prior=p.getAttribute('POSITION');assert.equal(prior.getType(),'VEC3');
  assert.ok(prior.getComponentType()===5126&&!prior.getNormalized(),'Floor POSITION rewrite requires unnormalized float data');
  const normal=p.getAttribute('NORMAL');
  assert.ok(normal?.getComponentType()===5126&&!normal.getNormalized(),'Floor NORMAL rewrite requires unnormalized float data');
  const a=prior.getArray().slice(),cx=center[0]-m[12],cz=center[1]-m[14];
  for(let i=0;i<a.length;i+=3){a[i]=cx+(a[i]-cx)*widthMeters/width;a[i+2]=cz+(a[i+2]-cz)*depthMeters/depth;}
  p.setAttribute('POSITION',prior.clone().setArray(a));recomputeNormals(p);
 }
 assert.deepEqual(root.listNodes().map(n=>n.getMatrix()),sourceNodeMatrices);
 assert.equal(JSON.stringify(protectedSnapshot(document)),protectedBefore);
 const output=await io.writeBinary(document),again=await io.writeBinary(document);assert.equal(digest(output),digest(again));
 assert.equal(JSON.stringify(protectedSnapshot(await io.readBinary(output))),protectedBefore);
 return {bytes:output,receipt:{classification:'FLOOR_ONLY_SUCCESSOR_NOT_ADMITTED',sourceSha256,outputSha256:digest(output),
  floorNodeName,widthMeters,depthMeters,changedPrimitives,containedMeshInstances,
  originalFloorBounds:before,outputFloorBounds:pointBounds(floor),staticSceneBounds:inspectSceneBounds(document),
  preserved:'All node transforms, skeletons, animations, materials, UV/index data and non-floor geometry',
  changed:'Only named floor POSITION X/Z and area-weighted normals',
  fullAnimatedEnvelopeEstablished:false,collisionNavigationVerified:false,physicalClearanceVerified:false,
  artApproval:false,runtimeAdmission:false,repeatedOutputHashExact:true}};
}
