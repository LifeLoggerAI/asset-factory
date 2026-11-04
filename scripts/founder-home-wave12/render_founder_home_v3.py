#!/usr/bin/env python3
"""Render one real V3 GLB from the four art-inferred founder anchor cameras.
Originals optional, loaded only from private path. No calibrated-photo claim.
"""
from pathlib import Path
import os,hashlib,json,numpy as np,trimesh,vtk
from vtk.util import numpy_support
from PIL import Image,ImageDraw
OUT=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT',str(Path.cwd()/'artifacts'/'founder-home-study-v3')))
SOURCE=OUT/'URAI_WORLD001_FOUNDER_HOME_ARCHITECTURE_v3.glb'
REG=OUT/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v3_PUBLIC_SAFE.json'
sha=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()
W,H=1280,720

def renderer(scene):
 r=vtk.vtkRenderer();r.GradientBackgroundOn();r.SetBackground(.89,.67,.45);r.SetBackground2(.28,.48,.71)
 r.AutomaticLightCreationOff();cache={};actors=0
 for n in sorted(scene.graph.nodes_geometry):
  transform,key=scene.graph[n];g=scene.geometry[key].copy();g.apply_transform(transform)
  pts=vtk.vtkPoints();pts.SetData(numpy_support.numpy_to_vtk(np.ascontiguousarray(g.vertices,dtype=np.float32),deep=True))
  faces=np.column_stack([np.full(len(g.faces),3,dtype=np.int64),g.faces.astype(np.int64)])
  cells=vtk.vtkCellArray();cells.SetCells(len(g.faces),numpy_support.numpy_to_vtkIdTypeArray(faces.ravel(),deep=True))
  poly=vtk.vtkPolyData();poly.SetPoints(pts);poly.SetPolys(cells)
  mapper=vtk.vtkPolyDataMapper();mapper.SetInputData(poly)
  actor=vtk.vtkActor();actor.SetMapper(mapper)
  mat=getattr(g.visual,'material',None);tex=getattr(mat,'baseColorTexture',None)
  # Use actual UV coordinates and source-authoritative PNG bytes, not a
  # screenshot-based painted approximation or missing-bump normal fake.
  if tex is not None and getattr(g.visual,'uv',None) is not None:
   uv=np.asarray(g.visual.uv,dtype=np.float32)
   if uv.shape==(len(g.vertices),2):
    uvbuf=vtk.vtkFloatArray();uvbuf.SetNumberOfComponents(2);uvbuf.SetName('TCoords')
    uvbuf.SetArray(np.ascontiguousarray(uv).reshape(-1),len(uv)*2,1)
    poly.GetPointData().SetTCoords(uvbuf)
    name=mat.name
    if name not in cache:
     path=OUT/'materials'/(name.replace('V3_','').replace('_owned_procedural_prototype','')+'_owned_procedural_basecolor_512.png')
     reader=vtk.vtkPNGReader();reader.SetFileName(str(path));reader.Update()
     vtktexture=vtk.vtkTexture();vtktexture.SetInputConnection(reader.GetOutputPort());vtktexture.InterpolateOn();vtktexture.RepeatOn()
     cache[name]=(reader,vtktexture)
    actor.SetTexture(cache[name][1]);actor.GetProperty().SetColor(1,1,1)
  else:
   col=np.asarray(getattr(mat,'baseColorFactor',[156,143,119,255])[:3],float)
   if col.max()>1:col/=255.
   actor.GetProperty().SetColor(*np.clip(col,.015,1))
  actor.GetProperty().SetAmbient(.32);actor.GetProperty().SetDiffuse(.75)
  actor.GetProperty().SetSpecular(.035);actor.GetProperty().SetSpecularPower(14)
  r.AddActor(actor);actors+=1
 sun=vtk.vtkLight();sun.SetPosition(45,26,-22);sun.SetFocalPoint(0,0,-6);sun.SetColor(1,.78,.55);sun.SetIntensity(1.47);r.AddLight(sun)
 fill=vtk.vtkLight();fill.SetPosition(-20,35,30);fill.SetFocalPoint(0,0,-5);fill.SetColor(.83,.9,1);fill.SetIntensity(.48);r.AddLight(fill)
 win=vtk.vtkRenderWindow();win.SetOffScreenRendering(True);win.SetMultiSamples(4);win.SetSize(W,H);win.AddRenderer(r)
 return r,win,cache,actors

