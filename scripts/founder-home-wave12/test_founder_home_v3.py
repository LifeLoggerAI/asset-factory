#!/usr/bin/env python3
"""Actual V3 source / model / render / frozen-reconstruction acceptance tests.
These are modeled research tests only. Never assert final art acceptance.
"""
import unittest,json,hashlib,os
from pathlib import Path
import numpy as np,trimesh
root=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT',str(Path.cwd()/'artifacts'/'founder-home-study-v3')))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
class Wave13Verified(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.reg=json.loads((root/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v3_PUBLIC_SAFE.json').read_text())
  cls.file=root/'URAI_WORLD001_FOUNDER_HOME_ARCHITECTURE_v3.glb'
  cls.scene=trimesh.load(cls.file,force='scene')
  cls.rend=json.loads((root/'V3_RENDER_RECEIPT.json').read_text())
  cls.data=root/'modeled_acquisition_v3r2'
  cls.pre=json.loads((cls.data/'PREFLIGHT_W13_V3_RESULT.json').read_text())
  cls.eval=json.loads((cls.data/'MODELED_W13_V3_FRESH_HOLDOUT_RESULT.json').read_text())
 def test_one_glb(self):
  self.assertEqual(sha(self.file),self.reg['asset']['sha256']);self.assertEqual(self.rend['source_sha256'],sha(self.file))
  self.assertEqual(len(self.scene.graph.nodes_geometry),self.reg['asset']['nodes'])
  self.assertGreater(self.reg['asset']['nodes'],1000)
 def test_stable_landmark_roles(self):
  nodes=set(self.scene.graph.nodes_geometry)
  for prefix in ('tree.olive','architecture.door','gathering.rim','terrace.paver','architecture.left','landscape.ridge'):
   self.assertTrue(any(n.startswith(prefix) for n in nodes),prefix)
  self.assertEqual(self.reg['landmarks']['orb_anchor'],[.1,1.42,-1.9])
 def test_all_four_source_camera_render_hashes(self):
  self.assertEqual({v['view'] for v in self.rend['views']},{'H00','A01_LEFT','A02_RIGHT','A03_TREE'})
  for v in self.rend['views']:
   self.assertEqual(sha(root/v['file']),v['sha256'])
  self.assertTrue(self.rend['all_views_one_source'])
 def test_texture_bytes_owned_and_bound(self):
  self.assertEqual(len(self.reg['materials']['asset_files']),12)
  for x in self.reg['materials']['asset_files']:
   self.assertEqual(sha(root/'materials'/x['file']),x['sha256'])
  # Actual glTF mesh visuals retain UVs, not a flat PBR declaration.
  textured=sum(getattr(g.visual,'uv',None) is not None for g in self.scene.geometry.values())
  self.assertGreater(textured,200)
 def test_historical_holdout_preserved(self):
  self.assertEqual(self.reg['gates']['exposed_W12_H03'],'FAILED_UNCHANGED')
  self.assertFalse(self.reg['gates']['paid_compute_authorized'])
  self.assertFalse(self.reg['gates']['photoreal_material_acceptance'])
 def test_source_acquisition_exact_hash(self):
  self.assertEqual(self.pre['status'],'TRAIN_SOURCE_PACKET_FORMAT_VERIFIED_GEOMETRY_NOT_ACCEPTED')
  self.assertEqual(self.pre['source_files_sha_verified'],18)
  self.assertEqual(self.pre['frames_admitted'],0)
  self.assertFalse(self.pre['external_holdout_passed'])
 def test_original_v3_model_frozen_before_new_holdout(self):
  lock=json.loads((self.data/'FROZEN_EVALUATOR_BEFORE_HOLDOUT_V3.json').read_text())
  model=json.loads((self.data/'FROZEN_V3_TRAINING_MODEL_RECEIPT.json').read_text())
  self.assertEqual(sha(self.data/'FROZEN_W13_V3_MODEL.npz'),lock['model_sha256'])
  self.assertEqual(model['model_sha256'],lock['model_sha256'])
  self.assertEqual(lock['status'],'FROZEN_BEFORE_ANY_V3_TEST_IMAGES_RENDERED')
  self.assertFalse(model['holdout_images_opened'])
 def test_true_6_view_model_research_acceptance_only(self):
  self.assertEqual(self.eval['required_heldout_views'],6)
  self.assertEqual(self.eval['views_accounted_for'],6)
  self.assertEqual(self.eval['status'],'MODELED_SOURCE_IMAGE_FEATURE_SCREEN_PASS_RESEARCH_ONLY')
  for view in self.eval['results']:
   self.assertTrue(view['localized']);self.assertLessEqual(view['unfit_median_px'],4);self.assertLessEqual(view['unfit_p90_px'],8)
   self.assertFalse(view['training_or_test_data_leak_into_pose_fit'])
  self.assertFalse(self.eval['photoreal_home_accepted']);self.assertEqual(self.eval['admitted_training_frames'],0)
 def test_preflight_schema_adapter_provenance(self):
  a=json.loads((self.data/'MANIFEST_SEGMENT_SCHEMA_ADAPTER_RECEIPT.json').read_text())
  self.assertFalse(a['holdout_materialized']);self.assertEqual(a['unchanged_train_images_count'],18)
  self.assertEqual(a['new_manifest_sha256'],sha(self.data/'manifest_train.json'))
if __name__=='__main__':unittest.main(verbosity=2)
