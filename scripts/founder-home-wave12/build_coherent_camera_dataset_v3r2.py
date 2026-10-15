#!/usr/bin/env python3
"""Actual GLB-byte-bound train camera acquisition from one frozen modeled sanctuary.
Research classification only. Never admits source frames or executes paid training.
Generate train only first; reserve a separate test session to be rendered after model freeze.
"""
from pathlib import Path
import hashlib,importlib.util,json,math,os,shutil,sys
import cv2
import numpy as np
import trimesh,vtk
from vtk.util import numpy_support

ROOT=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT',str(Path.cwd()/'artifacts'/'founder-home-study-v3')))
OUT=ROOT/'modeled_acquisition_v3r2'
MODEL=ROOT/'URAI_WORLD001_FOUNDER_HOME_ARCHITECTURE_v3.glb'
SOURCE_REGISTRY=ROOT/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v3_PUBLIC_SAFE.json'
W,H=1280,720
FOV=54.
F=H/(2*math.tan(math.radians(FOV)/2))
W4_LOCK=Path(os.environ.get('URAI_OWNER_PRIVATE_W4_LOCK', 'OWNER_PRIVATE_W4_LOCK_NOT_CONFIGURED.json'))
TRAIN_POS=[(-2.80,2.68,10.05),(-2.45,2.64,9.95),(-2.10,2.57,9.84),(-1.72,2.59,9.80),
            (-1.34,2.63,9.79),(-.96,2.57,9.72),(-.60,2.61,9.67),(-.20,2.65,9.64),
            (.20,2.59,9.69),(.60,2.55,9.72),(1.00,2.61,9.70),(1.36,2.68,9.73),
            (1.74,2.64,9.81),(2.12,2.61,9.92),(2.48,2.64,10.01),(2.84,2.63,10.07),
            (3.14,2.74,10.13),(3.42,2.68,10.20)]
TEST_POS=[(-2.30,2.82,10.43),(-1.18,2.76,10.21),(-.02,2.83,10.19),
          (1.12,2.75,10.31),(2.28,2.88,10.40),(3.25,2.83,10.59)]
TARGET=np.array([-.4,2.4,-5.65])

sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()

def save(p,data):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')

def look_at(pos):
 c=np.array(pos,float)
 f=TARGET-c;f=f/np.linalg.norm(f)
 u=np.array([0.,1.,0.]);right=np.cross(f,u);right/=np.linalg.norm(right)
 down=np.cross(f,right);down/=np.linalg.norm(down)
 r=np.column_stack([right,down,f]);assert np.linalg.det(r)>.999
 m=np.eye(4);m[:3,:3]=r;m[:3,3]=c
 return m.tolist()

def project(pt,pose):
 m=np.asarray(pose,float)
 q=m[:3,:3].T@(np.asarray(pt)-m[:3,3]);
 if q[2]<=.1:return None
 return [float(W/2+F*q[0]/q[2]),float(H/2+F*q[1]/q[2])]

def vtk_locator(scene):
 full=scene.to_geometry()
 poly=vtk.vtkPolyData()
 pts=vtk.vtkPoints();pts.SetData(numpy_support.numpy_to_vtk(np.asarray(full.vertices,dtype=np.float64),deep=True));poly.SetPoints(pts)
 fs=np.column_stack([np.full(len(full.faces),3,dtype=np.int64),full.faces.astype(np.int64)])
 cells=vtk.vtkCellArray();cells.SetCells(len(fs),numpy_support.numpy_to_vtkIdTypeArray(fs.ravel(),deep=True));poly.SetPolys(cells)
 tree=vtk.vtkOBBTree();tree.SetDataSet(poly);tree.BuildLocator()
 return tree

def visible(tree,eye,pt):
 eye=np.array(eye);pt=np.array(pt)
 ray=pt-eye;norm=np.linalg.norm(ray)
 if norm<1e-5:return False
 end=pt+.02*ray/norm
 pts=vtk.vtkPoints();ids=vtk.vtkIdList()
 if tree.IntersectWithLine(eye.tolist(),end.tolist(),pts,ids)==0 or pts.GetNumberOfPoints()==0:return False
 return np.linalg.norm(np.array(pts.GetPoint(0))-pt)<=.10

