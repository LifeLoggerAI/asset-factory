import assert from 'node:assert/strict';

// Static default-scene geometry only; animation, morph and skin envelopes need
// their own pose/clip sampling and cannot be approved from accessor bounds.
export function inspectSceneBounds(document) {
  const root=document.getRoot(), scene=root.getDefaultScene();
  assert.ok(scene,'A bound default scene is required');
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  let vertices=0, meshInstances=0, skinnedInstances=0, morphInstances=0;
  scene.traverse(node=>{
    const mesh=node.getMesh();if(!mesh)return;
    meshInstances++;
    if(node.getSkin())skinnedInstances++;
    const matrix=node.getWorldMatrix();
    assert.ok(matrix.every(Number.isFinite),'Non-finite world transform');
    for(const primitive of mesh.listPrimitives()){
      if(primitive.listTargets().length)morphInstances++;
      const positions=primitive.getAttribute('POSITION');
      assert.ok(positions&&positions.getType()==='VEC3','Finite VEC3 positions required');
      const array=positions.getArray();assert.ok(array,'Decoded positions required');
      // getArray() retains encoded integers for normalized quantized attributes.
      // The logical accessor element is what the renderer transforms.
      for(let i=0;i<positions.getCount();i++){
        const [x,y,z]=positions.getElement(i,[]);
        const p=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
          matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
          matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
        assert.ok(p.every(Number.isFinite),'Non-finite transformed position');
        for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}
        vertices++;
      }
    }
  });
  assert.ok(vertices,'Default scene has no measured vertices');
  const animations=root.listAnimations().length;
  return {scope:'STATIC_DEFAULT_SCENE_TRANSFORMED_VERTEX_POSITIONS',min,max,
    dimensionsMeters:max.map((n,i)=>n-min[i]),vertices,meshInstances,
    skinnedInstances,morphInstances,animations,
    completeEnvelopeEstablished:skinnedInstances===0&&morphInstances===0&&animations===0,
    animationSkinMorphEnvelopeEstablished:false,runtimeAdmission:false};
}
