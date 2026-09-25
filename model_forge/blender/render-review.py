#!/usr/bin/env python3
"""Render standardized literal-pixel candidate views inside Blender 4.x."""
from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path
try:
    import bpy
    from mathutils import Vector
except ImportError as exc:
    raise SystemExit("Run inside Blender") from exc

def args():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True)
    p.add_argument("--output-dir",required=True)
    p.add_argument("--resolution",type=int,default=1024)
    return p.parse_args(argv)

def meshes():
    return [o for o in bpy.context.scene.objects if o.type=="MESH"]

def bounds(objects):
    pts=[o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    mn=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))
    mx=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    return mn,mx,(mn+mx)*0.5,mx-mn

def look_at(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()

def add_area(name,location,energy,size,target):
    data=bpy.data.lights.new(name=name,type="AREA"); data.energy=energy; data.shape="DISK"; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=location; look_at(obj,target)

def main():
    a=args(); out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()))
    objs=meshes()
    if not objs: raise RuntimeError("candidate contains no meshes")
    mn,mx,center,dim=bounds(objs); radius=max(dim.length*0.55,0.5)
    world=bpy.context.scene.world or bpy.data.worlds.new("URAI Review World"); bpy.context.scene.world=world
    world.use_nodes=True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value=0.35
    bpy.ops.mesh.primitive_plane_add(size=max(radius*6,4), location=(center.x,center.y,mn.z-0.01))
    floor=bpy.context.object; floor.name="URAI_REVIEW_FLOOR"
    mat=bpy.data.materials.new("URAI_REVIEW_FLOOR_MAT"); mat.diffuse_color=(0.18,0.18,0.18,1); mat.roughness=0.8; floor.data.materials.append(mat)
    add_area("Key",(center.x+radius*2,center.y-radius*2,center.z+radius*2.3),1200,max(radius*1.4,2),center)
    add_area("Fill",(center.x-radius*2,center.y-radius,center.z+radius),650,max(radius*1.2,2),center)
    add_area("Rim",(center.x,center.y+radius*2,center.z+radius*2),900,max(radius,1.5),center)
    cam_data=bpy.data.cameras.new("URAI_REVIEW_CAMERA"); cam=bpy.data.objects.new("URAI_REVIEW_CAMERA",cam_data); bpy.context.collection.objects.link(cam)
    cam_data.lens=52; bpy.context.scene.camera=cam
    scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE_NEXT" if bpy.app.version >= (4, 2, 0) else "BLENDER_EEVEE"
    scene.render.resolution_x=a.resolution; scene.render.resolution_y=a.resolution; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    views={"front":(0,-1,0.35),"front-three-quarter":(0.8,-0.8,0.45),"side":(1,0,0.35),"back":(0,1,0.35)}
    for name,d in views.items():
        direction=Vector(d).normalized(); cam.location=center+direction*(radius*2.6); look_at(cam,center)
        scene.render.filepath=str(out/f"{name}.png"); bpy.ops.render.render(write_still=True)
    triangles=0
    for obj in objs:
        obj.data.calc_loop_triangles(); triangles+=len(obj.data.loop_triangles)
    receipt={"schemaVersion":"urai-model-review-render-v1","input":str(Path(a.input)),"bounds":{"min":list(mn),"max":list(mx),"dimensions":list(dim)},"meshes":len(objs),"materials":len({m.name for o in objs for m in o.data.materials if m}),"triangles":triangles,"views":[f"{k}.png" for k in views],"verdict":"review-required-not-production-authority"}
    (out/"review-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(receipt,indent=2))
if __name__=="__main__": main()