def execute():
 s=trimesh.load(SOURCE,force='scene');reg=json.loads(REG.read_text());assert sha(SOURCE)==reg['asset']['sha256']
 r,win,cache,actor_count=renderer(s);camera=r.GetActiveCamera();camera.SetViewUp(0,1,0)
 records=[]
 for name,p in reg['camera_proposals'].items():
  camera.SetPosition(*p['position']);camera.SetFocalPoint(*p['target']);camera.SetViewAngle(p['fov_y_degrees']);r.ResetCameraClippingRange();win.Render()
  output=OUT/f'URAI_W13_V3_{name}_MODELED.png';capture=vtk.vtkWindowToImageFilter();capture.SetInput(win);capture.SetInputBufferTypeToRGB();capture.ReadFrontBufferOff();capture.Update();writer=vtk.vtkPNGWriter();writer.SetInputConnection(capture.GetOutputPort());writer.SetFileName(str(output));writer.Write()
  records.append({'view':name,'file':output.name,'sha256':sha(output),'camera':p,'camera_authority':'ART_INFERRED_NOT_ORIGINAL_CALIBRATED'})
  print('rendered',name,output.stat().st_size,flush=True)
 win.Finalize()
 tiles=Image.new('RGB',(1540,940),(18,20,24));draw=ImageDraw.Draw(tiles)
 for i,v in enumerate(records):
  im=Image.open(OUT/v['file']).convert('RGB');im.thumbnail((740,417));xx=15+(i%2)*770;yy=31+(i//2)*470
  tiles.paste(im,(xx,yy));draw.text((xx,yy-20),v['view']+' | ONE V3 GLB | PROTOTYPE PBR | NO ART APPROVAL',fill=(245,239,223))
 preview=OUT/'URAI_W13_V3_FOUR_CAMERA_MODELED_CONTACT.jpg';tiles.save(preview,quality=93)
 originalRoot=os.environ.get('URAI_FOUNDER_HOME_PRIVATE_ANCHORS','')
 comparisons=None
 if originalRoot:
  src=Path(originalRoot);originals={name:src/(name+'.png') for name in reg['camera_proposals']}
  if all(p.is_file() for p in originals.values()):
   sheet=Image.new('RGB',(2360,1440),(20,22,25));d=ImageDraw.Draw(sheet)
   for i,v in enumerate(records):
    left=Image.open(originals[v['view']]).convert('RGB');right=Image.open(OUT/v['file']).convert('RGB')
    left.thumbnail((1150,335));right.thumbnail((1150,335));y=i*360
    sheet.paste(left,(5,y+20));sheet.paste(right,(1185,y+20))
    d.text((10,y+5),v['view']+' PROTECTED ORIGINAL PRIVATE',fill='white');d.text((1190,y+5),'MODELED V3 PROTOTYPE NOT PHOTOREAL',fill='white')
   pp=OUT/'PRIVATE_W13_V3_ORIGINAL_ANCHOR_COMPARISON.jpg';sheet.save(pp,quality=90)
   comparisons={'file':pp.name,'sha256':sha(pp),'private_originals':[{ 'name':k+'.png','sha256':sha(p)} for k,p in originals.items()]}
 receipt={'schema':'urai-world001-v3-render-1','source_sha256':sha(SOURCE),'actor_count':actor_count,'texture_maps_applied':list(cache),'views':records,
 'all_views_one_source':True,'contact_sheet_sha256':sha(preview),'classification':'MODELED_INTERPRETIVE_NOT_PHOTOREAL_NOT_PHOTOGRAPH',
 'private_comparison':comparisons,'frozen_v2_h03_failure_preserved':True,'photoreal_approved':False,'frames_admitted':0,'gpu_authorized':False}
 (OUT/'V3_RENDER_RECEIPT.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
 print('render receipt',sha(OUT/'V3_RENDER_RECEIPT.json'),flush=True)
if __name__=='__main__':execute()