def source_anchors(scene):
 allowed=('terrace.paver.','architecture.door.step.','gathering.rim.stone.','architecture.left.rough_return')
 # These are actual top-face centroids, not typed coordinates or image recognition output.
 candidates=[]
 for node in sorted(scene.graph.nodes_geometry):
  if not node.startswith(allowed):continue
  trans,key=scene.graph[node]
  geom=scene.geometry[key].copy();geom.apply_transform(trans)
  xyz=geom.triangles_center;normals=geom.face_normals
  for i in range(len(xyz)):
   pt=xyz[i];normal=normals[i]
   if pt[1]<0.035 and node.startswith('terrace.paver.'):continue
   if not(-3.2<pt[0]<4.4 and -2.5<pt[2]<4.0):continue
   candidates.append((node,np.asarray(pt,dtype=float)))
 loc=vtk_locator(scene)
 camera_poses=[look_at(x) for x in TRAIN_POS]
 scored=[]
 for node,pt in candidates:
  valid=True
  for eye,pose in zip(TRAIN_POS,camera_poses):
   uv=project(pt,pose)
   if uv is None or not(35<uv[0]<W-35 and 35<uv[1]<H-35):valid=False;break
   if not visible(loc,eye,pt):valid=False;break
  if valid:scored.append((node,pt))
 print('anchor candidates',len(candidates),'all-view truly visible',len(scored),flush=True)
 if len(scored)<12:raise RuntimeError('INSUFFICIENT_ACTUAL_VISIBLE_STATIC_ANCHORS')
 # Greedy spread anchors over actual independent paving stones.
 out=[];used=set()
 for i in range(12):
  viable=[(n,pt) for n,pt in scored if n not in used]
  if not viable:raise RuntimeError('NEED_DISTINCT_ARCHITECTURE_NODES')
  if not out:
   choice=min(viable,key=lambda z:abs(z[1][0])+.6*abs(z[1][2]-1.0))
  else:
   choice=max(viable,key=lambda z:min(np.linalg.norm((z[1]-q[1])*[1.3,0.8,1.3]) for q in out))
  out.append(choice);used.add(choice[0])
 return {f'ARCH_{i:02d}':{'node':n,'class':'STATIC_ARCHITECTURE','xyz_m':pt.tolist()}
         for i,(n,pt) in enumerate(out)}

def render(poses,split,scene):
 render_module=Path(__file__).with_name('render_founder_home_v3.py')
 modspec=importlib.util.spec_from_file_location('urai_renderer',render_module)
 mod=importlib.util.module_from_spec(modspec);modspec.loader.exec_module(mod)
 ren,win,texture_readers,count=mod.renderer(scene)
 cam=ren.GetActiveCamera();cam.SetViewAngle(FOV);cam.SetViewUp(0,1,0)
 out=[]
 for i,pos in enumerate(poses):
  cam.SetPosition(*pos);cam.SetFocalPoint(*TARGET);ren.ResetCameraClippingRange();win.Render()
  png=OUT/split/f'{split.upper()}_{i:02d}.png';png.parent.mkdir(parents=True,exist_ok=True)
  filt=vtk.vtkWindowToImageFilter();filt.SetInput(win);filt.SetInputBufferTypeToRGB();filt.ReadFrontBufferOff();filt.Update()
  writer=vtk.vtkPNGWriter();writer.SetInputConnection(filt.GetOutputPort());writer.SetFileName(str(png));writer.Write()
  out.append({'id':('T' if split=='train' else 'H')+f'{i:02d}',
     'session_id':'MODELED_W13_V3_TRAIN' if split=='train' else 'MODELED_W13_V3_FUTURE_HELDOUT',
     'split':split,'file':f'{split}/{png.name}','sha256':sha(png),
     'frame_index':i,'width':W,'height':H,'calibration_id':'W13_V3_KNOWN_MODEL_CAMERA',
     'camera_to_world_m':look_at(pos)})
  print('render',split,i,png.stat().st_size,flush=True)
 win.Finalize();return out

