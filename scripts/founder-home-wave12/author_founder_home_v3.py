#!/usr/bin/env python3
"""Non-destructive v3 successor to the exact public-safe World001 v2 GLB author.
Genuinely authored physical meshes, stable v2 landmark identities and in-house
research PBR textures; no original anchor media or privately bound hashes.
This is NOT accepted photoreal Home or camera-accurate original reconstruction.
"""
import importlib.util,os,hashlib,json,math,random
from pathlib import Path
import numpy as np
import trimesh
from PIL import Image,ImageFilter
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals
SRC=Path(__file__).resolve().parent
OUT=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT',str(Path.cwd()/'artifacts'/'founder-home-study-v3')))
OUT.mkdir(parents=True,exist_ok=True)
# Never import original private anchor references in a public authored 3D source.
os.environ.pop('URAI_PRIVATE_FOUNDER_ANCHOR_HASHES',None)
spec=importlib.util.spec_from_file_location('canonical_v2_author',SRC/'author_founder_home_v2.py')
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)
s=v2.SCENE
rng=random.Random(130014)
# V2 remains independent and immutable. Remove ONLY its procedural leaf proxy;
# keep v2 trunk, stone paths, room and landmark semantic anchors fixed.
removed=[]
for n in sorted(s.geometry):
 if n.startswith('tree.olive.canopy.'):
  s.delete_geometry(n);v2.SEMANTICS.pop(n,None);removed.append(n)
# Sculpt major boughs and intertwined mature trunk geometry, not 2-D decals.
for i in range(23):
 ang=2*math.pi*i/23
 y0=.5+i*.14
 from_pt=np.array([-1.72+.12*math.cos(ang+y0),y0,-4.12+.10*math.sin(ang+y0)])
 to_pt=np.array([-1.61+.24*math.cos(ang+y0+1),y0+.95,-4.18+.19*math.sin(ang+y0+1)])
 v2.add('tree.olive.gnarled_bark_cord.%02d'%i,v2.cylinder(from_pt,to_pt,.07,.05,9),'tree_bark_gnarled','bark_highlight' if i%3 else 'bark')
branch_endpoints=[([-2.05,4.3,-4.5],[-5.8,6.1,-5.4],.17),([-1.2,4.9,-4.5],[2.8,6.2,-4.9],.18),
 ([-1.8,5.5,-4.7],[-3.8,7.6,-4.9],.13),([.10,5.5,-4.6],[5.0,7.4,-4.5],.11),
 ([-3.0,5.4,-4.6],[-6.2,7.0,-5.3],.095),([2.1,6.1,-4.9],[4.2,7.9,-5.1],.065)]
for j,(a,b,r) in enumerate(branch_endpoints):
 v2.add('tree.olive.canopy_support_branch.%02d'%j,v2.cylinder(a,b,r,.032,12),'tree_structure','bark')
# Many *small* crown clusters with taper and open negative space rather than
# the 185 giant repeated ellipsoids on a near-rectangular canopy from v2.
for i in range(610):
 a=rng.uniform(-math.pi,math.pi);radius=(rng.random()**.62)*6.1
 xx=-.62+math.cos(a)*radius;zz=-4.55+.64*math.sin(a)*radius
 yy=7.05+rng.gauss(0,.60)-.14*radius+.12*math.sin(a*3)
 if yy<4.9:continue
 rr=rng.uniform(.15,.40)
 axis=[rr*rng.uniform(.9,1.4),rr*rng.uniform(.32,.75),rr*rng.uniform(.75,1.25)]
 v2.add('tree.olive.leaf_tuft.%03d'%i,v2.blob([xx,yy,zz],axis,1),'tree_foliage',
        ['olive_olive','olive_silver','olive_shadow','leaf_olive_light'][i%4])
