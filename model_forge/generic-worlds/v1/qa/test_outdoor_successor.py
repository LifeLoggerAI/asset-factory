"""Regression gates for empty horizons, repeated texture stripes and nav drift."""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import numpy as np
from PIL import Image

class OutdoorSuccessorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p=Path(__file__).resolve().parents[1]/"build/build_outdoor_successor.py";s=importlib.util.spec_from_file_location('outdoor_tests',p);cls.m=importlib.util.module_from_spec(s);s.loader.exec_module(cls.m)
    def image(self,data):return np.asarray(Image.open(io.BytesIO(data)).convert('RGB'),dtype=float)
    def peak(self,data):
        a=self.image(data).mean(2);power=np.abs(np.fft.fft2(a-a.mean()))**2;return power.max()/power.sum()
    def test_dominant_stripe_energy_removed_at_all_device_tiers(self):
        for material in ('grass','water'):
            for n in (128,256,512):
                with self.subTest(material=material,size=n):
                    old=self.peak(self.m.original_texture(material,n)[0]);new=self.peak(self.m.outdoor_texture(material,n)[0])
                    self.assertLess(new,.04);self.assertLess(new,old*.20)
    def test_deterministic_albedo_pattern_shared_across_lods(self):
        for material in ('grass','water'):
            a=self.m.outdoor_texture(material,128);b=self.m.outdoor_texture(material,256)
            self.assertEqual(a,self.m.outdoor_texture(material,128))
            self.assertLess(np.abs(self.image(a[0])-self.image(b[0])[::2,::2]).mean(),1.0)
            self.assertTrue(all(self.image(data).shape==(128,128,3) for data in a))
    def test_scenery_preserves_collision_and_floor_authoring(self):
        for row in self.m.original.FAMILIES:
            if row[-1] not in self.m.KINDS:continue
            for profile in ('desktop','xr','mobile'):
                with self.subTest(id=row[0],profile=profile):
                    old,_=self.m.connected.connected_scene(row,profile);new=self.m.outdoor_scene(row,profile)
                    self.assertEqual(old.blocks,new.blocks);self.assertEqual(old.zones,new.zones)
                    old_glb=self.m.original.glb_bytes(self.m.original.collision_scene(old),True)[0]
                    new_glb=self.m.original.glb_bytes(self.m.original.collision_scene(new),True)[0]
                    self.assertEqual(old_glb,new_glb)
    def test_closed_horizon_has_stitched_unit_normals(self):
        for row in self.m.original.FAMILIES:
            if row[-1] not in self.m.KINDS:continue
            scene=self.m.outdoor_scene(row,'mobile');part=next(p for p in scene.parts if p[0]=='generic-distant-terrain');points,normals=part[2:4]
            self.assertTrue(np.isfinite(points).all());self.assertTrue(np.isfinite(normals).all());self.assertTrue(np.allclose(np.linalg.norm(normals,axis=1),1,atol=1e-6))
            for ring in range(9):
                first=ring*65;last=first+64;self.assertTrue(np.allclose(points[first],points[last],atol=1e-5));self.assertTrue(np.array_equal(normals[first],normals[last]))
            self.assertGreater(points[:,1].max(),10)
    def test_lake_replaces_old_surface_without_coplanar_duplicate(self):
        row=next(r for r in self.m.original.FAMILIES if r[-1]=='lake');scene=self.m.outdoor_scene(row,'desktop')
        self.assertFalse(any(p[0]=='lake-surface' for p in scene.parts));water=[p for p in scene.parts if p[0]=='expanded-generic-lake']
        self.assertEqual(len(water),1);self.assertEqual(len(water[0][2]),4);self.assertEqual(len(water[0][5]),2)
    def test_existing_version_history_is_write_once(self):
        with tempfile.TemporaryDirectory() as d:
            old=self.m.ROOT
            try:
                self.m.ROOT=Path(d);folder=Path(d)/'packages/gw-test/1.0.5';folder.mkdir(parents=True);p=folder/'retained';p.write_text('old bytes')
                with self.assertRaises(FileExistsError):self.m.build_successor(('gw-test','test',4,4,3,'street'))
                self.assertEqual(p.read_text(),'old bytes')
            finally:self.m.ROOT=old

if __name__=='__main__':unittest.main()
