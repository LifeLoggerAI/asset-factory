"""Independent small GLB fixtures and deliberate corruption/rejection tests.

These tests do not use the production generator or reimplement its assertions.
They exercise malformed exported bytes, references, geometry, and navigation.
"""
from __future__ import annotations

import copy
import hashlib
from io import BytesIO
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

from validate import Validator, parse_glb
from validate_package import validate_package, validate_navigation, validate_kit
from run_all import run_all, select_manifests


def pack_glb(document: dict, binary: bytes, json_override: bytes | None = None) -> bytes:
    text = json_override if json_override is not None else json.dumps(document, separators=(",", ":"), allow_nan=False).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    body = struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(binary), 0x004E4942) + binary
    return struct.pack("<4sII", b"glTF", 2, len(body) + 12) + body


def independent_fixture() -> tuple[dict, bytearray]:
    binary = bytearray()
    views = []
    def append(payload: bytes, target: int | None = None) -> int:
        binary.extend(b"\0" * (-len(binary) % 4))
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(payload)}
        if target:
            view["target"] = target
        views.append(view)
        binary.extend(payload)
        return len(views) - 1
    position = append(np.array([[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], dtype="<f4").tobytes(), 34962)
    normal = append(np.array([[0, 1, 0]] * 4, dtype="<f4").tobytes(), 34962)
    uv = append(np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype="<f4").tobytes(), 34962)
    indices = append(np.array([0, 2, 1, 0, 3, 2], dtype="<u2").tobytes(), 34963)
    stream = BytesIO()
    image = Image.new("RGB", (2, 2), (90, 110, 140))
    image.putpixel((0, 0), (140, 110, 90))
    image.save(stream, format="PNG")
    texture = append(stream.getvalue())
    document = {
        "asset": {"version": "2.0", "generator": "independent QA fixture; never production content"},
        "buffers": [{"byteLength": len(binary)}], "bufferViews": views,
        "accessors": [
            {"bufferView": position, "componentType": 5126, "count": 4, "type": "VEC3", "min": [-1, 0, -1], "max": [1, 0, 1]},
            {"bufferView": normal, "componentType": 5126, "count": 4, "type": "VEC3"},
            {"bufferView": uv, "componentType": 5126, "count": 4, "type": "VEC2"},
            {"bufferView": indices, "componentType": 5123, "count": 6, "type": "SCALAR"},
        ],
        "images": [{"bufferView": texture, "mimeType": "image/png"}],
        "textures": [{"source": 0}],
        "materials": [{"name": "mat-test-wood", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": .7}}],
        "meshes": [{"name": "test-floor", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
        "nodes": [{"name": "test-floor-000", "mesh": 0}], "scenes": [{"nodes": [0]}], "scene": 0,
    }
    return document, binary


def independent_navigation() -> dict:
    return {"schemaVersion": "urai-generic-navigation-v1", "units": "meters",
            "agent": {"radius": .3, "height": 1.7, "minClearance": 1.2},
            "walkablePolygons": [{"id": "nav-room", "vertices": [[-2, 0, -2], [2, 0, -2], [2, 0, 2], [-2, 0, 2]]}],
            "blockedVolumes": [{"id": "obstacle-outside", "min": [3, 0, 3], "max": [4, 1, 4]}],
            "teleportZones": [{"id": "teleport-home", "position": [0, 0, 0], "radius": .65}],
            "entry": [0, 0, -1], "exit": [0, 0, 1],
            "navmeshStatus": "GENERATED_PLANAR_METADATA_NOT_RUNTIME_BAKED", "clearanceChecked": False}


class GLBRejectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.doc, self.binary = independent_fixture()

    def tearDown(self):
        self.temp.cleanup()

    def audit(self, payload: bytes | None = None, **kwargs) -> dict:
        file = self.directory / "fixture.glb"
        file.write_bytes(payload if payload is not None else pack_glb(self.doc, self.binary))
        return Validator(file, **kwargs).validate()

    def reject(self, expected: str, payload: bytes | None = None, **kwargs):
        report = self.audit(payload, **kwargs)
        self.assertFalse(report["passed"], report)
        self.assertIn(expected, [f["code"] for f in report["findings"]], report)

    def overwrite_floats(self, view: int, values: list[float]):
        offset = self.doc["bufferViews"][view]["byteOffset"]
        data = np.asarray(values, dtype="<f4").tobytes()
        self.binary[offset:offset + len(data)] = data

    def test_valid_embedded_textured_mesh(self):
        report = self.audit()
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["metrics"]["sceneTriangles"], 2)
        self.assertEqual(report["metrics"]["images"][0]["width"], 2)
        self.assertEqual(report["metrics"]["sceneBoundsMinMeters"], [-1., 0., -1.])
        self.assertEqual(report["evidenceBoundary"]["visualAcceptance"], "NOT_GRANTED")

    def test_bad_magic(self):
        data = bytearray(pack_glb(self.doc, self.binary))
        data[:4] = b"BAD!"
        self.reject("GLB_MAGIC", bytes(data))

    def test_declared_file_length(self):
        data = bytearray(pack_glb(self.doc, self.binary))
        struct.pack_into("<I", data, 8, len(data) + 4)
        self.reject("GLB_LENGTH", bytes(data))

    def test_chunk_alignment(self):
        data = bytearray(pack_glb(self.doc, self.binary))
        struct.pack_into("<I", data, 12, struct.unpack_from("<I", data, 12)[0] - 1)
        self.reject("CHUNK_ALIGNMENT", bytes(data))

    def test_duplicate_json_keys(self):
        self.reject("JSON_PARSE", pack_glb(self.doc, self.binary, b'{"asset":{"version":"2.0"},"asset":{"version":"2.0"}}'))

    def test_nonstandard_json_nan(self):
        self.reject("JSON_PARSE", pack_glb(self.doc, self.binary, b'{"asset":{"version":"2.0"},"extras":NaN}'))

    def test_buffer_view_overrun(self):
        self.doc["bufferViews"][0]["byteLength"] = len(self.binary) + 8
        self.reject("VIEW_BOUNDS")

    def test_accessor_overrun(self):
        self.doc["accessors"][0]["count"] = 100
        self.reject("ACCESSOR_BOUNDS")

    def test_allocation_bomb(self):
        self.doc["accessors"][0].pop("bufferView")
        self.doc["accessors"][0]["count"] = 2**32
        self.reject("ACCESSOR_DECODE_BUDGET")

    def test_accessor_alignment(self):
        self.doc["accessors"][0]["byteOffset"] = 1
        self.reject("ACCESSOR_ALIGNMENT")

    def test_stride_smaller_than_element(self):
        self.doc["bufferViews"][0]["byteStride"] = 4
        self.reject("ACCESSOR_STRIDE")

    def test_position_bounds_lie(self):
        self.doc["accessors"][0]["min"] = [-20, 0, -1]
        self.reject("ACCESSOR_MINMAX")

    def test_nan_binary_position(self):
        self.overwrite_floats(0, [float("nan")])
        self.reject("NONFINITE_ACCESSOR")

    def test_nonunit_normals(self):
        self.overwrite_floats(1, [0, .25, 0])
        self.reject("UNIT_NORMAL")

    def test_index_range(self):
        offset = self.doc["bufferViews"][3]["byteOffset"]
        struct.pack_into("<H", self.binary, offset, 99)
        self.reject("INDEX_RANGE")

    def test_signed_indices(self):
        self.doc["accessors"][3]["componentType"] = 5122
        self.reject("INDEX_TYPE")

    def test_degenerate_triangle(self):
        offset = self.doc["bufferViews"][3]["byteOffset"]
        struct.pack_into("<3H", self.binary, offset, 0, 0, 1)
        self.reject("DEGENERATE_TRIANGLE")

    def test_missing_uv_referenced_by_material(self):
        self.doc["meshes"][0]["primitives"][0]["attributes"].pop("TEXCOORD_0")
        self.reject("UV_MISSING")

    def test_collapsed_uvs(self):
        self.overwrite_floats(2, [0.] * 8)
        self.reject("UV_COLLAPSED")

    def test_material_reference(self):
        self.doc["meshes"][0]["primitives"][0]["material"] = 2
        self.reject("REFERENCE")

    def test_corrupt_png(self):
        offset = self.doc["bufferViews"][4]["byteOffset"]
        self.binary[offset] = 0
        self.reject("IMAGE_DECODE")

    def test_texture_dimension_budget(self):
        self.reject("TEXTURE_BUDGET", max_texture_size=1)

    def test_texture_memory_budget(self):
        self.reject("TEXTURE_MEMORY_BUDGET", max_texture_memory=4)

    def test_embedded_mime_mismatch(self):
        self.doc["images"][0]["mimeType"] = "image/jpeg"
        self.reject("IMAGE_MIME")

    def test_external_image_dependency(self):
        self.doc["images"][0]["uri"] = "../../../unsafe.png"
        self.reject("EXTERNAL_DEPENDENCY")

    def test_unsupported_required_compression(self):
        self.doc["extensionsUsed"] = self.doc["extensionsRequired"] = ["KHR_draco_mesh_compression"]
        self.reject("UNSUPPORTED_REQUIRED_EXTENSION")

    def test_cycle_even_outside_selected_scene(self):
        self.doc["nodes"] += [{"name": "cycle-a", "children": [2]}, {"name": "cycle-b", "children": [1]}]
        self.reject("NODE_CYCLE")

    def test_quaternion_not_unit(self):
        self.doc["nodes"][0]["rotation"] = [0, 0, 0, 2]
        self.reject("QUATERNION")

    def test_matrix_and_trs(self):
        self.doc["nodes"][0]["matrix"] = np.eye(4).flatten(order="F").tolist()
        self.doc["nodes"][0]["translation"] = [0, 0, 0]
        self.reject("TRANSFORM")

    def test_scale_profile(self):
        self.doc["nodes"][0]["scale"] = [1000, 1, 1]
        self.reject("SCALE_BOUNDS")

    def test_origin_distance(self):
        self.doc["nodes"][0]["translation"] = [6000, 0, 0]
        self.reject("ORIGIN_DISTANCE")

    def test_instancing_budget_is_not_unique_mesh_budget(self):
        self.doc["nodes"].append({"name": "second-floor", "mesh": 0, "translation": [4, 0, 0]})
        self.doc["scenes"][0]["nodes"].append(1)
        self.reject("TRIANGLE_BUDGET", max_triangles=3)
        report = self.audit(max_triangles=4)
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["metrics"]["uniqueMeshTriangles"], 2)
        self.assertEqual(report["metrics"]["sceneTriangles"], 4)
        self.assertEqual(report["metrics"]["sceneBoundsMaxMeters"][0], 5)

    def test_collision_can_omit_visual_attributes(self):
        attrs = self.doc["meshes"][0]["primitives"][0]["attributes"]
        attrs.pop("NORMAL")
        attrs.pop("TEXCOORD_0")
        self.doc["meshes"][0]["primitives"][0].pop("material")
        report = self.audit(kind="collision")
        self.assertTrue(report["passed"], report)
        self.reject("NORMAL_MISSING", kind="render")

    def test_cli_nonzero_and_machine_report(self):
        self.doc["accessors"][0]["count"] = 100
        file, destination = self.directory / "bad.glb", self.directory / "report.json"
        file.write_bytes(pack_glb(self.doc, self.binary))
        process = subprocess.run([sys.executable, str(Path(__file__).with_name("validate.py")), str(file), "--report", str(destination)], capture_output=True, text=True)
        self.assertEqual(process.returncode, 1, process.stderr)
        report = json.loads(destination.read_text())
        self.assertFalse(report["passed"])
        self.assertEqual(report, json.loads(process.stdout))


class PackageNavigationTests(unittest.TestCase):
    def test_valid_planar_metadata_does_not_claim_runtime(self):
        report = validate_navigation(independent_navigation())
        self.assertTrue(report["passed"])
        self.assertEqual(report["runtimeMovement"], "NOT_VERIFIED")

    def test_agent_expanded_obstacle_rejects_cell(self):
        nav = independent_navigation()
        nav["blockedVolumes"][0]["min"] = [2.1, 0, 0]
        nav["blockedVolumes"][0]["max"] = [3, 1, 1]
        with self.assertRaisesRegex(Exception, "") as caught:
            validate_navigation(nav)
        self.assertEqual(caught.exception.code, "NAV_OBSTACLE_INTERSECTION")

    def test_floor_obstacle_does_not_block_navigation(self):
        nav = independent_navigation()
        nav["blockedVolumes"][0]["min"] = [-3, -.2, -3]
        nav["blockedVolumes"][0]["max"] = [3, 0, 3]
        self.assertTrue(validate_navigation(nav)["passed"])

    def test_outside_teleport_landing(self):
        nav = independent_navigation()
        nav["teleportZones"][0]["position"] = [4, 0, 0]
        with self.assertRaises(Exception) as caught:
            validate_navigation(nav)
        self.assertEqual(caught.exception.code, "NAV_LANDING_OUTSIDE")

    def test_bow_tie_polygon(self):
        nav = independent_navigation()
        nav["walkablePolygons"][0]["vertices"] = [[-1, 0, -1], [1, 0, 1], [-1, 0, 1], [1, 0, -1]]
        with self.assertRaises(Exception) as caught:
            validate_navigation(nav)
        self.assertIn(caught.exception.code, {"NAV_CONVEXITY", "NAV_SELF_INTERSECTION"})

    def test_nonplanar_navigation(self):
        nav = independent_navigation()
        nav["walkablePolygons"][0]["vertices"][0][1] = .5
        with self.assertRaises(Exception) as caught:
            validate_navigation(nav)
        self.assertEqual(caught.exception.code, "NAV_NOT_PLANAR")

    def make_package(self, directory: Path) -> Path:
        doc, binary = independent_fixture()
        glb = pack_glb(doc, binary)
        artifacts = {"lod0.glb": (glb, "geometry"), "lod1.glb": (glb, "geometry"), "lod2.glb": (glb, "geometry"),
                     "collision.glb": (glb, "collision"), "navigation.json": (json.dumps(independent_navigation()).encode(), "navigation")}
        files = []
        for path, (data, role) in artifacts.items():
            (directory / path).write_bytes(data)
            files.append({"path": path, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "role": role})
        manifest = {"schemaVersion": "urai-generic-world-package-v1", "id": "gw-independent-test", "version": "1.0.0",
                    "truthClassification": "GENERIC", "units": "meters",
                    "axes": {"handedness": "right", "up": "+Y", "front": "+Z", "cameraForward": "-Z"},
                    "profiles": {k: {"lod": v} for k, v in (("desktop", "lod0.glb"), ("xr", "lod1.glb"), ("mobile", "lod2.glb"))},
                    "sourceSpec": {"repository": "qa-fixture", "path": "fixture.json", "sha256": "0" * 64},
                    "files": files, "runtimeIntegrated": False, "visualAccepted": False}
        file = directory / "package.json"
        file.write_text(json.dumps(manifest))
        return file

    def test_dependency_hashes_and_navigation(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest = self.make_package(Path(temp))
            report = validate_package(manifest)
            self.assertTrue(report["passed"], report)
            self.assertEqual(len(report["verifiedFiles"]), 5)
            self.assertIn("DUPLICATE_DEPENDENCY_HASH", [f["code"] for f in report["findings"]])

    def test_hash_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            manifest = self.make_package(directory)
            (directory / "lod0.glb").write_bytes(b"replaced")
            report = validate_package(manifest)
            self.assertFalse(report["passed"])
            self.assertIn("DEPENDENCY_HASH_MISMATCH", [f["code"] for f in report["findings"]])

    def test_dependency_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest = self.make_package(Path(temp))
            data = json.loads(manifest.read_text())
            data["files"][0]["path"] = "../../outside.glb"
            manifest.write_text(json.dumps(data))
            report = validate_package(manifest)
            self.assertFalse(report["passed"])
            self.assertIn("DEPENDENCY_ESCAPE", [f["code"] for f in report["findings"]])

    def test_inflated_acceptance_state_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest = self.make_package(Path(temp))
            data = json.loads(manifest.read_text())
            data["visualAccepted"] = True
            manifest.write_text(json.dumps(data))
            report = validate_package(manifest)
            self.assertFalse(report["passed"])
            self.assertIn("ACCEPTANCE_BOUNDARY", [f["code"] for f in report["findings"]])

    def test_missing_source_hash_does_not_hide_navigation_errors(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest = self.make_package(Path(temp))
            data = json.loads(manifest.read_text())
            data["sourceSpec"]["sha256"] = None
            nav = independent_navigation()
            nav["teleportZones"] = []
            encoded = json.dumps(nav).encode()
            (Path(temp) / "navigation.json").write_bytes(encoded)
            for record in data["files"]:
                if record["path"] == "navigation.json":
                    record["sha256"], record["bytes"] = hashlib.sha256(encoded).hexdigest(), len(encoded)
            manifest.write_text(json.dumps(data))
            report = validate_package(manifest)
            codes = {f["code"] for f in report["findings"]}
            self.assertFalse(report["passed"])
            self.assertTrue({"SOURCE_SPEC", "TELEPORT_EMPTY"} <= codes, report)

    def test_latest_version_excludes_known_bad_prior_export(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            old, new = base / "1.0.0", base / "1.0.1"
            old.mkdir()
            new.mkdir()
            self.make_package(old)
            manifest = self.make_package(new)
            metadata = json.loads(manifest.read_text())
            metadata["version"] = "1.0.1"
            manifest.write_text(json.dumps(metadata))
            (old / "lod0.glb").write_bytes(b"deliberately invalid old export")
            report = run_all(base)
            self.assertTrue(report["passed"], report)
            self.assertEqual(report["packageCount"], 1)
            self.assertEqual(report["packages"][0]["version"], "1.0.1")
            self.assertEqual(len(report["excludedPriorVersions"]), 1)
            self.assertFalse(run_all(base, "1.0.0")["passed"])

    def test_versions_are_sorted_numerically(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            for version in ("1.0.9", "1.0.10"):
                folder = base / version
                folder.mkdir()
                file = self.make_package(folder)
                metadata = json.loads(file.read_text())
                metadata["version"] = version
                file.write_text(json.dumps(metadata))
            selected, excluded = select_manifests(base, None)
            self.assertEqual(selected[0][1]["version"], "1.0.10")
            self.assertEqual(excluded[0]["version"], "1.0.9")

    def test_kit_uses_per_element_boundary_without_scene_nav(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            package = self.make_package(base)
            metadata = json.loads(package.read_text())
            kit = {"schemaVersion": "urai-generic-kit-v1", "id": "kit-test-chair", "version": "1.0.1",
                   "truthClassification": "GENERIC", "files": metadata["files"][:3],
                   "profiles": metadata["profiles"], "runtimeIntegrated": False, "visualAccepted": False,
                   "provenance": {"source": "Independent QA test fixture", "license": "TEST_FIXTURE_ONLY", "sourceAssets": []}}
            package.write_text(json.dumps(kit))
            report = validate_kit(package)
            self.assertTrue(report["passed"], report)
            self.assertEqual(report["evidenceBoundary"]["collisionNavigation"], "COMPOSED_SCENE_RESPONSIBILITY")
            batch = run_all(base)
            self.assertTrue(batch["passed"], batch)
            self.assertEqual(batch["packageCount"], 0)
            self.assertEqual(batch["kitCount"], 1)


if __name__ == "__main__":
    unittest.main()
