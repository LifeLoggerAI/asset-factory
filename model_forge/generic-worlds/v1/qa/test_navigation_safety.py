"""Independent adversarial floor coverage and connectivity examples."""
import copy
import importlib.util
import math
from pathlib import Path
import tempfile
import unittest

from navigation_safety import (audit_navigation, cell_connectivity, collision_floors,
                               cylinder_clear, disk_supported, floor_rectangles)
from validate import InvalidAsset
from test_validation import independent_navigation, independent_fixture, pack_glb


def zone(x0, x1, z0, z1, y=0):
    return {"id": "floor", "min": [x0, y, z0], "max": [x1, y, z1]}


class DiskSupportTests(unittest.TestCase):
    def supported(self, zones, position=(0, 0, 0), radius=.65):
        return disk_supported(position, radius, floor_rectangles(zones))

    def test_complete_flat_floor(self):
        self.assertTrue(self.supported([zone(-2, 2, -2, 2)]))

    def test_center_supported_but_disk_over_edge(self):
        self.assertFalse(self.supported([zone(-2, .6, -2, 2)]))

    def test_narrow_notch_between_sample_angles(self):
        # A .002-wide notch is invisible to ordinary sparse perimeter samples.
        rectangles = [zone(-2, .101, -2, 2), zone(.103, 2, -2, 2), zone(.101, .103, -2, .63)]
        self.assertFalse(self.supported(rectangles))

    def test_hole_inside_disk_with_supported_perimeter(self):
        rectangles = [zone(-2, -.05, -2, 2), zone(.05, 2, -2, 2),
                      zone(-.05, .05, -2, -.05), zone(-.05, .05, .05, 2)]
        self.assertFalse(self.supported(rectangles))

    def test_adjacent_floor_rectangles_jointly_support_disk(self):
        self.assertTrue(self.supported([zone(-2, 0, -2, 2), zone(0, 2, -2, 2)]))

    def test_diagonal_touch_is_not_floor_support(self):
        self.assertFalse(self.supported([zone(-2, 0, -2, 0), zone(0, 2, 0, 2)]))

    def test_different_floor_height_does_not_fill_hole(self):
        self.assertFalse(self.supported([zone(-2, 0, -2, 2), zone(0, 2, -2, 2, .01)]))

    def test_exact_tangent_boundary(self):
        self.assertTrue(self.supported([zone(-.65, .65, -.65, .65)]))

    def test_nonfinite_radius_and_center_rejected(self):
        floors = floor_rectangles([zone(-2, 2, -2, 2)])
        for radius in [0, -1, math.nan, math.inf]:
            self.assertFalse(disk_supported((0, 0, 0), radius, floors))
        self.assertFalse(disk_supported((math.inf, 0, 0), .65, floors))

    def test_reject_invalid_floor_geometry(self):
        for floor in [zone(0, 0, -1, 1), {"min": [-1, 0, -1], "max": [1, 1, 1]}]:
            with self.assertRaises(InvalidAsset): floor_rectangles([floor])


class CylinderTests(unittest.TestCase):
    def test_obstacle_intersects_outer_disk_only(self):
        block = {"min": [.6, 0, -.1], "max": [1, 1, .1]}
        self.assertFalse(cylinder_clear([0, 0, 0], .65, 1.7, [block]))

    def test_overhead_collision_blocks_landing(self):
        block = {"min": [-1, 1.6, -1], "max": [1, 1.8, 1]}
        self.assertFalse(cylinder_clear([0, 0, 0], .65, 1.7, [block]))

    def test_high_ceiling_and_floor_are_clear(self):
        blocks = [{"min": [-1, -.06, -1], "max": [1, 0, 1]},
                  {"min": [-1, 2, -1], "max": [1, 2.2, 1]}]
        self.assertTrue(cylinder_clear([0, 0, 0], .65, 1.7, blocks))


