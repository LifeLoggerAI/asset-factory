#!/usr/bin/env python3
"""UrAi founder-anchor-aligned sanctuary architectural study v2.

Deterministic single glTF Y-up modeled scene. 3D meshes and editable authorship,
NOT recovered geometry, production photoreal art, or Gaussian training admission.
No original reference pixels, private memories, or external provider assets embedded.
"""
from __future__ import annotations
import hashlib, json, math, random, os
from collections import Counter
from pathlib import Path
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

WORLD='URAI-IW-001-QUIET-RESET'
TRUTH='MODELED_INTERPRETIVE_ARCHITECTURE_STUDY_NOT_PHOTOGRAPH'
SOURCE_PROVENANCE='URAI Labs authored geometry; founder original private anchors are artistic authority'
RNG=random.Random(120014)
OUT=Path(os.environ.get('URAI_FOUNDER_HOME_OUTPUT', str(Path.cwd()/'artifacts'/'founder-home-study')))
OUT.mkdir(parents=True,exist_ok=True)
SCENE=trimesh.Scene()
SEMANTICS={}
PALETTE={
'limestone_cream':(175,151,116),'limestone_sun':(190,159,118),
'limestone_ochre':(146,118,89),'limestone_shadow':(117,105,87),
'sand_earth':(114,105,80),'earth_grass':(75,79,49),
'olive_olive':(77,81,48),'olive_silver':(105,112,77),'olive_shadow':(48,58,36),
'bark':(89,74,56),'bark_highlight':(118,99,77),
'walnut':(66,47,32),'door_dark':(35,31,25),'bronze_fixture':(91,73,44),
'fabric_oat':(122,113,99),'fabric_stripe':(57,51,43),
'book':(80,51,31),'ceramic':(178,158,126),
'soil':(72,55,42),'fire_basin':(46,39,31),
'hills_near':(91,99,73),'hills_mid':(134,132,101),'hills_far':(168,151,125),
'low_wall':(158,129,94),'glass':(41,50,43),'water':(116,111,91),
'neutral':(155,145,120),'sunset_amber':(244,183,100),'leaf_olive_light':(121,133,76),'stone_mortar':(128,112,93)
}
MATS={k:PBRMaterial(name=k,baseColorFactor=[*c,255],metallicFactor=0.0,roughnessFactor=0.94 if 'stone' in k or 'limestone' in k else 0.86) for k,c in PALETTE.items()}
COUNTER=Counter()

def add(name,mesh,role,material='limestone_cream',notes=None):
    if name in SEMANTICS:raise ValueError('DUPLICATE_SEMANTIC_NODE:'+name)
    mesh=mesh.copy()
    mesh.visual=trimesh.visual.TextureVisuals(material=MATS[material])
    SCENE.add_geometry(mesh,node_name=name,geom_name=name)
    SEMANTICS[name]={'role':role,'material':material,'notes':notes or ''}
    COUNTER[role]+=1

def cube(xyz,size):
    m=trimesh.creation.box(extents=size)
    m.apply_translation(xyz)
    return m

def cylinder(a,b,r1,r2=None,sections=9):
    """Segment with tapered rings and deterministic geometry; Y-up world."""
    a=np.asarray(a,dtype=float);b=np.asarray(b,dtype=float)
    axis=b-a;length=np.linalg.norm(axis)
    if length<1e-6:raise ValueError('ZERO_BRANCH')
    axis/=length
    helper=np.array([1.,0.,0.]) if abs(axis[0])<.8 else np.array([0.,0.,1.])
    u=np.cross(axis,helper);u/=np.linalg.norm(u);v=np.cross(axis,u)
    r2=r1 if r2 is None else r2
    vertices=[]
    for center,rr in ((a,r1),(b,r2)):
      for k in range(sections):
        ang=2*math.pi*k/sections
        vertices.append(center+rr*(math.cos(ang)*u+math.sin(ang)*v))
    faces=[]
    for k in range(sections):
      j=(k+1)%sections
      faces.extend([[k,j,sections+j],[k,sections+j,sections+k]])
      faces.append([sections*2, j, k]);faces.append([sections*2+1,sections+k,sections+j])
    vertices.extend([a,b])
    return trimesh.Trimesh(vertices=vertices,faces=faces,process=False)

