#!/usr/bin/env python3
"""URAI model cleanup and LOD export for Blender 4.x."""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import sys

try:
    import bpy
    import bmesh
except ImportError as exc:
    raise SystemExit("This script must run inside Blender") from exc


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--target-meters", type=float, default=2.0)
    parser.add_argument("--lod1-ratio", type=float, default=0.55)
    parser.add_argument("--lod2-ratio", type=float, default=0.25)
    return parser.parse_args(argv)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def cleanup_mesh(obj):
    set_active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    loose_edges = [e for e in bm.edges if not e.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def normalize_scene(target_meters: float):
    objs = mesh_objects()
    if not objs:
        raise RuntimeError("No mesh objects after import")
    for obj in objs:
        cleanup_mesh(obj)
    bpy.context.view_layer.update()
    xs, ys, zs = [], [], []
    for obj in objs:
        for corner in obj.bound_box:
            world = obj.matrix_world @ __import__('mathutils').Vector(corner)
            xs.append(world.x); ys.append(world.y); zs.append(world.z)
    dimensions = (max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
    longest = max(dimensions)
    if longest <= 0:
        raise RuntimeError("Model has zero bounds")
    scale = target_meters / longest
    for obj in objs:
        obj.scale *= scale
        set_active(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    return objs, dimensions, scale


def duplicate_with_ratio(source_objects, ratio: float, suffix: str):
    duplicates = []
    for source in source_objects:
        dup = source.copy()
        dup.data = source.data.copy()
        dup.name = f"{source.name}_{suffix}"
        bpy.context.collection.objects.link(dup)
        duplicates.append(dup)
        if ratio < 0.999:
            mod = dup.modifiers.new(name=f"URAI_{suffix}_Decimate", type="DECIMATE")
            mod.ratio = max(0.02, min(1.0, ratio))
            set_active(dup)
            bpy.ops.object.modifier_apply(modifier=mod.name)
    return duplicates


def export_selected(objects, filepath: Path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )


def triangle_count(objects):
    count = 0
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        count += len(mesh.loop_triangles)
    return count


def main():
    args = parse_args()
    if not math.isfinite(args.target_meters) or args.target_meters <= 0:
        raise SystemExit("--target-meters must be positive")
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    base, original_dimensions, applied_scale = normalize_scene(args.target_meters)
    lod0 = duplicate_with_ratio(base, 1.0, "LOD0")
    lod1 = duplicate_with_ratio(base, args.lod1_ratio, "LOD1")
    lod2 = duplicate_with_ratio(base, args.lod2_ratio, "LOD2")
    for obj in base:
        bpy.data.objects.remove(obj, do_unlink=True)
    outputs = {}
    for name, objects in (("lod0", lod0), ("lod1", lod1), ("lod2", lod2)):
        target = out / f"{name}.glb"
        export_selected(objects, target)
        outputs[name] = {"file": target.name, "triangles": triangle_count(objects), "bytes": target.stat().st_size}
    receipt = {
        "schemaVersion": "urai-blender-cleanup-v1",
        "source": str(Path(args.input)),
        "targetMeters": args.target_meters,
        "originalBounds": original_dimensions,
        "appliedScale": applied_scale,
        "outputs": outputs,
        "productionAuthority": False,
        "promotionAllowed": False,
        "nextRequired": ["render in canonical scene", "literal pixel review", "explicit approval", "governed promotion"],
    }
    (out / "cleanup-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
