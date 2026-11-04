"""Reject inherited metallic water while retaining existing albedo/normal bytes."""
import importlib.util
import io
from pathlib import Path
import unittest
import numpy as np
from PIL import Image
class DielectricWaterTests(unittest.TestCase):
    def test_all_water_tiers_are_dielectric_with_declared_roughness(self):
        p=Path(__file__).resolve().parents[1]/'build/build_water_successor.py';s=importlib.util.spec_from_file_location('dielectric_water_tests',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
        for n in (128,256,512):
            with self.subTest(size=n):
                old=m.outdoor.outdoor_texture('water',n);new=m.water_texture('water',n)
                self.assertEqual(new[:2],old[:2]);pixels=np.asarray(Image.open(io.BytesIO(new[2])))
                self.assertTrue((pixels[:,:,2]==0).all());self.assertTrue((pixels[:,:,1]>=round(.42*255)).all())
                self.assertEqual(m.water_texture('grass',n),m.outdoor.outdoor_texture('grass',n))
if __name__=='__main__':unittest.main()
