#!/usr/bin/env python3
"""Frozen source-disjoint modeled four-view SIFT+PnP guard, no art/training release.
Never fit poses on the reserved out-of-fit correspondence subset. Reject missing views.
"""
import cv2, numpy as np, json,hashlib,os
from pathlib import Path
D=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT',str(Path.cwd()/'artifacts'/'founder-home-study-v3')))/'modeled_acquisition_v3r2'
SHA=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()

def match(test,source,ratio=.72):
 if test is None or source is None or len(test)<3 or len(source)<3:return []
 bf=cv2.BFMatcher(cv2.NORM_L2)
 fw=bf.knnMatch(test,source,k=2);rev=bf.knnMatch(source,test,k=2)
 d1={m.queryIdx:m.trainIdx for m,n in fw if m.distance < ratio*n.distance}
 d2={m.queryIdx:m.trainIdx for m,n in rev if m.distance < ratio*n.distance}
 return sorted((i,j) for i,j in d1.items() if d2.get(j)==i)

def evaluate():
 cv2.setRNGSeed(12014)
 protocol=D/'FROZEN_PROTOCOL_BEFORE_MODEL_FIT.json'; model_file=D/'FROZEN_W13_V3_MODEL.npz'
 tr=json.loads((D/'FROZEN_V3_TRAINING_MODEL_RECEIPT.json').read_text())
 if SHA(protocol)!=tr['protocol_sha256'] or SHA(model_file)!=tr['model_sha256'] or tr['holdout_images_opened'] is not False:raise RuntimeError('FROZEN_TRAIN_MODEL_CHANGED')
 lock=json.loads((D/'FROZEN_EVALUATOR_BEFORE_HOLDOUT_V3.json').read_text())
 if lock['script_sha256']!=SHA(__file__) or lock['protocol_sha256']!=SHA(protocol) or lock['model_sha256']!=SHA(model_file):raise RuntimeError('EVALUATOR_NOT_FROZEN_BEFORE_EVAL')
 raw=json.loads((D/'holdout/MODELED_W12_HOLDOUT_MANIFEST.json').read_text())
 if raw['protocol_sha256']!=SHA(protocol) or raw['scene_sha256']!=json.loads(protocol.read_text())['scene_sha256']:raise RuntimeError('TEST_SOURCE_DRIFT')
 if set(x['id'] for x in raw['views'])!={'H00','H01','H02','H03','H04','H05'}:raise RuntimeError('WITHHELD_VIEW_COMPLETENESS_INVALID')
 manifest=json.loads((D/'manifest_train.json').read_text());cal=manifest['calibrations']['W13_V3_KNOWN_MODEL_CAMERA']
 K=np.array([[cal['fx'],0,cal['cx']],[0,cal['fy'],cal['cy']],[0,0,1]],dtype=np.float64)
 model=np.load(model_file);xyz=model['xyz'].astype(np.float64);desc=model['descriptors'].astype(np.float32)
 res=[]
 for v in raw['views']:
  f=D/v['file']
  if SHA(f)!=v['sha256']:raise RuntimeError('WITHHELD_FRAME_HASH_MISMATCH')
  img=cv2.imread(str(f),cv2.IMREAD_GRAYSCALE)
  kp,d=cv2.SIFT_create(nfeatures=2700).detectAndCompute(img,None)
  matches=match(d,desc)
  line={'view':v['id'],'modeled_image_sha256':v['sha256'],'localized':False,'source_image_mutual_matches':len(matches)}
  if len(matches)<20:
   line['reason']='INSUFFICIENT_MUTUAL_IMAGE_TO_3D_MATCHES';res.append(line);continue
  a,b=np.array(matches).T;pixels=np.asarray([kp[int(i)].pt for i in a],dtype=np.float64);points=xyz[b]
  rng=np.random.default_rng(12014+len(res));order=rng.permutation(len(points));fit=order[:int(.75*len(points))];test=order[int(.75*len(points)):]
  if len(test)<5:
   line['reason']='INSUFFICIENT_OUT_OF_FIT_CORRESPONDENCES';res.append(line);continue
  ok,rvec,tvec,inliers=cv2.solvePnPRansac(points[fit],pixels[fit],K,None,iterationsCount=2200,reprojectionError=4.,confidence=.999,flags=cv2.SOLVEPNP_EPNP)
  if not ok or inliers is None or len(inliers)<7:
   line['reason']='POSE_RANSAC_FAILED';line['fit_inliers']=0 if inliers is None else len(inliers);res.append(line);continue
  used=fit[inliers.reshape(-1)]
  ok2,rvec,tvec=cv2.solvePnP(points[used],pixels[used],K,None,rvec,tvec,True,cv2.SOLVEPNP_ITERATIVE)
  if not ok2:line['reason']='REFINEMENT_FAILED';res.append(line);continue
  projected,_=cv2.projectPoints(points[test],rvec,tvec,K,None)
  err=np.linalg.norm(projected.reshape(-1,2)-pixels[test],axis=1)
  R,_=cv2.Rodrigues(rvec);center=-R.T@tvec.reshape(3)
  gt=np.asarray(v['camera_to_world_m'],dtype=np.float64)
  lin={**line,'localized':True,'fit_count':len(fit),'fit_inliers':len(inliers),'excluded_out_of_fit_count':len(test),
       'unfit_median_px':float(np.median(err)),'unfit_p90_px':float(np.percentile(err,90)),
       'unfit_over8_count':int(np.sum(err>8)),
       'camera_center_error_in_declared_model_units':float(np.linalg.norm(center-gt[:3,3])),
       'training_or_test_data_leak_into_pose_fit':False}
  res.append(lin)
 passing=len(res)==6 and all(x['localized'] and x['unfit_median_px']<=4 and x['unfit_p90_px']<=8 for x in res)
 receipt={'schema':'urai-w13-v3-founder-home-modeled-image-feature-holdout-1',
  'source_glb_sha256':raw['scene_sha256'],'frozen_train_state_sha256':tr['model_sha256'],
  'evaluator_sha256':lock['script_sha256'],'frozen_protocol_sha256':SHA(protocol),
  'required_heldout_views':6,'views_accounted_for':len(res),'results':res,
  'all_view_median_limit_px':4,'all_view_p90_limit_px':8,
  'classification':'MODELED_SOURCE_SOFTWARE_GEOMETRY_RESEARCH_ONLY_NOT_PHYSICAL_CAPTURE',
  'model_train_camera_poses_known':True,'test_camera_poses_not_used_for_pnp':True,
  'photoreal_home_accepted':False,'original_W1_W4_failures_unchanged':True,
  'admitted_training_frames':0,'gpu_training_authorized':False,
  'status':'MODELED_SOURCE_IMAGE_FEATURE_SCREEN_PASS_RESEARCH_ONLY' if passing else 'MODELED_SOURCE_IMAGE_FEATURE_SCREEN_FAILED_NO_TRAINING'}
 p=D/'MODELED_W13_V3_FRESH_HOLDOUT_RESULT.json'
 if p.exists():raise RuntimeError('EXISTING_RECEIPT_IMMUTABLE')
 p.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
 print(json.dumps(receipt,indent=2))

if __name__=='__main__':evaluate()
