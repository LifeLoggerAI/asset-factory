#!/usr/bin/env python3
"""URAI model cleanup and LOD export for Blender 4.x."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

try:
    import bpy
    import bmesh
    from mathutils import Vector
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
    parser.add_argument("--max-lod0-triangles", type=int, default=2_000_000)
    parser.add_argument("--material-profile", choices=("preserve", "natural"), default="natural")
    return parser.parse_args(argv)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def cleanup_mesh(obj):
    set_active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    loose_edges = [edge for edge in bm.edges if not edge.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    loose_verts = [vert for vert in bm.verts if not vert.link_edges and not vert.link_faces]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    set_active(obj)
    bpy.ops.object.material_slot_remove_unused()


def scene_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not points:
        raise RuntimeError("Model has zero bounds")
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    dimensions = maximum - minimum
    center = (minimum + maximum) * 0.5
    return minimum, maximum, center, dimensions


def normalize_scene(target_meters: float):
    objs = mesh_objects()
    if not objs:
        raise RuntimeError("No mesh objects after import")
    for obj in objs:
        cleanup_mesh(obj)
    bpy.context.view_layer.update()
    minimum, maximum, center, dimensions = scene_bounds(objs)
    longest = max(dimensions)
    if longest <= 0:
        raise RuntimeError("Model has zero bounds")
    scale = target_meters / longest
    for obj in objs:
        obj.scale *= scale
        set_active(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.update()
    minimum, maximum, center, dimensions_after_scale = scene_bounds(objs)
    offset = Vector((-center.x, -center.y, -minimum.z))
    for obj in objs:
        obj.location += offset
        set_active(obj)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.context.view_layer.update()
    _, _, _, normalized_dimensions = scene_bounds(objs)
    return objs, tuple(dimensions), scale, tuple(offset), tuple(normalized_dimensions)


def sanitize_natural_materials(objects):
    touched = 0
    missing_images = []
    seen_images = set()
    for obj in objects:
        for material in obj.data.materials:
            if material is None:
                continue
            if material.use_nodes and material.node_tree:
                principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
                if principled:
                    metallic = principled.inputs.get("Metallic")
                    roughness = principled.inputs.get("Roughness")
                    if metallic and not metallic.is_linked:
                        metallic.default_value = min(float(metallic.default_value), 0.05)
                    if roughness and not roughness.is_linked:
                        roughness.default_value = max(float(roughness.default_value), 0.58)
                    touched += 1
                for node in material.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and node.image:
                        image = node.image
                        if image.name in seen_images:
                            continue
                        seen_images.add(image.name)
                        filepath = bpy.path.abspath(image.filepath) if image.filepath else ""
                        if image.source == "FILE" and filepath and not Path(filepath).exists():
                            missing_images.append({"image": image.name, "filepath": filepath})
    if missing_images:
        raise RuntimeError(f"Missing material image files: {missing_images}")
    return {"principledMaterialsAdjusted": touched, "imagesChecked": len(seen_images), "missingImages": missing_images}


def duplicate_with_ratio(source_objects, ratio: float, suffix: str):
    duplicates = []
    for source in source_objects:
        dup = source.copy()
        dup.data = source.data.copy()
        dup.name = f"{source.name}_{suffix}"
        bpy.context.collection.objects.link(dup)
        duplicates.append(dup)
        if ratio < 0.999:
            modifier = dup.modifiers.new(name=f"URAI_{suffix}_Decimate", type="DECIMATE")
            modifier.ratio = max(0.02, min(1.0, ratio))
            modifier.use_collapse_triangulate = True
            set_active(dup)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
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
        export_yup=True,
    )


def triangle_count(objects):
    count = 0
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        count += len(mesh.loop_triangles)
    return count


def material_count(objects):
    return len({material.name for obj in objects for material in obj.data.materials if material})


def main():
    args = parse_args()
    if not math.isfinite(args.target_meters) or args.target_meters <= 0:
        raise SystemExit("--target-meters must be positive")
    if not (0.02 <= args.lod2_ratio < args.lod1_ratio <= 1.0):
        raise SystemExit("LOD ratios must satisfy 0.02 <= lod2 < lod1 <= 1.0")
    if args.max_lod0_triangles < 100:
        raise SystemExit("--max-lod0-triangles must be >= 100")

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    input_path = Path(args.input).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))

    base, original_dimensions, applied_scale, origin_offset, normalized_dimensions = normalize_scene(args.target_meters)
    material_receipt = sanitize_natural_materials(base) if args.material_profile == "natural" else {
        "principledMaterialsAdjusted": 0,
        "imagesChecked": 0,
        "missingImages": [],
    }
    source_triangles = triangle_count(base)
    if source_triangles > args.max_lod0_triangles:
        raise RuntimeError(f"LOD0 triangle count {source_triangles} exceeds budget {args.max_lod0_triangles}")

    lod0 = duplicate_with_ratio(base, 1.0, "LOD0")
    lod1 = duplicate_with_ratio(base, args.lod1_ratio, "LOD1")
    lod2 = duplicate_with_ratio(base, args.lod2_ratio, "LOD2")
    for obj in base:
        bpy.data.objects.remove(obj, do_unlink=True)

    outputs = {}
    previous_triangles = None
    for name, objects in (("lod0", lod0), ("lod1", lod1), ("lod2", lod2)):
        target = out / f"{name}.glb"
        triangles = triangle_count(objects)
        if previous_triangles is not None and triangles > previous_triangles:
            raise RuntimeError(f"{name} triangle count {triangles} exceeds preceding LOD {previous_triangles}")
        export_selected(objects, target)
        outputs[name] = {
            "file": target.name,
            "triangles": triangles,
            "bytes": target.stat().st_size,
            "sha256": sha256_file(target),
            "meshes": len(objects),
            "materials": material_count(objects),
        }
        previous_triangles = triangles

    receipt = {
        "schemaVersion": "urai-blender-cleanup-v2",
        "source": str(input_path),
        "sourceSha256": sha256_file(input_path),
        "targetMeters": args.target_meters,
        "originalBounds": original_dimensions,
        "normalizedBounds": normalized_dimensions,
        "appliedScale": applied_scale,
        "originOffset": origin_offset,
        "pivotPolicy": "xy-centered-z-grounded",
        "materialProfile": args.material_profile,
        "materialReceipt": material_receipt,
        "lodRatios": {"lod0": 1.0, "lod1": args.lod1_ratio, "lod2": args.lod2_ratio},
        "maxLod0Triangles": args.max_lod0_triangles,
        "outputs": outputs,
        "productionAuthority": False,
        "promotionAllowed": False,
        "nextRequired": [
            "standardized candidate review renders",
            "render in canonical scene",
            "literal desktop/phone/reduced-motion pixel review",
            "explicit approval",
            "governed promotion",
        ],
    }
    (out / "cleanup-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