def blob(center,radii,subdivisions=1):
    m=trimesh.creation.icosphere(subdivisions=subdivisions,radius=1)
    m.apply_scale(radii)
    m.apply_translation(center)
    return m

def horizontal_disc(radius,height,center,sections=28):
    m=trimesh.creation.cylinder(radius=radius,height=height,sections=sections)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi/2,[1,0,0]))
    m.apply_translation(center)
    return m

def ring_segment(cx,cz,radius,start,end,height,stone_width,depth):
    a=np.linspace(start,end,4)
    inner=radius-depth/2;outer=radius+depth/2
    verts=[]
    for y in [0.09,height]:
      for r in [inner,outer]:
        for ang in a: verts.append([cx+math.cos(ang)*r,y,cz+math.sin(ang)*r])
    n=len(a);faces=[]
    def quad(u,v,w,q):faces.extend([[u,v,w],[u,w,q]])
    for k in range(n-1):
      # bottom radius rings and top radius rings
      quad(k,k+1,2*n+k+1,2*n+k)
      quad(n+k,3*n+k,3*n+k+1,n+k+1)
      quad(2*n+k,2*n+k+1,3*n+k+1,3*n+k)
    quad(0,2*n,3*n,n)
    quad(n-1,n+ n-1,3*n+n-1,2*n+n-1)
    return trimesh.Trimesh(vertices=verts,faces=faces,process=False)

def slab(x,z,w,d,height=0.12,y=0,seed=0):
    """Simple irregular 8-vertex cut-stone prism with physically positive thickness."""
    local=random.Random(seed)
    j=lambda:local.uniform(-0.06,0.06)
    low=y-height/2;hi=y+height/2
    corners=[[x-w/2+j(),z-d/2+j()],[x+w/2+j(),z-d/2+j()],
             [x+w/2+j(),z+d/2+j()],[x-w/2+j(),z+d/2+j()]]
    verts=[[a,yy,b] for yy in [low,hi] for a,b in corners]
    faces=[[4,5,6],[4,6,7],[0,2,1],[0,3,2]]
    for i in range(4):
      j2=(i+1)%4;faces.extend([[i,j2,j2+4],[i,j2+4,i+4]])
    return trimesh.Trimesh(vertices=verts,faces=faces,process=False)

def hills(name,z,mid_y,peaks,material):
    # One continuous grounded terrain silhouette: still part of one scene.
    xs=np.linspace(-220,220,110)
    heights=mid_y+sum(amp*np.exp(-0.5*((xs-center)/width)**2) for center,width,amp in peaks)
    vertices=[]
    for x,h in zip(xs,heights):vertices.extend([[x,-13,z+5],[x,h,z]])
    faces=[]
    for i in range(len(xs)-1):
       p=2*i;faces.extend([[p,p+1,p+3],[p,p+3,p+2]])
    add(name,trimesh.Trimesh(vertices=vertices,faces=faces,process=False),'distant_terrain',material)

# FOUNDATION / LANDSCAPE / BOUNDARIES (preserve large open sky).
add('terrain.terrace.base',cube([0,-0.38,-2.2],[19,0.65,27]),'terrain','sand_earth')
# Stone paving: no global floor shader abstraction; real separate rectangular meshes.
for rz in range(15):
  z=7.3-rz*1.31
  for cx in range(14):
    x=-9.3+cx*1.42+(0.34 if rz%2 else 0)
    if x>9.5:continue
    # trim planting bed at the olive tree; dark soil instead.
    if (x+1.5)**2+(z+4.25)**2<2.4**2:continue
    # thin mismatch seams between hand-set pavers
    mat=['limestone_cream','limestone_sun','limestone_ochre','limestone_shadow'][int(RNG.random()*4)]
    add(f'terrace.paver.{rz:02d}.{cx:02d}',slab(x,z,1.31,1.18,.10,.025,seed=rz*41+cx*11),'stone_paving',mat)
