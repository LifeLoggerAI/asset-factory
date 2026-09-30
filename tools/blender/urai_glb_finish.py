"""URAI deterministic Blender finishing pass.

Usage:
  blender --background --python tools/blender/urai_glb_finish.py -- input.glb output.glb

This is intentionally conservative: it normalizes scene units/transforms, removes
empty material slots, recalculates mesh normals, and exports GLB. It does not
invent geometry, decimate identity-sensitive scans, or mark an asset canonical.
"""

from __future__ import annotations

import json
import os
import sys

import bpy
import bmesh


def args_after_separator() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def import_asset(path: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise RuntimeError(f"Unsupported input format: {ext}")


def normalize_meshes() -> dict[str, int]:
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    meshes = 0
    vertices = 0
    triangles = 0
    material_slots = 0

    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        meshes += 1
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()

        for index in reversed(range(len(obj.material_slots))):
            if obj.material_slots[index].material is None:
                obj.active_material_index = index
                bpy.ops.object.material_slot_remove()

        vertices += len(mesh.vertices)
        triangles += sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons)
        material_slots += len(obj.material_slots)
        obj.select_set(False)

    if meshes == 0:
        raise RuntimeError("No mesh objects found in input asset")

    return {
        "meshObjects": meshes,
        "vertices": vertices,
        "triangles": triangles,
        "materialSlots": material_slots,
    }


def export_glb(path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )


def main() -> None:
    args = args_after_separator()
    if len(args) != 2:
        raise SystemExit("Expected: input.(glb|gltf|obj|fbx) output.glb")
    source, destination = map(os.path.abspath, args)
    if not os.path.isfile(source):
        raise SystemExit(f"Input not found: {source}")
    if os.path.splitext(destination)[1].lower() != ".glb":
        raise SystemExit("Output must use .glb")

    reset_scene()
    import_asset(source)
    stats = normalize_meshes()
    export_glb(destination)

    receipt = {
        "tool": "urai_glb_finish",
        "source": source,
        "output": destination,
        "sourceTypePreserved": True,
        "canonicalPromotion": False,
        **stats,
    }
    receipt_path = destination + ".finish-receipt.json"
    with open(receipt_path, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
