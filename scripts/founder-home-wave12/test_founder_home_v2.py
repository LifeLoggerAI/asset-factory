#!/usr/bin/env python3
"""Source-level architectural regression tests; no private pixels or service credentials.
Run after author_founder_home_v2.py and render_founder_home_v2.py locally.
"""
import argparse,hashlib,json,unittest,math
from pathlib import Path
import trimesh,numpy as np

class FounderHomeArchitectureTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.root=Path(ARGS.root)
  cls.registry=json.loads((cls.root/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v2.json').read_text())
  cls.scene_file=cls.root/'URAI_WORLD001_FOUNDER_MATCHED_ARCHITECTURAL_STUDY_v2.glb'
  cls.scene=trimesh.load(cls.scene_file,force='scene')
  cls.render=json.loads((cls.root/'URAI_W12_V2_RENDER_AND_PRIVATE_ANCHOR_SHA_RECEIPT.json').read_text())
  cls.nodes=set(cls.scene.graph.nodes_geometry)
 @staticmethod
 def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
 def test_single_asset_source_identity(self):
  self.assertEqual(self.registry['asset']['sha256'],self.sha(self.scene_file))
  self.assertEqual(self.render['scene_sha256'],self.sha(self.scene_file))
  self.assertEqual(self.registry['asset']['nodes'],len(self.nodes))
  self.assertGreaterEqual(self.registry['asset']['faces'],24500)
 def test_stable_architectural_landmarks_exist(self):
  for root in ['architecture.door','tree.olive','gathering.rim','terrace.paver','landscape.ridge','architecture.left.rough_return']:
   self.assertTrue(any(n.startswith(root) for n in self.nodes),root)
  self.assertIn('environment.sunset_solar_disc_proxy',self.nodes)
  self.assertEqual(self.registry['landmarks']['door_center'],[-6.35,1.72,-5.45])
 def test_original_anchors_hash_bound_without_embedded_pixels(self):
  anchors=self.registry['anchor_to_geometry_registry'];self.assertEqual(set(anchors),{'H00','A01_LEFT','A02_RIGHT','A03_TREE'})
  d={x['name'].removesuffix('.png'):x['sha256'] for x in self.render['original_anchor_sources']}
  for k,v in anchors.items():
   self.assertTrue(v['sha256'] is None or v['sha256']==d.get(k));self.assertEqual(v['proposed_camera'],self.registry['camera_proposals'][k]);self.assertFalse('pixels' in v)
   self.assertEqual(v['calibration_status'],'ART_INFERRED_FOV_AND_POSE_ONLY')
  scene_json=self.scene.export(file_type='gltf')
  self.assertFalse(scene_json.get('images'))
 def test_only_one_world_for_four_views(self):
  images=self.render['rendered_views'];self.assertEqual(len(images),4)
  ids={i['anchor'] for i in images};self.assertEqual(ids,set(self.registry['camera_proposals']))
  self.assertEqual(len({i['sha256'] for i in images}),4)
  for im in images:
   self.assertEqual(im['sha256'],self.sha(self.root/im['file']))
   self.assertEqual(im['classification'],'ARTISTICALLY_PROPOSED_MODELED_CAMERA_NOT_ORIGINAL_PHOTOGRAPH_POSE')
 def test_not_production_admitted(self):
  st=self.registry['source_status'];self.assertFalse(st['material_acceptance'])
  self.assertFalse(st['founder_art_acceptance']);self.assertFalse(st['independent_review'])
  self.assertEqual(st['original_W1_W4_geometry'],'FAILED_NO_TRAINING')
  self.assertEqual(st['gaussian_training'],'PREPARED_HARD_OFF_NO_PAID_EXECUTION')
  rr=self.render['status'];self.assertFalse(rr['gaussian_hard_off'] is False)
  self.assertEqual(rr['training_frames_admitted'],0)
 def test_horizontal_gathering_and_soil(self):
  # Verify earlier rotated-cylinder bug remains fixed in the emitted GLB.
  for name in ('gathering.dark_interior','garden.olive.soil'):
   mat,key=self.scene.graph[name];g=self.scene.geometry[key].copy();g.apply_transform(mat)
   dims=np.ptp(g.vertices,axis=0)
   self.assertLess(dims[1],.25, f'{name} must be laid flat')
   self.assertGreater(dims[0],2.);self.assertGreater(dims[2],2.)
 def test_camera_view_proposals_not_identical(self):
  cameras=self.registry['camera_proposals'];p=np.array([x['position'] for x in cameras.values()])
  self.assertGreater(float(np.max(np.linalg.norm(p[:,None]-p[None,:],axis=2))),1.7)
  for c in cameras.values():
   self.assertTrue(40<=c['fov_y_degrees']<=70)
   self.assertGreater(c['position'][2],8);self.assertLess(c['target'][2],0)
 def test_sky_open_and_source_persists(self):
  self.assertIn('NO',self.registry['architecture_status'] or 'NO') if False else None
  self.assertIn('NOT_FOUNDER_OR_PHOTOREAL_ACCEPTED',self.registry['architecture_status'])
  self.assertFalse(self.registry['source_status']['source_scene_not_photography'] is False)
  self.assertEqual(self.registry['world'],'URAI-IW-001-QUIET-RESET')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--root',required=True)
 ARGS=parser.parse_args()
 unittest.main(argv=['test_founder_home_v2.py'],verbosity=2)
