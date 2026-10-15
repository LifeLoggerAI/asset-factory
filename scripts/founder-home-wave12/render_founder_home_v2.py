#!/usr/bin/env python3
"""Render exactly one frozen founder-aligned GLB from 4 art-inferred camera poses.
Does not recover or assert photographic calibration. Same GLB and materials per view.
"""
import argparse,hashlib,json,math,os
from pathlib import Path
import numpy as np
import vtk,trimesh
from vtk.util import numpy_support
from PIL import Image,ImageDraw,ImageFont

OUT=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT', str(Path.cwd()/'artifacts'/'founder-home-study')))
SRC=OUT/'URAI_WORLD001_FOUNDER_MATCHED_ARCHITECTURAL_STUDY_v2.glb'
REG=OUT/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v2.json'
W,H=1280,720

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def vtk_scene(scene):
 r=vtk.vtkRenderer();r.SetBackground(.86,.69,.48);r.SetBackground2(.35,.52,.68);r.GradientBackgroundOn()
 r.AutomaticLightCreationOff()
 count=0
 for node in sorted(scene.graph.nodes_geometry):
  transform,key=scene.graph[node]
  g=scene.geometry[key].copy();g.apply_transform(transform)
  if len(g.faces)==0:continue
  pts=vtk.vtkPoints();pts.SetData(numpy_support.numpy_to_vtk(np.ascontiguousarray(g.vertices,dtype=np.float32),deep=True))
  arr=np.column_stack([np.full(len(g.faces),3,dtype=np.int64),g.faces.astype(np.int64)])
  ca=vtk.vtkCellArray();ca.SetCells(len(g.faces),numpy_support.numpy_to_vtkIdTypeArray(arr.ravel(),deep=True))
  poly=vtk.vtkPolyData();poly.SetPoints(pts);poly.SetPolys(ca)
  mapper=vtk.vtkPolyDataMapper();mapper.SetInputData(poly);actor=vtk.vtkActor();actor.SetMapper(mapper)
  mat=getattr(g.visual,'material',None)
  col=np.array(getattr(mat,'baseColorFactor',[144,132,112,255])[:3],dtype=float)
  if col.max()>1:col/=255.
  actor.GetProperty().SetColor(*np.clip(col,.02,1.))
  actor.GetProperty().SetAmbient(.38);actor.GetProperty().SetDiffuse(.64)
  actor.GetProperty().SetSpecular(.035);actor.GetProperty().SetSpecularPower(11)
  r.AddActor(actor);count+=1
 l=vtk.vtkLight();l.SetPosition(45,24,-30);l.SetFocalPoint(0,0,-7);l.SetIntensity(1.55);l.SetColor(1,.78,.55)
 r.AddLight(l)
 fill=vtk.vtkLight();fill.SetPosition(-20,35,20);fill.SetFocalPoint(0,0,-3);fill.SetIntensity(.40);fill.SetColor(.82,.91,1)
 r.AddLight(fill)
 win=vtk.vtkRenderWindow();win.SetOffScreenRendering(True);win.SetSize(W,H);win.SetMultiSamples(4);win.AddRenderer(r)
 # VTK stores camera v-up in world axis.
 return r,win,count

def render(scene,cameras):
 renderer,win,actors=vtk_scene(scene)
 cam=renderer.GetActiveCamera();cam.SetViewUp(0,1,0)
 views=[]
 for name,pose in cameras.items():
  cam.SetPosition(*pose['position']);cam.SetFocalPoint(*pose['target'])
  cam.SetViewAngle(pose['fov_y_degrees']);renderer.ResetCameraClippingRange()
  win.Render()
  f=vtk.vtkWindowToImageFilter();f.SetInput(win);f.SetInputBufferTypeToRGB();f.ReadFrontBufferOff();f.Update()
  file=OUT/f'URAI_W12_V2_{name}_MODELED.png'
  writer=vtk.vtkPNGWriter();writer.SetInputConnection(f.GetOutputPort());writer.SetFileName(str(file));writer.Write()
  views.append({'anchor':name,'file':file.name,'sha256':sha(file),'camera_position':pose['position'],
    'camera_target':pose['target'],'fov_y_degrees':pose['fov_y_degrees'],
    'classification':'ARTISTICALLY_PROPOSED_MODELED_CAMERA_NOT_ORIGINAL_PHOTOGRAPH_POSE'})
  print('render',name,file.stat().st_size,sha(file)[:15],flush=True)
 win.Finalize()
 return views,actors