# Planting soil around main olive trunk; physical separate garden edge.
add('garden.olive.soil',horizontal_disc(1.82,.05,[-1.65,.095,-4.15],28),'garden_soil','soil')
# Left-stone architecture: windowless intact facade with honest open doorway; no fake projection.
# Front is z=-5.85 facing camera +Z. Door x between -7.1 and -5.5, y .42..3.2.
wall_xs=np.arange(-9.4,-4.0,.80);wall_ys=np.arange(.19,4.72,.49)
for iy,y in enumerate(wall_ys):
 for ix,x in enumerate(wall_xs):
    center=x+(0.24 if iy%2 else 0)
    if -7.22<center<-5.52 and y<3.44:continue
    mat=['limestone_cream','limestone_sun','limestone_ochre','limestone_shadow'][((ix*19+iy*13)%19)//5]
    add(f'architecture.left.front.course.{iy:02d}.block.{ix:02d}',slab(center,-5.93,.77,.71,.47,y,seed=ix+35*iy),'weathered_wall_stone',mat)
# Heavy wooden door surround and recess
for name,xyz,size,mat in [
 ('architecture.door.jamb.left',[-7.34,1.69,-5.50],[.34,3.3,.45],'walnut'),
 ('architecture.door.jamb.right',[-5.37,1.69,-5.50],[.34,3.3,.45],'walnut'),
 ('architecture.door.lintel',[-6.35,3.40,-5.50],[2.25,.34,.57],'walnut'),
 ('architecture.door.interior.rear',[-6.32,1.64,-7.50],[2.18,3.12,.25],'door_dark'),
 ('architecture.door.interior.floor',[-6.36,.18,-6.75],[2.2,.22,2.4],'limestone_shadow'),
 ('architecture.left.return.wall',[-9.45,2.18,-8.5],[.80,4.5,6.0],'limestone_sun'),
 ('architecture.left.parapet.high',[-4.07,1.70,-8.5],[.72,3.45,6.0],'limestone_ochre')]:
 add(name,cube(xyz,size),'entry_architecture',mat)
add('architecture.left.outer.framing.column',cube([-9.85,2.4,-1.80],[1.20,4.80,8.4]),'architecture_frame','limestone_cream')
# Dress the formerly monolithic near-left pier with individual masonry pieces.
# Different heights and real joints create a consistent stone volume, not a 2D decal.
for iy in range(9):
    y=.36 + .48*iy
    for iz in range(13):
        z=2.08-iz*.52 + (.14 if iy%2 else 0.)
        if z < -4.65:continue
        mat=['limestone_cream','limestone_sun','limestone_ochre','limestone_shadow'][(3*iy+iz*7)%4]
        add(f'architecture.left.rough_return.course.{iy:02d}.stone.{iz:02d}',
            cube([-9.18,y,z],[.18,.42,.49]), 'weathered_wall_stone',mat)
# A thick stone threshold physically frames the same recessed doorway for all cameras.
for j in range(7):
    add(f'architecture.door.arch_riser.{j:02d}',
        slab(-7.24+(.27*j),-5.45,.22,.31,.34,3.45+.24*math.sin(math.pi*j/6),seed=420+j),
        'entry_architecture','limestone_sun')
# Unequal solid steps at the door.
for i in range(3):
 z=-5.25+i*.49;y=.36-i*.11
 add(f'architecture.door.step.{i}',slab(-6.35,z,2.6+i*.40,.50,.22,y,seed=115+i),'entry_steps','limestone_cream')
for sx in [-7.75,-4.95]:
 add(f'architecture.door.wall.lantern.{sx}',cube([sx,2.33,-5.35],[.18,.34,.16]),'lighting_fixture','bronze_fixture')
# Secondary distant doorway behind tree with masonry volume.
add('architecture.secondary.stonewing',cube([-9.15,1.6,-11.9],[2.5,3.2,5.0]),'architecture_secondary','limestone_ochre')
# Physical parapet at back, leaves central open vista.
for i in range(12):
 x=-9.2+i*1.70
 add(f'parapet.back.segment.{i:02d}',slab(x,-14.14,1.60,.75,.81,.48,seed=300+i),'parapet','low_wall')
# Right cropped side edge, deliberately not an enclosing hall.
for i in range(4):
 add(f'architecture.right.edge.{i}',slab(9.5,-3.0-i*1.2,1.15,1.3,1.8,1.05,seed=523+i),'framing_wall','limestone_sun')
# Consistent warm setting sun: a proxy environmental mesh at a fixed position
# (not physical solar ephemeris, image relighting proof or photoreal approval).
add('environment.sunset_solar_disc_proxy',blob([71,5.0,-145],[3.5,3.5,.13],2),
    'sky_sun_proxy','sunset_amber','Stable theatrical composition proxy; final sky/lighting requires real photometric review')
# The central stone gathering feature, ground low ring and exposed dark interior.
CX,CZ=3.0,-6.05
add('gathering.dark_interior',horizontal_disc(1.14,.095,[CX,.13,CZ],50),'gathering_feature','fire_basin')
for k in range(22):
 a=2*math.pi*k/22
 add(f'gathering.rim.stone.{k:02d}',ring_segment(CX,CZ,1.31,a+.015,a+(2*math.pi/22)-.014,.57,.30,.40),'gathering_feature', ['limestone_cream','limestone_sun','limestone_ochre'][k%3])
# Low benches, not stools with a technological profile.
for k,(bx,bz,angle) in enumerate([(5.4,-5.55,0.35),(1.0,-7.6,-0.12),(5.7,-8.2,.12)]):
 add(f'gathering.bench.{k}.seat',slab(bx,bz,2.15,.63,.22,.59,seed=620+k),'stone_seating','limestone_cream')
 for side in [-.78,.78]:
   add(f'gathering.bench.{k}.pedestal.{side}',cube([bx+side,.29,bz],[.38,.56,.50]),'stone_seating','limestone_ochre')
# Main mature olive tree: asymmetrical gnarled trunk, branching over the open ring.
T=(-1.7,-4.10)
main=[([-1.7,.12,-4.10],[-1.47,1.4,-4.05],.43,.37),
 ([-1.47,1.4,-4.05],[-1.90,2.9,-4.26],.37,.29),
 ([-1.90,2.9,-4.26],[-1.40,4.4,-4.55],.32,.24),
 ([-1.58,1.60,-4.14],[-.80,2.8,-4.1],.26,.20),
 ([-1.90,2.9,-4.26],[-3.10,4.55,-4.63],.26,.16),
 ([-1.40,4.4,-4.55],[.08,5.6,-4.35],.24,.13),
 ([-.80,2.8,-4.1],[.65,4.55,-4.20],.18,.12),
 ([.08,5.6,-4.35],[1.98,6.35,-4.45],.13,.07),
 ([-3.10,4.55,-4.63],[-4.55,5.7,-4.80],.15,.065),
 ([-1.4,4.4,-4.55],[-1.95,6.35,-4.55],.15,.07),
 ([1.98,6.35,-4.45],[3.3,6.85,-4.9],.078,.042)]
for i,(a,b,r0,r1) in enumerate(main):add(f'tree.olive.trunk_branch.{i:02d}',cylinder(a,b,r0,r1,12),'tree_structure','bark' if i%2 else 'bark_highlight')
for i in range(185):
 # irregular, more finely branching single-canopy tree; still a proxy, not scan-derived photoreal foliage.
 angle=RNG.uniform(-math.pi,math.pi)
 rad=RNG.uniform(.25,5.65)
 x=-.52+math.cos(angle)*rad
 z=-4.42+math.sin(angle)*rad*.62
 y=6.90 + RNG.uniform(-1.40,1.05)-.10*rad
 rr=[RNG.uniform(.30,.93),RNG.uniform(.17,.44),RNG.uniform(.31,.94)]
 if y<4.65:continue
 name=f'tree.olive.canopy.{i:03d}'
 add(name,blob([x,y,z],rr,subdivisions=1),'tree_foliage',['olive_olive','olive_silver','olive_shadow','leaf_olive_light'][i%4])
# Shrub clumps and grasses: individually grounded, away from central line of travel.
for i in range(50):
 x=RNG.uniform(-8.8,8.7);z=RNG.uniform(-12.8,5.1)
 # avoid central main walkway and seat
 if (z>-3.25 and -3.8<x<7.0) or (abs(x)<1.2 and z>-4.5):continue
 if ((x-CX)**2+(z-CZ)**2)**.5<1.7:continue
 if x<-5.3 and -6.5<z<-3.0:continue
 h=RNG.uniform(.3,.85)
 add(f'landscape.shrub.{i:03d}',blob([x,h*.5,z],[RNG.uniform(.29,.65),h*.6,RNG.uniform(.30,.65)],1),'organic_plant','olive_olive' if i%3 else 'olive_silver')
# Terracotta pots at entrance and along parapet; physically simple study objects.
for i,(x,z) in enumerate([(-8.22,-4.72),(-4.28,-4.12),(8.4,-3.7),(8.8,-8.4)]):
 add(f'object.pot.{i}',cylinder([x,.11,z],[x,.82,z],.33,.41,14),'foreground_prop','limestone_ochre')
 add(f'object.pot.plant.{i}',blob([x,1.07,z],[.58,.63,.55],1),'organic_plant','olive_olive')
# Foreground rough limestone sofa/seat with book, mug and laid fabric.
add('foreground.stone_sofa.base',cube([-5.0,.48,3.55],[5.5,.95,1.8]),'foreground_seating','limestone_cream')
add('foreground.stone_sofa.cushion',cube([-4.98,1.00,3.55],[5.28,.10,1.64]),'foreground_seating','fabric_oat')
# Falling cloth wraps left edge; material contrast explicitly provisional.
add('foreground.blanket.fold.top',slab(-6.20,3.70,2.32,1.33,.065,1.13,seed=734),'foreground_fabric','fabric_stripe')
add('foreground.blanket.fold.front',cube([-6.27,.70,4.41],[2.10,.74,.12]),'foreground_fabric','fabric_stripe')
add('foreground.book.cover',slab(-3.63,3.32,.85,.57,.075,1.12,seed=735),'foreground_story_object','book')
add('foreground.mug.body',cylinder([-4.38,1.13,3.32],[-4.38,1.40,3.32],.14,.14,16),'foreground_story_object','ceramic')
# Landscape beyond terrace: one set of consistent ranges across all cameras.
hills('landscape.ridge.near',-42,-6.60,[(-70,44,6),(-17,20,5.3),(52,32,4.7),(124,42,5)],'hills_near')
hills('landscape.ridge.mid',-73,-4.4,[(-94,56,7.0),(4,39,5.0),(95,39,6.7)],'hills_mid')
hills('landscape.ridge.far',-120,-1.7,[(-100,56,6),(22,45,5),(141,45,6.5)],'hills_far')
# Orb: physical position authority only. Runtime Orb and interaction engine remain unchanged.
CAMERAS={
 'H00': {'position':[1.00,2.58,10.35],'target':[-.20,2.62,-5.60],'fov_y_degrees':54.0},
 'A01_LEFT':{'position':[-.05,2.46,10.10],'target':[-1.45,2.60,-5.00],'fov_y_degrees':54.0},
 'A02_RIGHT':{'position':[2.20,2.54,10.65],'target':[.40,2.54,-5.6],'fov_y_degrees':54.0},
 'A03_TREE':{'position':[.12,2.63,9.70],'target':[-1.25,2.93,-4.72],'fov_y_degrees':54.0},
}
KEY={'door_center':[-6.35,1.72,-5.45],'tree_root':[-1.70,.09,-4.10],
 'tree_crown':[-.85,6.35,-4.42],'gathering_center':[3,.3,-6.05],
 'terrace_foreground':[-5.0,.9,3.55],'parapet_center':[3,.45,-14.14],
 'distant_horizon':[10,0,-100],'orb_anchor':[.1,1.42,-1.9]}


# Private original images are NEVER embedded. Their hashes are recorded as truth references;
# camera transforms are human-designed artistic proposals, NOT recovered original intrinsics.
ORIGINAL_ANCHORS = {
 'H00':{'sha256':None,'priority':['mature_tilted_tree','left_masonry_door','circular_gathering_stones','unobstructed_horizon','foreground_stone_seat'],'occlusion':['foreground_seat_before_terrace','tree_before_horizon','ring_before_far_terrain']},
 'A01_LEFT':{'sha256':None,'priority':['left_recessed_masonry_door','olive_trunk_and_canopy','right_open_sunset','stone_paving','gathering_ring'],'occlusion':['entrance_left_of_tree','canopy_over_open_right_sky']},
 'A02_RIGHT':{'sha256':None,'priority':['doorway_and_stone_approach','tree_trunk_twist','broad_canopy','gathering_ring','distant_mountains'],'occlusion':['tree_above_ring','parapet_before_ridge']},
 'A03_TREE':{'sha256':None,'priority':['tree_crown','olive_trunk','sky_to_horizon','stone_ring','landscape_depth'],'occlusion':['canopy_over_horizon','trunk_before_ring']},
}

# Owner-only original anchor hashes are supplied at execution time, never committed
# to a public repository or included in the geometric GLB.
PRIVATE_REFERENCE_PATH=os.environ.get('URAI_PRIVATE_FOUNDER_ANCHOR_HASHES')
if PRIVATE_REFERENCE_PATH:
 private=json.loads(Path(PRIVATE_REFERENCE_PATH).read_text())
 if set(private)!=set(ORIGINAL_ANCHORS):raise ValueError('PRIVATE_ANCHOR_REGISTRY_INCOMPLETE')
 for name in ORIGINAL_ANCHORS:
  v=private[name]
  val=v['sha256'] if isinstance(v,dict) else v
  if not (isinstance(val,str) and len(val)==64 and all(ch in '0123456789abcdef' for ch in val)):
   raise ValueError('PRIVATE_ANCHOR_HASH_INVALID')
  ORIGINAL_ANCHORS[name]['sha256']=val
for name, data in ORIGINAL_ANCHORS.items():
 data.update({'original_filename':name+'.png','truth':'PRIVATE_FOUNDER_REFERENCE_NOT_CAMERA_CALIBRATION',
  'proposed_camera':CAMERAS[name], 'calibration_status':'ART_INFERRED_FOV_AND_POSE_ONLY',
  'known_missing':['true photoreal masonry','high-fidelity olive bark and foliage','ground texture variation','physically based sky and sun','object-level original-to-model registration'],
  'landmark_identity_keys':['door_center','tree_root','tree_crown','gathering_center','parapet_center','terrace_foreground'],
  'privacy':'OWNER_PRIVATE_REFERENCE_HASH_ONLY_NO_PIXELS'})

def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
 return h.hexdigest()


def save():
 out=OUT/'URAI_WORLD001_FOUNDER_MATCHED_ARCHITECTURAL_STUDY_v2.glb'
 out.write_bytes(SCENE.export(file_type='glb'))
 model=trimesh.load(out,force='scene')
 if len(model.geometry)<250 or not set(KEY):raise RuntimeError('Architectural source incomplete')
 spec={'schema':'urai-founder-anchor-architecture-study-1','world':WORLD,'truth':TRUTH,
       'architecture_status':'MODELED_COORDINATE_COHERENT_CANDIDATE_NOT_FOUNDER_OR_PHOTOREAL_ACCEPTED',
       'original_source_handling':'Protected original anchor pixels never embedded in GLB; visual guidance only',
       'source_license':'URAI Labs owned deterministic modeled geometry; materials are authored flat-color PBR proxies',
       'coordinate_system':'glTF right-handed Y-up, authored model units designated meters; scale not photographically calibrated',
       'asset':{'file':out.name,'sha256':sha(out),'bytes':out.stat().st_size,'nodes':len(model.graph.nodes_geometry),
                'meshes':len(model.geometry),'faces':sum(len(g.faces) for g in model.geometry.values())},
       'semantic_nodes':SEMANTICS,'role_counts':dict(COUNTER),
       'landmarks':KEY,'camera_proposals':CAMERAS,'anchor_to_geometry_registry':ORIGINAL_ANCHORS,
       'orb_collision_navigation':{'orb_anchor':KEY['orb_anchor'],'navmesh_status':'proxy_not_authored',
           'collision_status':'proxy_not_authored','orb_runtime':'do_not_overwrite_existing controller Orb'},
       'source_status':{'original_W1_W4_geometry':'FAILED_NO_TRAINING','gaussian_training':'PREPARED_HARD_OFF_NO_PAID_EXECUTION',
           'material_acceptance':False,'founder_art_acceptance':False,'independent_review':False,
           'source_scene_not_photography':True,'architectural_study_v2_additions':['dressed near-left masonry','organic segmented canopy','central sightline planting clearance','single-source camera composition','stable sun geometry proxy']}}
 p=OUT/'URAI_WORLD001_FOUNDER_HOME_SOURCE_REGISTRY_v2.json'
 p.write_text(json.dumps(spec,indent=2,sort_keys=True)+'\n')
 print('SCENE',out,'bytes',out.stat().st_size,'nodes',len(model.graph.nodes_geometry),'faces',spec['asset']['faces'],'sha256',sha(out))
 print('SOURCE REGISTRY',p)

if __name__=='__main__':save()