def initialize_train():
 if OUT.exists():raise RuntimeError('NO_OVERWRITE_FROZEN_ACQUISITION_ROOT')
 OUT.mkdir(parents=True)
 (OUT/'source').mkdir();shutil.copy2(MODEL,OUT/'source/URAI_W12_ARCHITECTURE_v2.glb')
 root_scene=trimesh.load(MODEL,force='scene')
 an=source_anchors(root_scene)
 scene_hash=sha(MODEL)
 save(OUT/'evidence/scene_inventory.json',{'source_sha256':scene_hash,'source_glb':MODEL.name,'nodes':len(root_scene.graph.nodes_geometry),'faces':sum(len(g.faces) for g in root_scene.geometry.values()),'truth':'FIXED_MODELED_INTERPRETIVE_SOURCE_NOT_PHOTOGRAPH','approved_photoreal':False})
 save(OUT/'evidence/camera_calibration.json',{'source':scene_hash,'camera_model':'KNOWN_RENDERER_PINHOLE','fx':F,'fy':F,'cx':W/2,'cy':H/2,'fov_y':FOV,'up_world':[0,1,0],'forward_convention':'positive camera Z; world forward toward negative world Z','physical_camera_calibration':False})
 save(OUT/'evidence/model_scale_reference.json',{'source_sha256':scene_hash,'model_unit':'authored_designated_meter_not_physical_measurement','reference_a':TRAIN_POS[0],'reference_b':TRAIN_POS[-1], 'known_distance_m':float(np.linalg.norm(np.array(TRAIN_POS[0])-TRAIN_POS[-1])), 'photographic_metric_certified':False})
 save(OUT/'evidence/architectural_points.json',an)
 annsha=sha(OUT/'evidence/architectural_points.json')
 for x in an.values():x['annotation_authority_file']='evidence/architectural_points.json';x['annotation_authority_sha256']=annsha
 frames=render(TRAIN_POS,'train',root_scene)
 for x in frames:
  x['observed_static_anchors']={k:project(anc['xyz_m'],x['camera_to_world_m']) for k,anc in an.items()}
 protocol={'schema':'urai-founder-home-v3r2-future-holdout-protocol-1',
   'world':'URAI-IW-001-QUIET-RESET','scene_sha256':scene_hash,
   'truth':'MODELED_INTERPRETIVE_SOURCE_NOT_PHYSICAL_CAPTURE','train_sha256':{v['id']:v['sha256'] for v in frames},
   'training_positions':TRAIN_POS,'evaluation_positions':TEST_POS,
   'evaluation_camera_images_materialized':False,
   'evaluation_separate_session':'MODELED_W13_V3_FUTURE_HELDOUT',
   'all_views_required':True,'median_limit_px':4.,'p90_limit_px':8.,
   'gaussian_training_permitted':False,'frames_admitted':0,'original_W1_W4_preserved':True}
 save(OUT/'FROZEN_PROTOCOL_BEFORE_MODEL_FIT.json',protocol)
 original=json.loads(W4_LOCK.read_text())
 # Strict source-byte preflight is importable from canonical Jobs W9 working implementation.
 manifest={'schema':'urai-world001-source-correction-1','world':'URAI-IW-001-QUIET-RESET',
    'truth_class':'INTERPRETIVE_NOT_AUTOBIOGRAPHICAL',
    'original_evidence':original,'original_media_unchanged':True,
    'frozen_acceptance':{'heldout_median_unfitted_reproj_px':4.,'heldout_p90_unfitted_reproj_px':8.,'require_every_withheld_view':True,'reject_any_failing_view':True},
    'paid_compute_authorized':False,'gaussian_training_permitted':False,
    'scene_authority':{'kind':'CONTROLLED_RENDER_FIXED_SCENE','source_truth':'DECLARED_RENDER_NOT_PHOTOGRAPH',
      'approved_design_reference':'W13 V3 coherent authored founder-aligned architecture CANDIDATE, founder visual and photoreal NOT APPROVED',
      'file':'source/URAI_W12_ARCHITECTURE_v2.glb','asset_sha256':scene_hash},
    'metric_scale':{'known_distance_m':float(np.linalg.norm(np.array(TRAIN_POS[0])-TRAIN_POS[-1])),'units':'meters','evidence_file':'evidence/model_scale_reference.json','independent_evidence_sha256':sha(OUT/'evidence/model_scale_reference.json')},
    'calibrations':{'W13_V3_KNOWN_MODEL_CAMERA':{'model':'PINHOLE','fx':F,'fy':F,'cx':W/2,'cy':H/2,'width':W,'height':H,
      'distortion_status':'CALIBRATED_ZERO_OR_RECTIFIED','evidence_method':'known_scene_render_camera',
      'source_evidence_file':'evidence/camera_calibration.json','source_evidence_sha256':sha(OUT/'evidence/camera_calibration.json')}},
    'static_anchors':an,
    'sessions':[{'id':'MODELED_W13_V3_TRAIN','scene_asset_sha256':scene_hash,'source_kind':'CONTROLLED_RENDER_FIXED_SCENE'}],
    'views':frames,
    'segments':[
      {'id':'MODEL_COVERAGE_LEFT_APPROACH_R2','ordered_view_ids':[f'T{i:02d}' for i in range(0,6)]},
      {'id':'MODEL_COVERAGE_CENTER_APPROACH_R2','ordered_view_ids':[f'T{i:02d}' for i in range(5,11)]},
      {'id':'MODEL_COVERAGE_RIGHT_APPROACH_R2','ordered_view_ids':[f'T{i:02d}' for i in range(10,16)]},
      {'id':'MODEL_COVERAGE_RIGHT_DIAGONAL_R2','ordered_view_ids':[f'T{i:02d}' for i in range(14,18)]}],
    'evaluation_plan':{'frozen_before_capture':True,'frozen_protocol_sha256':sha(OUT/'FROZEN_PROTOCOL_BEFORE_MODEL_FIT.json'),
      'holdout_images_materialized':False,'reserved_future_session_id':'MODELED_W13_V3_FUTURE_HELDOUT','source_disjoint_holdout':True}}
 save(OUT/'manifest_train.json',manifest)
 save(OUT/'trusted_original_w4_lock.json',original)
 print('FROZEN TRAIN SOURCES',len(frames),'source',scene_hash,'anchor count',len(an),flush=True)