def contact(views):
 imgs=[]
 for v in views:
  im=Image.open(OUT/v['file']).convert('RGB');im.thumbnail((740,416))
  imgs.append((v['anchor'],im))
 tilew,tileh=770,470
 out=Image.new('RGB',(tilew*2,tileh*2),(22,25,28))
 draw=ImageDraw.Draw(out)
 for i,(name,im) in enumerate(imgs):
  x=(i%2)*tilew;y=(i//2)*tileh
  out.paste(im,(x+15,y+32));draw.text((x+15,y+9),name+'  |  ONE MODELED WORLD / NO PHOTOREAL APPROVAL',fill=(240,235,224))
 p=OUT/'URAI_W12_V2_FOUR_CAMERA_COHERENT_MODELED_VIEWS.jpg'
 out.save(p,quality=91)
 return p

def compare(views,originals):
 # Stored only inside owner-private QA. Never put original pixels in public GitHub / reproduction zip.
 tilew,tileh=1180,360
 out=Image.new('RGB',(tilew*2,tileh*4),(25,28,31));d=ImageDraw.Draw(out)
 for k,v in enumerate(views):
  file=originals[v['anchor']]
  for j,(label,src) in enumerate([('ORIGINAL PROTECTED ANCHOR (REFERENCE)',file),('COHERENT MODELED STUDY (NOT PHOTOREAL)',OUT/v['file'])]):
   im=Image.open(src).convert('RGB');im.thumbnail((tilew-16,tileh-33))
   x=j*tilew;y=k*tileh
   out.paste(im,(x+8,y+30))
   d.text((x+11,y+7),v['anchor']+'  '+label,fill=(248,230,203))
 p=OUT/'PRIVATE_WORLD001_W12_SIDE_BY_SIDE_FOUNDER_ANCHORS.jpg'
 out.save(p,quality=89)
 return p

if __name__=='__main__':
 s=trimesh.load(SRC,force='scene')
 source=json.loads(REG.read_text())
 assert sha(SRC)==source['asset']['sha256']
 views,actors=render(s,source['camera_proposals'])
 preview=contact(views)
 private_root=os.environ.get('URAI_FOUNDER_HOME_PRIVATE_ANCHORS','')
 originals=({name:Path(private_root)/(name+'.png') for name in source['camera_proposals']} if private_root else {})
 private=compare(views,originals) if originals and all(x.is_file() for x in originals.values()) else None
 receipt={'schema':'urai-founder-home-anchored-render-1','world':'URAI-IW-001-QUIET-RESET',
   'scene_sha256':sha(SRC),'scene_model_units_not_calibrated_photographic_scale':True,
   'original_anchor_sources':[{'name':name+'.png','sha256':sha(path),'bytes':path.stat().st_size} for name,path in originals.items() if path.is_file()],
   'rendered_views':views,'actors_rendered':actors,'same_source_scene_for_all_four':True,
   'preview':{'file':preview.name,'sha256':sha(preview)},
   'private_visual_comparison':({'file':private.name,'sha256':sha(private),'MUST_REMAIN_OWNER_PRIVATE':True} if private else {'not_generated_without_private_anchors':True}),
   'status':{'architectural_geometry':'RENDERABLE_SOURCE_CANDIDATE','photoreal_materials':'PROXY_INCOMPLETE',
   'founder_acceptance':'NOT_REVIEWED','independent_geometry':'NOT_CERTIFIED','original_W1_W4':'FAILED_AND_PRESERVED',
   'training_frames_admitted':0,'gaussian_hard_off':True,'independent_release':'NOT_APPROVED'}}
 p=OUT/'URAI_W12_V2_RENDER_AND_PRIVATE_ANCHOR_SHA_RECEIPT.json'
 p.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
 print('receipt',p,sha(p),'model_preview',preview,flush=True)
