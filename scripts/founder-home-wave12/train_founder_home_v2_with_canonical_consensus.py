#!/usr/bin/env python3
"""Source bound known-pose train-only SfM research on Wave12 modeled sanctuary.
Uses actual canonical Jobs descriptor consensus, which cannot authorize paid or final use.
No S07/W1-W4 historical failure mutation; no heldout access before frozen model.
"""
import cv2,numpy as np,hashlib,json,math,importlib.util,os
from pathlib import Path

ROOT=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT','/mnt/data/urai_wave12/v2'))/'modeled_acquisition'
CANONICAL_SOURCE=Path(os.environ.get('URAI_JOBS_CANONICAL_DESCRIPTOR_SCRIPT','CANONICAL_JOBS_SOURCE_REQUIRED.py'))
K0=None

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def write(p,x):
 Path(p).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')

def match(d1,d2,ratio=.72):
 if d1 is None or d2 is None or len(d1)<3 or len(d2)<3:return []
 bf=cv2.BFMatcher(cv2.NORM_L2)
 f=bf.knnMatch(d1,d2,k=2);r=bf.knnMatch(d2,d1,k=2)
 good={m.queryIdx:m.trainIdx for m,n in f if m.distance < ratio*n.distance}
 back={m.queryIdx:m.trainIdx for m,n in r if m.distance<ratio*n.distance}
 return sorted((i,j) for i,j in good.items() if back.get(j)==i)

def cameras(m):
 pose=np.asarray(m,float);R=pose[:3,:3].T;t=-R@pose[:3,3]
 return K0@np.column_stack([R,t]),R,t