class ConnectivityTests(unittest.TestCase):
    def cells(self, rectangles):
        nav = independent_navigation(); nav["entry"] = [0, 0, 0]; nav["exit"] = [0, 0, 0]
        nav["walkablePolygons"] = [{"id": str(i), "vertices": [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]]}
                                  for i, (x0, x1, z0, z1) in enumerate(rectangles)]
        return nav

    def test_shared_edge_connects(self):
        result = cell_connectivity(self.cells([(-1, 1, -1, 1), (1, 3, -1, 1)]))
        self.assertTrue(result["allCellsConnectedToEntry"])

    def test_corner_touch_does_not_connect(self):
        result = cell_connectivity(self.cells([(-1, 1, -1, 1), (1, 3, 1, 3)]))
        self.assertEqual(result["unreachableCellIds"], ["1"])

    def test_small_real_gap_does_not_connect(self):
        result = cell_connectivity(self.cells([(-1, 1, -1, 1), (1.01, 3, -1, 1)]))
        self.assertFalse(result["allCellsConnectedToEntry"])

    def test_disconnected_teleport_target_rejected(self):
        nav = self.cells([(-1, 1, -1, 1), (2, 4, -1, 1)])
        nav["teleportZones"][0]["position"] = [3, 0, 0]
        result = audit_navigation(nav, [zone(-1, 1, -1, 1), zone(2, 4, -1, 1)])
        self.assertFalse(result["passed"])
        self.assertIn("LANDING_UNREACHABLE", [f["code"] for f in result["failures"]])

    def test_disconnected_sector_explicitly_blocks_walk_acceptance(self):
        nav = self.cells([(-1, 1, -1, 1), (2, 4, -1, 1)])
        result = audit_navigation(nav, [zone(-1, 1, -1, 1), zone(2, 4, -1, 1)])
        self.assertTrue(result["passed"])
        self.assertFalse(result["walkAcceptanceAllowed"])
        self.assertTrue(any("Disconnected" in v for v in result["walkAcceptanceBlockers"]))

    def test_floor_disk_failure_not_accepted_by_center_only_legacy_check(self):
        nav = independent_navigation();nav["teleportZones"][0]["position"] = [1.8, 0, 0]
        result = audit_navigation(nav, [zone(-2, 2, -2, 2)])
        self.assertFalse(result["passed"])
        self.assertIn("LANDING_DISK_UNSUPPORTED", [f["code"] for f in result["failures"]])


class ActualCollisionTests(unittest.TestCase):
    def test_read_actual_floor_triangles(self):
        doc, binary = independent_fixture()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "collision.glb";path.write_bytes(pack_glb(doc, binary))
            floors, digest = collision_floors(path, 0)
        self.assertEqual(floors[0]["min"], [-1, 0, -1])
        self.assertEqual(floors[0]["max"], [1, 0, 1])
        self.assertEqual(len(digest), 64)

    def test_transformed_collision_rejected_without_baked_coordinate_proof(self):
        doc, binary = independent_fixture();doc["nodes"][0]["translation"] = [1, 0, 0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "collision.glb";path.write_bytes(pack_glb(doc, binary))
            with self.assertRaises(InvalidAsset) as error: collision_floors(path, 0)
        self.assertEqual(error.exception.code, "COLLISION_TRANSFORM")

    def test_floor_height_change_rejected(self):
        doc, binary = independent_fixture()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "collision.glb";path.write_bytes(pack_glb(doc, binary))
            with self.assertRaises(InvalidAsset) as error: collision_floors(path, .01)
        self.assertEqual(error.exception.code, "COLLISION_FLOOR_PROFILE")

    def test_unreferenced_scene_node_does_not_supply_floor_or_block_transform_audit(self):
        doc, binary = independent_fixture()
        doc["nodes"].append({"mesh": 0, "translation": [20, 0, 0]})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "collision.glb";path.write_bytes(pack_glb(doc, binary))
            floors, _ = collision_floors(path, 0)
        self.assertEqual(len(floors), 1)
        self.assertEqual(floors[0]["max"], [1, 0, 1])


class SuccessorRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / "build/build_navigation_successor.py"
        spec = importlib.util.spec_from_file_location("navigation_successor", path)
        cls.successor = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.successor)

    def test_real_street_and_backyard_disk_support_repairs(self):
        for kind in ["street", "backyard"]:
            row = next(r for r in self.successor.original.FAMILIES if r[-1] == kind)
            scene = self.successor.original.create_family(*row, "desktop")
            original = self.successor.original.navigation(scene, row[2], row[3], kind)
            predecessor_audit = audit_navigation(original, scene.zones)
            self.assertFalse(predecessor_audit["passed"])
            self.assertEqual(len([f for f in predecessor_audit["failures"] if f["code"] == "LANDING_DISK_UNSUPPORTED"]), 3)
            nav = self.successor.safe_navigation(scene, row[2], row[3], kind)
            checked = audit_navigation(nav, scene.zones)
            self.assertTrue(checked["passed"])
            self.assertFalse(nav["walkAcceptanceAllowed"])
            self.assertEqual(len(nav["teleportZones"]), 3)

    def test_successor_existing_version_is_write_once(self):
        with tempfile.TemporaryDirectory() as directory:
            original_root = self.successor.ROOT
            try:
                self.successor.ROOT = Path(directory)
                target = Path(directory) / "packages/gw-test/1.0.3";target.mkdir(parents=True)
                sentinel = target / "history.txt";sentinel.write_bytes(b"retained history")
                with self.assertRaises(FileExistsError):
                    self.successor.build_successor(("gw-test", "test", 4, 4, 3, "living"))
                self.assertEqual(sentinel.read_bytes(), b"retained history")
                self.assertEqual(list(target.iterdir()), [sentinel])
            finally:
                self.successor.ROOT = original_root


if __name__ == "__main__": unittest.main()
