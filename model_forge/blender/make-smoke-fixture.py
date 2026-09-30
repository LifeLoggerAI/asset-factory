#!/usr/bin/env python3
"""Create a deterministic non-production GLB fixture for Blender pipeline verification."""
from __future__ import annotations
import argparse
from pathlib import Path
import sys

try:
    import bpy
except ImportError as exc:
    raise SystemExit("Run inside Blender") from exc

def args():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    p=argparse.ArgumentParser()
    p.add_argument("--output",required=True)
    return p.parse_args(argv)

def main():
    a=args()
    out=Path(a.output).resolve()
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=0.9,location=(0,0,1.0))
    crown=bpy.context.object
    crown.name="smoke-organic-crown"
    crown.scale=(1.15,0.9,1.3)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=0.18,depth=2.0,location=(0,0,0.2))
    trunk=bpy.context.object
    trunk.name="smoke-trunk"
    mat=bpy.data.materials.new("smoke-natural-mat")
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(0.12,0.18,0.08,1)
    bsdf.inputs["Roughness"].default_value=0.82
    crown.data.materials.append(mat)
    trunk.data.materials.append(mat)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_apply=True,export_texcoords=True,export_normals=True,export_materials="EXPORT")
    print(out)

if __name__=="__main__":
    main()