if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('phase',choices=['train','holdout']);opts=a.parse_args()
 if opts.phase=='train':initialize_train()
 else:
  freeze=OUT/'FROZEN_V3_TRAINING_MODEL_RECEIPT.json';protocol=OUT/'FROZEN_PROTOCOL_BEFORE_MODEL_FIT.json'
  if not freeze.is_file() or not protocol.is_file():raise RuntimeError('NO FROZEN MODEL OR PROTOCOL, HELDOUT HARD OFF')
  pp=json.loads(protocol.read_text());rec=json.loads(freeze.read_text())
  if rec.get('protocol_sha256')!=sha(protocol) or rec.get('holdout_images_opened') is not False:raise RuntimeError('MODEL_PROTOCOL_FROZEN_MISMATCH')
  if (OUT/'holdout').exists():raise RuntimeError('HELDOUT_EXISTS_NO_OVERWRITE')
  s=trimesh.load(MODEL,force='scene')
  views=render(TEST_POS,'holdout',s)
  save(OUT/'holdout/MODELED_W12_HOLDOUT_MANIFEST.json',{'protocol_sha256':sha(protocol),'scene_sha256':sha(MODEL),
    'truth':'MODELED_INTERPRETIVE_COHERENT_SOURCE_NOT_EXTERNAL_PHOTOGRAPH','views':views,
    'reference_camera_poses_reserved_only_for_AFTER_PNP_EVALUATION':True})
