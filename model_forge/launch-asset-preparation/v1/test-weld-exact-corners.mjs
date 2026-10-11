import test from 'node:test';import assert from 'node:assert/strict';import {Document} from '@gltf-transform/core';import {weldExactCorners} from './weld-exact-corners.mjs';
function fixture(differ=false){
 const d=new Document(),b=d.createBuffer(),a=(type,array)=>d.createAccessor().setType(type).setArray(array).setBuffer(b);
 const pos=new Float32Array([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1,0,0]);
 const tang=new Float32Array(Array(6).fill([1,0,0,1]).flat());if(differ)tang[12]=-1;
 const p=d.createPrimitive().setAttribute('POSITION',a('VEC3',pos)).setAttribute('TANGENT',a('VEC4',tang));d.createMesh().addPrimitive(p);return {d,p,pos,tang};
}
test('Identical corners weld while preserving exact face-order stream and tangent seams',()=>{
 for(const differ of [false,true]){const {d,p,pos,tang}=fixture(differ),r=weldExactCorners(d),ix=p.getIndices().getArray();
 assert.equal(r.outputVertices,differ?4:3);
 for(let i=0;i<6;i++){for(let k=0;k<3;k++)assert.equal(p.getAttribute('POSITION').getArray()[ix[i]*3+k],pos[i*3+k]);for(let k=0;k<4;k++)assert.equal(p.getAttribute('TANGENT').getArray()[ix[i]*4+k],tang[i*4+k]);}
 assert.equal(r.unusedAccessorsRemoved,2);
 }
});