# Hewn block cross-sections: add irregular physical joint-bound rusticated stones
# beside the existing true recessed doorway, without moving approved landmarks.
for i in range(36):
 y=.32+.43*(i//6);z=-4.36+.53*(i%6)
 x=-9.19+rng.uniform(-.045,.045)
 material=['limestone_cream','limestone_sun','limestone_ochre','limestone_shadow'][i%4]
 v2.add('architecture.left.battered_quoin.%03d'%i,
  v2.cube([x,y,z],[.20+rng.uniform(0,.075),.34+rng.uniform(0,.09),.37+rng.uniform(0,.09)]),
  'weathered_wall_stone',material)
# Unequal local worn stone at door and ring with genuine thickness.
for j in range(11):
 x=-7.6+j*.27;z=-3.45+rng.uniform(-.05,.05)
 v2.add('architecture.door.worn_approach.%02d'%j,v2.slab(x,z,.28,.56,.12,.12+rng.uniform(-.02,.02),1000+j),'entry_steps',
        ['limestone_cream','limestone_shadow','limestone_sun'][j%3])
for j in range(25):
 a=2*math.pi*j/25
 x=3.0+math.cos(a)*(1.98+rng.uniform(-.08,.08));z=-6.05+math.sin(a)*(1.95+rng.uniform(-.08,.08))
 v2.add('gathering.outer_weathered_cobbles.%02d'%j,
        v2.slab(x,z,.42+rng.uniform(0,.20),.39+rng.uniform(0,.24),.17,.115,1100+j),
        'gathering_feature',['limestone_sun','limestone_shadow','limestone_cream'][j%3])
# New vegetation rooting around architectural seams but never through center path.
for i in range(55):
 x=rng.choice([-1,1])*rng.uniform(6.4,8.4);z=rng.uniform(-12.6,-3.4)
 h=rng.uniform(.20,.65)
 v2.add('landscape.crevice_plant.%03d'%i,v2.blob([x,h/2,z],[h*.50,h*.62,h*.49],1),'organic_plant',
    ['olive_olive','olive_silver','leaf_olive_light'][i%3])
# Owned deterministic material prototypes. They are not photogrammetry, scans,
# paid material packs or approved photoreal surfaces.
texture_dir=OUT/'materials';texture_dir.mkdir(exist_ok=True)
def texgen(name,base,seed):
 r=np.random.default_rng(seed);N=512
 noise=np.zeros((N,N),dtype=np.float32)
 for scale,amp in [(8,.60),(26,.30),(90,.11)]:
  arr=r.normal(0,1,(scale,scale)).astype('float32');im=Image.fromarray(arr,mode='F').resize((N,N),Image.Resampling.BICUBIC)
  noise+=np.array(im,dtype=np.float32)*amp
 noise=(noise-noise.mean())/(noise.std()+1e-6)
 grain=r.normal(0,.45,(N,N))
 d=noise[:,:,None]*8.3+grain[:,:,None]*3.2
 img=np.uint8(np.clip(np.array(base,dtype=float).reshape(1,1,3)+d*np.array([1,.93,.8]),0,255))
 file=texture_dir/(name+'_owned_procedural_basecolor_512.png');Image.fromarray(img,mode='RGB').save(file,optimize=True)
 rough=np.uint8(np.clip(225-14*noise+grain*7,195,250))
 rp=texture_dir/(name+'_owned_procedural_roughness_512.png');Image.fromarray(rough,'L').save(rp,optimize=True)
 return file,rp
mappings={'limestone_cream':(175,151,116),'limestone_sun':(190,159,118),'limestone_ochre':(146,118,89),
          'limestone_shadow':(117,105,87),'bark':(89,74,56),'bark_highlight':(118,99,77)}
materials={}
for idx,(k,base) in enumerate(mappings.items()):
 path,rough=texgen(k,base,13013+idx)
 mat=PBRMaterial(name='V3_'+k+'_owned_procedural_prototype',baseColorTexture=Image.open(path).convert('RGB'),
                 baseColorFactor=[255,255,255,255],roughnessFactor=.93,metallicFactor=0.)
 materials[k]=mat
for node in sorted(s.graph.nodes_geometry):
 if node not in v2.SEMANTICS:continue
 category=v2.SEMANTICS[node]['material'];mat=materials.get(category)
 if mat is None:continue
 trans,key=s.graph[node];g=s.geometry[key]
 # Project UVs from actual positions. Not a texture-free material claim.
 world=g.vertices@trans[:3,:3].T+trans[:3,3]
 role=v2.SEMANTICS[node]['role']
 if role in {'stone_paving','gathering_feature','entry_steps'}:coords=world[:,[0,2]]
 elif 'wall' in role or role=='entry_architecture':coords=world[:,[0,1]]
 else:coords=world[:,[0,1]]
 uv=(coords/1.7)%1.0
 g.visual=TextureVisuals(uv=uv,material=mat)
sha=lambda x:hashlib.sha256(Path(x).read_bytes()).hexdigest()
model_path=OUT/'URAI_WORLD001_FOUNDER_HOME_ARCHITECTURE_v3.glb'
model_path.write_bytes(s.export(file_type='glb'))
model=trimesh.load(model_path,force='scene')
v2_src=SRC/'author_founder_home_v2.py'
cam=v2.CAMERAS
source={'world':'URAI-IW-001-QUIET-RESET','schema':'urai-founder-home-architecture-v3-source-1',
 'truth':'MODELED_INTERPRETIVE_NOT_PHOTOGRAPH_NOT_AUTOBIOGRAPHICAL',
 'baseline_v2_source_sha256':sha(v2_src),'baseline_v2_scene_sha256':'2fa08bfad4cffc369732c5efde488c15695bd8d5011471a675ab0122d9544438',
 'asset':{'file':model_path.name,'sha256':sha(model_path),'bytes':model_path.stat().st_size,'nodes':len(model.graph.nodes_geometry),'faces':sum(len(x.faces) for x in model.geometry.values())},
 'camera_proposals':cam,'landmarks':v2.KEY,'artistic_camera_calibration':'UNPROVEN_ART_INFERRED',
 'modeled_camera_intrinsics':'DECLARED_RENDERER_54_DEGREES_FOV',
 'source_owner':'LifeLoggerAI/asset-factory PR491',
 'changes':{'removed_v2_leaf_proxy_count':len(removed),'added_rusticated_stones':36,'added_organic_leaf_tufts':sum(k.startswith('tree.olive.leaf_tuft.') for k in s.geometry),
  'added_rough_cobbles':25,'added_ground_vegetation':55,'added_bark_cords':23,'physically_sized_threshold_stones':11},
 'materials':{'classification':'URAI_AUTHORED_PROCEDURAL_512px_PBR_TEXTURE_PROTOTYPES_NOT_FINAL_PHOTOREAL',
  'asset_files':[{'file':f.name,'sha256':sha(f)} for f in sorted(texture_dir.glob('*.png'))],
  'ownership':'original deterministic script; no external third-party materials'},
 'gates':{'original_W1_W4':'FAILED_UNCHANGED','exposed_W12_H03':'FAILED_UNCHANGED',
  'founder_visual_acceptance':False,'photoreal_material_acceptance':False,'independent_reconstruction':False,
  'frames_admitted':0,'gaussian_training_permitted':False,'paid_compute_authorized':False,
  'orb_runtime_modified':False,'collision_navmesh_certified':False,'protected_release_approved':False}}
registry=OUT/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v3_PUBLIC_SAFE.json'
registry.write_text(json.dumps(source,indent=2,sort_keys=True)+'\n')
print('V3 GLB',model_path,model_path.stat().st_size,source['asset']['sha256'],'nodes',len(model.graph.nodes_geometry),'faces',source['asset']['faces'])
print('public-safe source',registry)
