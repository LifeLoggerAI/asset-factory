import assert from 'node:assert/strict';

// Deduplicate only byte-identical complete vertex records. No quantization,
// topology reordering, normal/tangent averaging or mesh simplification.
export function weldExactCorners(document) {
 let inputVertices=0,outputVertices=0;
 for(const mesh of document.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  if(primitive.getIndices())continue;
  assert.equal(primitive.getMode(),4,'Exact corner welding requires triangles');
  const semantics=primitive.listSemantics().sort();
  const bindings=semantics.map(s=>({owner:primitive,semantic:s,accessor:primitive.getAttribute(s)}));
  for(const target of primitive.listTargets())for(const s of target.listSemantics().sort())
   bindings.push({owner:target,semantic:s,accessor:target.getAttribute(s)});
  const count=primitive.getAttribute('POSITION').getCount();
  assert.equal(count%3,0);assert.ok(bindings.every(b=>b.accessor.getCount()===count));
  const unique=new Map(),representatives=[],indices=[];
  for(let i=0;i<count;i++){
   const key=bindings.map(({accessor:a})=>{const array=a.getArray(),size=a.getElementSize(),bytes=Buffer.from(array.buffer,array.byteOffset+i*size*array.BYTES_PER_ELEMENT,size*array.BYTES_PER_ELEMENT);return bytes.toString('hex');}).join(':');
   if(!unique.has(key)){unique.set(key,representatives.length);representatives.push(i);}
   indices.push(unique.get(key));
  }
  for(const b of bindings){const a=b.accessor,array=a.getArray(),size=a.getElementSize(),out=new array.constructor(representatives.length*size);
   for(let i=0;i<representatives.length;i++)for(let k=0;k<size;k++)out[i*size+k]=array[representatives[i]*size+k];
   b.owner.setAttribute(b.semantic,a.clone().setArray(out));
  }
  const type=representatives.length<=65536?Uint16Array:Uint32Array;
  primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(new type(indices)).setBuffer(primitive.getAttribute('POSITION').getBuffer()));
  inputVertices+=count;outputVertices+=representatives.length;
 }
 let unusedAccessorsRemoved=0;
 for(const accessor of document.getRoot().listAccessors()){
  if(accessor.listParents().every(parent=>parent===document.getRoot())){accessor.dispose();unusedAccessorsRemoved++;}
 }
 return {inputVertices,outputVertices,unusedAccessorsRemoved,method:'EXACT_COMPLETE_CORNER_BYTES'};
}
