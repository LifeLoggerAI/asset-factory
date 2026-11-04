"""Complete real-scene grids, collision floors and history rejection."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from navigation_safety import audit_navigation, collision_floors, floor_rectangles

class ConnectedSuccessorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p = Path(__file__).resolve().parents[1] / "build/build_connected_successor.py"
        s = importlib.util.spec_from_file_location("connected_test_builder", p); cls.module = importlib.util.module_from_spec(s); s.loader.exec_module(cls.module)
    def test_fifteen_actual_source_scenes_keep_all_cells_connected(self):
        for row in self.module.original.FAMILIES + self.module.original.BATCH2:
            with self.subTest(id=row[0]):
                scene, _ = self.module.connected_scene(row, "desktop"); nav = self.module.connected_navigation(scene, row); r = audit_navigation(nav, scene.zones)
                self.assertTrue(r["passed"]); self.assertTrue(r["connectivity"]["allCellsConnectedToEntry"])
                self.assertEqual(len(r["connectivity"]["reachableCellIds"]), len(nav["walkablePolygons"]))
                self.assertTrue(nav["allStandingCellsRetained"]); self.assertFalse(nav["walkAcceptanceAllowed"])
                self.assertEqual(nav["agent"]["radius"], .45); self.assertEqual(nav["agent"]["minClearance"], .9)
                self.assertTrue(all(t["radius"] == .75 for t in nav["teleportZones"]))
    def test_changed_collision_floor_triangles_match_actual_source(self):
        for row in self.module.original.FAMILIES:
            if row[-1] not in self.module.CHANGED_KINDS: continue
            with self.subTest(id=row[0]), tempfile.TemporaryDirectory() as d:
                scene, _ = self.module.connected_scene(row, "desktop"); data, _ = self.module.original.glb_bytes(self.module.original.collision_scene(scene), True)
                p = Path(d)/"collision.glb"; p.write_bytes(data); actual, _ = collision_floors(p, 0)
                self.assertEqual(sorted(floor_rectangles(actual)), sorted(floor_rectangles(scene.zones)))
    def test_disconnected_sector_rejected_instead_of_pruned(self):
        scene = self.module.original.Scene("gw-islands"); scene.zones = [{"min": [-4, 0, -2], "max": [-1, 0, 2]}, {"min": [1, 0, -2], "max": [4, 0, 2]}]
        with self.assertRaisesRegex(ValueError, "not hidden"): self.module.connected_navigation(scene, (scene.id, "test", 8, 4, 3, "living"))
    def test_crossing_real_geometry_and_uninterrupted_curbs(self):
        row = next(r for r in self.module.original.FAMILIES if r[-1] == "street"); scene, changes = self.module.connected_scene(row, "mobile")
        self.assertTrue(any(z["id"] == "pedestrian-crossing" for z in scene.zones)); self.assertTrue(any(p[0] == "raised-pedestrian-crossing" for p in scene.parts))
        for p in scene.parts:
            if p[0] == "curb-segment": self.assertTrue(p[2][:, 2].max() <= -1.1 + 1e-5 or p[2][:, 2].min() >= 1.1 - 1e-5)
        self.assertFalse(changes[0]["trafficSafetyAndRuntimeAdmission"])
    def test_existing_version_history_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            previous = self.module.ROOT
            try:
                self.module.ROOT = Path(d); folder = Path(d)/"packages/gw-test/1.0.4"; folder.mkdir(parents=True); p = folder/"retained"; p.write_text("old bytes")
                with self.assertRaises(FileExistsError): self.module.build_successor(("gw-test", "test", 4, 4, 3, "living"))
                self.assertEqual(p.read_text(), "old bytes")
            finally: self.module.ROOT = previous

if __name__ == "__main__": unittest.main()
