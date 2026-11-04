"""Reject missing cells, drifted obstacles and incomplete collision faces."""
import copy
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import numpy as np
from audit_connected_world import bind_boxes, complete_grid, exported_boxes
from navigation_safety import floor_rectangles
from validate import InvalidAsset
from test_validation import pack_glb

def fixed_grid():
    nav = {"agent": {"radius": .45, "height": 1.7}, "cellSize": .2, "blockedVolumes": [], "floorSupportZones": [{"min": [-2, 0, -2], "max": [2, 0, 2]}], "walkablePolygons": []}
    for ix in range(-7, 8):
        for iz in range(-7, 8):
            x, z = ix*.2, iz*.2
            nav["walkablePolygons"].append({"id": f"{ix}:{iz}", "vertices": [[x+dx, 0, z+dz] for dx,dz in [(-.1,-.1),(-.1,.1),(.1,.1),(.1,-.1)]]})
    return nav

class CompleteGridTests(unittest.TestCase):
    def check(self, nav): return complete_grid(nav, floor_rectangles(nav["floorSupportZones"]), [{"min": [-2,-.06,-2], "max": [2,0,2]}])
    def test_independent_225_complete_cells(self):
        r = self.check(fixed_grid()); self.assertEqual(r["eligibleCells"],225); self.assertEqual(r["missingCells"],0); self.assertFalse(r["runtimeCollisionToleranceVerified"])
    def test_omitted_safe_sector_rejected(self):
        nav=fixed_grid(); nav["walkablePolygons"]=nav["walkablePolygons"][:-15]
        with self.assertRaises(InvalidAsset) as e:self.check(nav)
        self.assertEqual(e.exception.code,"CONNECTED_GRID_INCOMPLETE")
    def test_duplicate_cannot_replace_safe_cell(self):
        nav=fixed_grid();nav["walkablePolygons"][-1]=copy.deepcopy(nav["walkablePolygons"][0])
        with self.assertRaises(InvalidAsset) as e:self.check(nav)
        self.assertEqual(e.exception.code,"CONNECTED_GRID_DUPLICATE")
    def test_full_cell_over_edge_rejected(self):
        nav=fixed_grid();nav["walkablePolygons"].append({"id":"unsafe","vertices":[[1.5,0,-.1],[1.5,0,.1],[1.7,0,.1],[1.7,0,-.1]]})
        with self.assertRaises(InvalidAsset) as e:self.check(nav)
        self.assertEqual(e.exception.code,"CONNECTED_GRID_INCOMPLETE")
    def test_misalignment_rejected(self):
        nav=fixed_grid()
        for p in nav["walkablePolygons"][0]["vertices"]:p[0]+=.05
        with self.assertRaises(InvalidAsset) as e:self.check(nav)
        self.assertEqual(e.exception.code,"CONNECTED_GRID_ALIGNMENT")

class ExportedBoxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p=Path(__file__).resolve().parents[1]/"build/build_connected_successor.py";s=importlib.util.spec_from_file_location("exported_box_test_builder",p);cls.builder=importlib.util.module_from_spec(s);s.loader.exec_module(cls.builder)
    def exported(self,scene):return self.builder.original.glb_bytes(self.builder.original.collision_scene(scene),True)[0]
    def test_five_modified_worlds_bind_real_obstacle_triangles(self):
        for row in self.builder.original.FAMILIES:
            if row[-1] not in self.builder.CHANGED_KINDS:continue
            with self.subTest(id=row[0]),tempfile.TemporaryDirectory() as d:
                scene,_=self.builder.connected_scene(row,"desktop");p=Path(d)/"actual.glb";p.write_bytes(self.exported(scene));boxes,digest=exported_boxes(p);bind_boxes(boxes,{"blockedVolumes":scene.blocks,"floorSupportZones":scene.zones})
                self.assertEqual(len(boxes),len(scene.blocks)+len(scene.zones));self.assertEqual(len(digest),64)
    def test_obstacle_drift_rejected(self):
        nav=fixed_grid();nav["blockedVolumes"]=[{"min":[0,0,0],"max":[1,1,1]}]
        with self.assertRaises(InvalidAsset) as e:bind_boxes([{"min":[-2,-.06,-2],"max":[2,0,2]},{"min":[0,0,0],"max":[1.01,1,1]}],nav)
        self.assertEqual(e.exception.code,"EXPORTED_BLOCK_DRIFT")
    def test_missing_collision_face_rejected(self):
        scene=self.builder.original.Scene("incomplete-box");scene.block("cube",[0,1,0],[1,1,1]);data=self.exported(scene);n,_=struct.unpack_from("<II",data,12);doc=json.loads(data[20:20+n]);binary=bytearray(data[28+n:]);primitive=doc["meshes"][0]["primitives"][0];a=doc["accessors"][primitive["indices"]];v=doc["bufferViews"][a["bufferView"]];values=np.frombuffer(binary,dtype="<u4",count=a["count"],offset=v.get("byteOffset",0));values[3:6]=values[:3]
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"incomplete.glb";p.write_bytes(pack_glb(doc,bytes(binary)))
            with self.assertRaises(InvalidAsset) as e:exported_boxes(p)
            self.assertIn(e.exception.code,("EXPORTED_BOX_FACE_COVERAGE","EXPORTED_COLLISION_INVALID"))

if __name__=="__main__":unittest.main()