def main():
 cv2.setRNGSeed(12014)
 data=json.loads((ROOT/'manifest_train.json').read_text())
 protocol=ROOT/'FROZEN_PROTOCOL_BEFORE_MODEL_FIT.json'
 pre=json.loads((ROOT/'PREFLIGHT_W12_RESULT.json').read_text())
 assert pre['status']=='TRAIN_SOURCE_PACKET_FORMAT_VERIFIED_GEOMETRY_NOT_ACCEPTED'
 if (ROOT/'FROZEN_TRAINING_MODEL_RECEIPT.json').exists() or (ROOT/'FROZEN_W12_MODEL.npz').exists():raise RuntimeError('TRAINING_ALREADY_FROZEN_NO_OVERWRITE')
 cal=data['calibrations']['W12_KNOWN_MODEL_CAMERA'];global K0;K0=np.array([[cal['fx'],0,cal['cx']],[0,cal['fy'],cal['cy']],[0,0,1]],float)
 fs=[]
 for v in data['views']:
  fp=ROOT/v['file']
  if sha(fp)!=v['sha256']:raise RuntimeError('TRAIN_IMAGE_HASH_MISMATCH')
  img=cv2.imread(str(fp),cv2.IMREAD_GRAYSCALE)
  if img is None:raise RuntimeError('CANNOT_DECODE_TRAIN_FRAME')
  kp,desc=cv2.SIFT_create(nfeatures=2700).detectAndCompute(img,None)
  fs.append((np.array([x.pt for x in kp],dtype=np.float64),desc))
  print('features',v['id'],len(kp),flush=True)
 candidates=[];pairlog=[]
 for i in range(len(fs)-2):
  j=i+2
  xy1,d1=fs[i];xy2,d2=fs[j]
  pairs=match(d1,d2)
  if len(pairs)<8:
   pairlog.append({'pair':[i,j],'mutual_matches':len(pairs),'accepted':0});continue
  a,b=np.array(pairs).T
  P1,R1,t1=cameras(data['views'][i]['camera_to_world_m']);P2,R2,t2=cameras(data['views'][j]['camera_to_world_m'])
  hv=cv2.triangulatePoints(P1,P2,xy1[a].T,xy2[b].T)
  valid=np.abs(hv[3])>1e-9
  xyz=(hv[:3]/np.where(valid,hv[3],1)).T
  pr1=(P1@np.column_stack((xyz,np.ones(len(xyz)))).T).T
  pr2=(P2@np.column_stack((xyz,np.ones(len(xyz)))).T).T
  e1=np.linalg.norm(pr1[:,:2]/np.maximum(pr1[:,2,None],1e-8)-xy1[a],axis=1)
  e2=np.linalg.norm(pr2[:,:2]/np.maximum(pr2[:,2,None],1e-8)-xy2[b],axis=1)
  dep1=(R1@xyz.T+t1[:,None])[2];dep2=(R2@xyz.T+t2[:,None])[2]
  valid&=(dep1>1)&(dep2>1)&(np.maximum(e1,e2)<1.6)
  valid&=(np.abs(xyz[:,0])<15)&(xyz[:,1]>-2)&(xyz[:,1]<12)&(xyz[:,2]>-30)&(xyz[:,2]<11)
  for idx,(point,ia) in enumerate(zip(xyz[valid],a[valid])):
   if len(candidates)>=1600:break
   candidates.append({'id':len(candidates),'xyz':point.tolist(),'descriptor':d1[ia].astype(float).tolist(),
     'origin_frame_ids':[f'train/{data["views"][i]["id"]}',f'train/{data["views"][j]["id"]}']})
  pairlog.append({'pair':[i,j],'mutual_matches':len(pairs),'accepted':int(valid.sum())})
 print('candidate landmarks',len(candidates),flush=True)
 if len(candidates)<16:raise RuntimeError('INSUFFICIENT_TRAIN_MODEL_FEATURES_NO_HOLDOUT')
 views=[]
 for v,(xy,desc) in zip(data['views'],fs):
  views.append({'id':f'train/{v["id"]}','survey':'W12_MODELED_TRAIN','split':'train',
    'image_sha256':v['sha256'],'calibration':{'fx':cal['fx'],'fy':cal['fy'],'cx':cal['cx'],'cy':cal['cy'],'width':cal['width'],'height':cal['height']},
    'camera_to_world_m':v['camera_to_world_m'],
    'keypoint_xy':xy.tolist(),'keypoint_descriptors':desc.astype(float).tolist()})
 trusted={v['id']:v['image_sha256'] for v in views}
 spec=importlib.util.spec_from_file_location('consensus',CANONICAL_SOURCE)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 receipt=module.training_descriptor_consensus(candidates,views,trusted,'MODELED_W12_FUTURE_HELDOUT')
 if receipt['gaussian_training_permitted'] or receipt['frames_admitted']!=0 or receipt['holdout_images_read']!=0:raise RuntimeError('CANONICAL_GUARD_BYPASSED')
 ids=set(receipt['retained_landmark_ids'])
 retained=[q for q in candidates if q['id'] in ids]
 if len(retained)<12:raise RuntimeError('TOO_FEW_RETAINED_LANDMARKS_NO_HOLDOUT')
 pts=np.array([x['xyz'] for x in retained],dtype=np.float64)
 des=np.array([x['descriptor'] for x in retained],dtype=np.float32)
 np.savez_compressed(ROOT/'FROZEN_W12_MODEL.npz',xyz=pts,descriptors=des)
 write(ROOT/'TRAIN_ONLY_CANONICAL_CONSENSUS_REPORT.json',{
  'source_glb_sha256':data['scene_authority']['asset_sha256'],
  'protocol_sha256':sha(protocol),'manifest_train_sha256':sha(ROOT/'manifest_train.json'),
  'trained_on_known_model_render_camera_poses':True,'inference_pipeline':'ACTUAL_NERFSTUDIO_NOT_RUN_IMAGE_FEATURE_2VIEW_TRIANGULATION','model_3d_candidate_count':len(candidates),
  'retained_train_landmarks':len(retained),'canonical_source_sha256':sha(CANONICAL_SOURCE),
  'paired_training_view_logs':pairlog,'descriptor_consensus_result':receipt,
  'original_W1_W4_frozen_failures_unmodified':True,'no_test_data_access':True,
  'photoreal_fidelity_accepted':False,'training_frames_admitted':0,'gpu_training_authorized':False})
 frozen={'protocol_sha256':sha(protocol),'model_sha256':sha(ROOT/'FROZEN_W12_MODEL.npz'),
    'training_report_sha256':sha(ROOT/'TRAIN_ONLY_CANONICAL_CONSENSUS_REPORT.json'),
    'canonical_source_sha256':sha(CANONICAL_SOURCE),
    'holdout_images_opened':False,'model_truth':'MODELED_INTERPRETIVE_KNOWN_TRAIN_CAMERAS_RESEARCH_ONLY',
    'no_paid_compute':True,'admitted_frames':0}
 write(ROOT/'FROZEN_TRAINING_MODEL_RECEIPT.json',frozen)
 print('MODEL FROZEN',len(retained),'sha',frozen['model_sha256'],flush=True)

if __name__=='__main__':main()
