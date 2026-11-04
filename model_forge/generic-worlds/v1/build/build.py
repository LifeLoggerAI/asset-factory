#!/usr/bin/env python3
"""Original metric modular world candidates. Offline, deterministic, no provider calls.

This manufactures authored architecture/furniture, not historical or personal truth.
It deliberately exports review candidates; no promotion or visual-acceptance path.
"""
import argparse, hashlib, io, json, math, struct, sys, time
from collections import defaultdict, deque
from pathlib import Path
import numpy as np
from PIL import Image
from functools import lru_cache

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.0.2"
AXES = {"handedness":"right", "up":"+Y", "front":"+Z", "cameraForward":"-Z"}
PROFILES = {"desktop":(0,512,20,3), "xr":(1,256,12,2), "mobile":(2,128,8,1)}
MATERIALS = {
 "plaster":([.78,.72,.60],"plaster",.86,0),
 "cream":([.86,.82,.71],"plaster",.82,0),
 "sage":([.43,.49,.38],"plaster",.86,0),
 "paint-blue":([.34,.45,.49],"plaster",.72,0),
 "oak":([.48,.28,.12],"wood",.64,0),
 "walnut":([.25,.13,.06],"wood",.53,0),
 "pine":([.60,.43,.23],"wood",.76,0),
 "floorboard":([.39,.24,.11],"planks",.74,0),
 "cloth-rust":([.47,.25,.14],"fabric",.94,0),
 "cloth-moss":([.27,.34,.22],"fabric",.95,0),
 "cloth-cream":([.73,.70,.60],"fabric",.94,0),
 "cloth-blue":([.25,.36,.46],"fabric",.94,0),
 "linoleum":([.68,.61,.43],"speckle",.69,0),
 "tile":([.80,.76,.66],"tile",.36,0),
 "ceramic":([.86,.87,.82],"speckle",.22,0),
 "metal":([.48,.49,.46],"speckle",.34,.85),
 "dark-metal":([.08,.095,.09],"speckle",.52,.72),
 "brick":([.43,.21,.13],"brick",.9,0),
 "concrete":([.49,.48,.42],"speckle",.9,0),
 "asphalt":([.16,.17,.16],"speckle",.95,0),
 "grass":([.23,.32,.14],"organic",.96,0),
 "soil":([.26,.20,.12],"organic",.95,0),
 "water":([.17,.30,.31],"water",.22,.08),
 "glass":([.52,.69,.72],"plain",.10,.12),
 "paper":([.82,.78,.63],"plaster",.86,0),
 "rubber":([.04,.047,.043],"speckle",.86,0),
 "lampshade":([.88,.77,.54],"fabric",.95,0),
 "light":([.94,.84,.61],"plain",.9,0),
}

def canonical(v): return (json.dumps(v,sort_keys=True,indent=2,allow_nan=False)+"\n").encode()
def write_json(path,v): path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(canonical(v))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def rgb_linear_color(color): return [float(v) for v in color]

@lru_cache(maxsize=96)
def texture(name,n):
    base,kind,rough,metal=MATERIALS[name]
    y,x=np.mgrid[0:n,0:n]/n
    # Integer periodic frequencies yield repeatable seams; no external image input.
    seed=int(hashlib.sha256(name.encode()).hexdigest()[:8],16)
    rng=np.random.default_rng(seed)
    field=np.zeros((n,n))
    for i in range(14):
        kx=int(rng.integers(1,48)); ky=int(rng.integers(1,48))
        field+=np.sin(2*np.pi*(kx*x+ky*y)+rng.random()*2*np.pi)/(i+3)
    field/=max(1,np.abs(field).max())
    bump=field*.012
    value=np.ones((n,n))+field*.035
    if kind in ("wood","planks"):
        grain=np.sin(2*np.pi*(22*x+.16*np.sin(2*np.pi*3*y)+.07*np.sin(2*np.pi*7*y)))
        value+=grain*.027+np.sin(2*np.pi*(54*x+.18*np.sin(2*np.pi*4*y)))*.012
        bump+=grain*.002
        if kind=="planks":
            seam=(np.mod(x*4,1)<.011)|(np.mod(y*2+np.floor(x*4)*.5,1)<.007)
            value[seam]*=.72; bump[seam]-=.018
            value+=.025*np.sin(np.floor(x*4)*1.8)
    elif kind=="fabric":
        weave=np.sin(2*np.pi*64*x)*np.sin(2*np.pi*64*y)
        value+=weave*.07; bump+=weave*.022
    elif kind=="tile":
        seam=(np.mod(x*4,1)<.025)|(np.mod(y*4,1)<.025)
        value[seam]*=.66; bump[seam]-=.06
    elif kind=="brick":
        row=np.floor(y*6); seam=(np.mod(y*6,1)<.075)|(np.mod(x*3+row*.5,1)<.025)
        value+=.055*np.sin(row+np.floor(x*3+row*.5)*2.1)
        value[seam]=1.48; bump[seam]-=.09
    elif kind=="organic":
        value+=np.sin(2*np.pi*(9*x+3*y))*.08+field*.10
    elif kind=="water":
        wave=np.sin(2*np.pi*(5*x+3*y))+.4*np.sin(2*np.pi*(9*x-7*y))
        bump=wave*.034; value+=wave*.015
    elif kind=="speckle": value+=field*.065
    dx=(np.roll(bump,-1,axis=1)-np.roll(bump,1,axis=1))*8
    dy=(np.roll(bump,-1,axis=0)-np.roll(bump,1,axis=0))*8
    normal=np.stack([-dx,-dy,np.ones_like(dx)],-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    col=np.clip(value[...,None]*np.array(base)*255,0,255).astype("uint8")
    norm=np.clip((normal*.5+.5)*255,0,255).astype("uint8")
    orm=np.zeros((n,n,3),dtype="uint8")
    orm[:,:,0]=255; orm[:,:,1]=np.clip((rough+field*.025)*255,0,255).astype("uint8"); orm[:,:,2]=int(metal*255)
    out=[]
    for a in (col,norm,orm):
        b=io.BytesIO(); Image.fromarray(a).save(b,format="PNG",compress_level=9); out.append(b.getvalue())
    return out

class Scene:
    def __init__(self,identifier,profile="desktop"):
        self.id=identifier;self.profile=profile
        self.level,self.texsize,self.radial,self.bevel=PROFILES[profile]
        self.parts=[];self.blocks=[];self.zones=[];self.counter=0
    def add(self,name,mat,p,n,uv,tri,category="furniture",at=(0,0,0),rot=0):
        p=np.array(p,dtype="float32");n=np.array(n,dtype="float32")
        c,s=np.cos(rot),np.sin(rot);R=np.array([[c,0,s],[0,1,0],[-s,0,c]],dtype="float32")
        p=p@R.T+np.array(at,dtype="float32");n=n@R.T
        self.parts.append((name,mat,p,n,np.array(uv,dtype="float32"),np.array(tri,dtype="uint32"),category))
    def block(self,name,center,size):
        p=np.array(center);r=np.array(size)/2
        self.blocks.append({"id":f"{name}-{len(self.blocks):04d}","min":(p-r).round(6).tolist(),"max":(p+r).round(6).tolist()})
    def box(self,name,size,at,mat="oak",radius=0,category="furniture",rot=0):
        h=np.array(size)/2; radius=min(radius,min(h)*.8)
        axes=[]
        for i in range(3):
            if radius:
                a=np.linspace(-h[i],-h[i]+radius,self.bevel+1)
                b=np.linspace(h[i]-radius,h[i],self.bevel+1)
                axes.append(np.unique(np.r_[a,b]))
            else:axes.append(np.array([-h[i],h[i]]))
        P=[];N=[];U=[];T=[]
        for axis in range(3):
            aa=[i for i in range(3) if i!=axis];i,j=aa
            for side in [-1,1]:
                start=len(P);vi=axes[i];vj=axes[j]
                for a in vi:
                    for b in vj:
                        pos=np.zeros(3);pos[axis]=side*h[axis];pos[i]=a;pos[j]=b
                        norm=np.zeros(3);norm[axis]=side
                        if radius:
                            core=np.clip(pos,-h+radius,h-radius);v=pos-core;length=np.linalg.norm(v)
                            norm=v/length;pos=core+radius*norm
                        P.append(pos);N.append(norm);U.append([float(a)*1.1,float(b)*1.1])
                for a in range(len(vi)-1):
                    for b in range(len(vj)-1):
                        v0=start+a*len(vj)+b;v1=v0+len(vj);v2=v1+1;v3=v0+1
                        q=[v0,v1,v2];normal=np.cross(np.array(P[v1])-P[v0],np.array(P[v2])-P[v0])
                        if normal[axis]*side<0:T.extend([[v0,v2,v1],[v0,v3,v2]])
                        else:T.extend([[v0,v1,v2],[v0,v2,v3]])
        self.add(name,mat,P,N,U,T,category,at,rot)
    def lathe(self,name,profile,at,mat="metal",category="furniture",rot=0):
        # Radius/Y samples produce genuine turned or bent manufactured profiles.
        P=[];N=[];U=[];T=[];count=self.radial
        for k,(r,y) in enumerate(profile):
            left=profile[max(0,k-1)];right=profile[min(len(profile)-1,k+1)]
            dr=right[0]-left[0];dy=right[1]-left[1]
            for j in range(count+1):
                a=2*math.pi*j/count;normal=np.array([dy*math.cos(a),-dr,dy*math.sin(a)])
                normal/=max(np.linalg.norm(normal),1e-8)
                P.append([r*math.cos(a),y,r*math.sin(a)]);N.append(normal);U.append([j/count*2,y*2])
        for k in range(len(profile)-1):
            for j in range(count):
                a=k*(count+1)+j;b=a+count+1
                T.extend([[a,b,a+1],[a+1,b,b+1]])
        # Close flat ends without zero-radius ring degeneracies.
        for k,reverse in [(0,False),(len(profile)-1,True)]:
            r,y=profile[k];center=len(P);P.append([0,y,0]);N.append([0,-1 if not reverse else 1,0]);U.append([.5,.5])
            start=len(P)
            for j in range(count+1):
                a=2*math.pi*j/count;P.append([r*math.cos(a),y,r*math.sin(a)])
                N.append([0,-1 if not reverse else 1,0]);U.append([.5+math.cos(a)/2,.5+math.sin(a)/2])
            for j in range(count):
                T.append([center,start+j+1,start+j] if reverse else [center,start+j,start+j+1])
        self.add(name,mat,P,N,U,T,category,at,rot)
    def pole(self,name,r,height,at,mat="metal",category="furniture"):
        self.lathe(name,[(r,0),(r,height)],at,mat,category)
    def roof(self,w,d,h):
        # Two pitched roof planes with finite thickness, no arbitrary floating cover.
        pitch=.25
        for sign in [-1,1]:
            self.box("pitched-roof",(w/2+ .35,.09,math.sqrt((d/2+.35)**2+(d*pitch/2)**2)),
                     (sign*w/4,h+d*pitch/4,0),"concrete",category="ceiling")

def door(s,x,z,width=1.35,height=2.18,wallheight=2.7):
    s.box("door-jamb-left",(.075,height+.08,.14),(x-width/2-.04,height/2,z),"cream",.004,"architecture")
    s.box("door-jamb-right",(.075,height+.08,.14),(x+width/2+.04,height/2,z),"cream",.004,"architecture")
    s.box("door-lintel",(width+.15,.075,.14),(x,height+.035,z),"cream",.004,"architecture")
    # Open door against the wall: fully clear entry aperture; leaf stays separate from shell.
    leaf=.84;angle=math.radians(105)
    at=(x-width/2-math.sin(angle)*leaf/2,height/2-.03,z+math.cos(angle)*leaf/2)
    s.box("open-panel-door",(leaf,height-.06,.045),at,"pine",.008,"doors",rot=angle)
    for yy in [.45,1.35]:
        s.box("door-inset-panel",(leaf-.16,.53,.012),(at[0],yy,at[2]),"oak",.008,"doors",rot=angle)

def window(s,x,z,width=1.3,base=.85,height=1.25):
    y=base+height/2
    for dx in [-width/2,width/2]: s.box("window-stile",(.055,height+.1,.16),(x+dx,y,z),"cream",.003,"windows")
    for dy in [-height/2,height/2]:s.box("window-rail",(width+.1,.055,.16),(x,y+dy,z),"cream",.003,"windows")
    s.box("window-mullion",(.035,height,.075),(x,y,z),"cream",.003,"windows")
    s.box("window-sill",(width+.18,.055,.25),(x,base-.025,z+.07),"pine",.008,"windows")
    s.box("window-glazing",(width-.08,height-.05,.009),(x,y,z-.012),"glass",category="windows")

def shell(s,w,d,h=2.7,wall="plaster",floor="floorboard",hall=False):
    s.zones=[{"id":"main","min":[-w/2,0,-d/2],"max":[w/2,0,d/2]}]
    s.box("floor",(w+.22,.16,d+.22),(0,-.08,0),floor,.004,"floor")
    s.box("ceiling",(w+.20,.10,d+.20),(0,h+.05,0),"cream",category="ceiling")
    for x in [-w/2-.06,w/2+.06]:
        s.box("side-wall",(.12,h,d+.12),(x,h/2,0),wall,category="walls")
        s.block("side-wall",(x,h/2,0),(.12,h,d+.12))
        s.box("skirting",(.032,.13,d),(x+(.078 if x<0 else -.078),.065,0),"cream",.003,"trim")
        s.box("cornice",(.07,.08,d),(x+(.095 if x<0 else -.095),h-.04,0),"cream",.005,"trim")
    opening=1.35;z=d/2+.06
    for sign in [-1,1]:
        width=(w-opening)/2;xx=sign*(opening/2+width/2)
        s.box("front-wall",(width,h,.12),(xx,h/2,z),wall,category="front-wall")
        s.block("entry-wall",(xx,h/2,z),(width,h,.12))
    s.box("door-header",(opening,h-2.18,.12),(0,(h+2.18)/2,z),wall,category="front-wall")
    door(s,0,z)
    # Real rear openings, rather than applying window props over a solid wall.
    z=-d/2-.06;ww=min(1.45,w*.24);xs=[-w*.26,w*.26]
    edges=sorted([-w/2]+[v for x in xs for v in (x-ww/2,x+ww/2)]+[w/2])
    for a,b in zip(edges,edges[1:]):
        if any(abs((a+b)/2-x)<ww/2-.001 for x in xs):continue
        s.box("rear-wall",(b-a,h,.12),((a+b)/2,h/2,z),wall,category="walls")
    for x in xs:
        s.box("window-below",(ww,.85,.12),(x,.425,z),wall,category="walls")
        s.box("window-above",(ww,h-2.10,.12),(x,(h+2.10)/2,z),wall,category="walls")
        window(s,x,z+.02,ww)
    s.block("rear-wall",(0,h/2,z),(w,h,.12))
    for zz in [-d/2,d/2]:
        if zz<0:s.box("skirting",(w,.13,.032),(0,.065,zz+.02),"cream",.003,"trim")
    if hall:
        hd=2.0;center=d/2+hd/2+.10
        s.box("corridor-floor",(w+.22,.16,hd),(0,-.08,center),"linoleum",category="floor")
        s.box("corridor-ceiling",(w+.22,.10,hd),(0,h+.05,center),"cream",category="ceiling")
        s.box("corridor-far-wall",(w+.22,h,.12),(0,h/2,center+hd/2),wall,category="walls")
        s.block("corridor-wall",(0,h/2,center+hd/2),(w+.22,h,.12))
        # Zone union overlaps at the real level threshold; external margins still apply.
        s.zones.append({"id":"hall","min":[-w/2,0,d/2-.65],"max":[w/2,0,d/2+hd+.10]})

def chair(s,x,z,rot=0,cloth="cloth-moss"):
    c=math.cos(rot);ss=math.sin(rot)
    def p(dx,y,dz):return (x+c*dx+ss*dz,y,z-ss*dx+c*dz)
    s.box("chair-seat",(.47,.075,.46),p(0,.47,0),cloth,.025,rot=rot)
    for dx in [-.19,.19]:
        for dz in [-.18,.18]:
            s.box("chair-leg",(.035,.45,.035),p(dx,.245,dz),"oak",.006,rot=rot)
        s.box("chair-back-post",(.035,.59,.035),p(dx,.745,-.19),"oak",.006,rot=rot)
    s.box("chair-back-rail",(.46,.07,.042),p(0,1.015,-.19),"oak",.006,rot=rot)
    for dx in [-.13,0,.13]:s.box("chair-back-slat",(.055,.36,.028),p(dx,.80,-.19),"oak",.006,rot=rot)
    s.block("chair",(x,.55,z),(.53,1.12,.53))

def table(s,x,z,w=1.6,d=.85,mat="oak",height=.76):
    s.box("table-top",(w,.065,d),(x,height-.03,z),mat,.022)
    for dx in [-w/2+.10,w/2-.10]:
        for dz in [-d/2+.10,d/2-.10]:
            s.lathe("turned-table-leg",[(.04,0),(.045,.07),(.028,.22),(.035,height-.06)],(x+dx,.01,z+dz),mat)
    s.box("table-apron",(w-.15,.09,.03),(x,height-.12,z-d/2+.06),mat,.004)
    s.block("table",(x,height/2,z),(w,height,d))

def sofa(s,x,z,w=2.1,cloth="cloth-rust",rot=0):
    c,ss=math.cos(rot),math.sin(rot)
    def p(dx,y,dz):return(x+c*dx+ss*dz,y,z-ss*dx+c*dz)
    s.box("sofa-frame",(w,.21,.78),p(0,.265,0),cloth,.055,rot=rot)
    s.box("sofa-back",(w,.52,.18),p(0,.69,-.32),cloth,.055,rot=rot)
    for dx in [-w/2+.08,w/2-.08]:
        s.box("sofa-arm",(.18,.46,.86),p(dx,.55,0),cloth,.06,rot=rot)
    count=3 if w>1.8 else 2
    cw=(w-.40)/count
    for i in range(count):
        dx=-w/2+.20+cw*(i+.5)
        s.box("sofa-seat-cushion",(cw-.012,.14,.62),p(dx,.43,.035),cloth,.045,rot=rot)
        s.box("sofa-back-cushion",(cw-.016,.37,.16),p(dx,.72,-.18),cloth,.04,rot=rot)
        if s.level<2:s.box("cushion-piping",(cw-.02,.008,.59),p(dx,.455,.035),"cloth-cream",.002,rot=rot)
    for dx in [-w/2+.17,w/2-.17]:
        for dz in [-.27,.27]:s.lathe("sofa-wood-foot",[(.025,0),(.033,.14)],p(dx,.01,dz),"walnut")
    size=(abs(math.cos(rot))*w+abs(math.sin(rot))*.92,.96,abs(math.sin(rot))*w+abs(math.cos(rot))*.92)
    s.block("sofa",(x,.49,z),size)

def cabinet(s,x,z,w=1.6,height=.90,d=.60,mat="pine",top="tile"):
    s.box("cabinet-carcass",(w,height-.03,d),(x,height/2,z),mat,.010)
    s.box("countertop",(w+.04,.045,d+.04),(x,height+.015,z),top,.012)
    count=max(1,round(w/.5))
    for i in range(count):
        xx=x-w/2+(i+.5)*w/count;ww=w/count-.018
        s.box("cabinet-door",(ww,height-.19,.024),(xx,height/2+.055,z+d/2+.012),mat,.004)
        s.box("cabinet-panel",(ww-.12,height-.35,.009),(xx,height/2+.055,z+d/2+.029),"oak",.003)
        s.box("cabinet-handle",(.07,.012,.022),(xx,height-.15,z+d/2+.05),"metal",.004)
    s.box("toe-kick",(w-.05,.075,.04),(x,.047,z+d/2-.04),"dark-metal")
    s.block("cabinet",(x,height/2,z),(w,height+.05,d+.07))

def books(s,x,y,z,count=6):
    colors=["cloth-blue","cloth-rust","cloth-moss","pine"]
    for i in range(count):s.box("unbranded-book",(.036+.008*(i%3),.19+.016*(i%2),.14),(x+i*.045,y,z),colors[i%4],.002)

def lamp(s,x,z):
    s.lathe("lamp-base",[(.12,0),(.13,.018),(.07,.05),(.03,.075)],(x,.74,z),"walnut")
    s.pole("lamp-stem",.012,.34,(x,.81,z),"metal")
    s.lathe("woven-lamp-shade",[(.19,0),(.11,.28)],(x,1.04,z),"lampshade")
    s.pole("lamp-bulb",.035,.07,(x,1.08,z),"light")

def bed(s,x,z,w=1.0,hospital=False):
    s.box("bed-base",(w,.18,2.03),(x,.32,z),"metal" if hospital else "walnut",.02)
    s.box("mattress",(w,.20,1.98),(x,.51,z),"cloth-cream",.05)
    s.box("blanket",(w+.03,.035,1.31),(x,.63,z+.25),"cloth-blue",.013)
    s.box("pillow",(w*.65,.14,.39),(x,.65,z-.70),"cloth-cream",.05)
    for dx in [-w/2+.09,w/2-.09]:
        for dz in [-.88,.88]:
            s.pole("bed-leg",.022,.29,(x+dx,.04,z+dz),"metal" if hospital else "walnut")
            if hospital:s.pole("bed-caster",.044,.02,(x+dx,.015,z+dz),"rubber")
    for zz in [-1.0,1.0]:
        s.box("bed-end",(w+.05,.47,.06),(x,.68,z+zz),"metal" if hospital else "walnut",.025)
    if hospital:
        for dx in [-w/2-.035,w/2+.035]:
            for dz in [-.65,.35]:s.pole("guard-upright",.012,.3,(x+dx,.51,z+dz),"metal")
            s.box("hospital-rail",(.025,.025,1.05),(x+dx,.81,z-.15),"metal",.01)
    s.block("bed",(x,.53,z),(w+.13,1.1,2.17))

def desk(s,x,z,w=1.2):
    table(s,x,z,w,.64,"pine")
    s.box("desk-drawer",(.38,.15,.55),(x+w/2-.23,.64,z),"pine",.008)
    s.box("drawer-pull",(.09,.016,.03),(x+w/2-.23,.64,z+.29),"metal",.005)

def rug(s,x,z,w,d):
    s.box("woven-rug",(w,.008,d),(x,.008,z),"cloth-moss",.003,"floor-dressing")
    if s.level<2:
        for dx in [-w/2+.04,w/2-.04]:s.box("rug-binding",(.035,.01,d),(x+dx,.012,z),"cloth-cream",category="floor-dressing")

def pew(s,x,z,w=3.3):
    s.box("pew-seat",(w,.065,.47),(x,.46,z),"oak",.02)
    s.box("pew-back",(w,.43,.05),(x,.71,z-.21),"oak",.015)
    for dx in [-w/2,w/2]:
        s.box("pew-end",(.07,.76,.52),(x+dx,.38,z),"oak",.015)
        s.box("pew-foot",(.18,.05,.57),(x+dx,.025,z),"oak",.012)
    s.block("pew",(x,.48,z),(w+.15,.98,.59))

FAMILIES=[
 ("gw-east-texas-living-room","East Texas suburban living room",6.4,5.2,2.7,"living"),
 ("gw-family-kitchen-dining","Family kitchen and dining room",7.4,5.0,2.7,"kitchen"),
 ("gw-east-texas-residential-street","Small-town residential street",20,24,3.0,"street"),
 ("gw-school-classroom-hallway","School classroom and hallway",8.0,7.0,3.0,"school"),
 ("gw-church-sanctuary-fellowship","Church sanctuary and fellowship hall",11.0,14.0,4.4,"church"),
 ("gw-hospital-room-corridor","Hospital room and corridor",5.6,5.8,2.8,"hospital"),
 ("gw-college-dorm-campus","College dorm room and corridor",5.2,6.0,2.7,"dorm"),
 ("gw-military-admin-operations","Military administrative interior",8.4,7.4,3.0,"military"),
 ("gw-lake-dock-shoreline","Lake dock and shoreline",18.0,20.0,3.0,"lake"),
 ("gw-backyard-garage-workshop","Backyard and detached workshop",14.0,16.0,3.0,"backyard"),
 ("gw-diner-cafe","Diner and cafe interior",9.0,7.4,2.8,"diner"),
 ("gw-motel-room-walkway","Motel room and exterior walkway",5.8,6.6,2.7,"motel"),
]
BATCH2=[
 ("gw-bedroom-era","Bedroom era kit candidate",6.4,5.4,2.6,"bedroom"),
 ("gw-office-workplace","Office workplace kit candidate",10.0,8.0,3.0,"office"),
 ("gw-warehouse","Warehouse storage kit candidate",20.0,18.0,6.0,"warehouse"),
]

def create_family(identifier,title,w,d,h,kind,profile):
    s=Scene(identifier,profile);hall=kind in ("school","church","hospital","dorm","military","motel","office")
    if kind not in ("street","lake","backyard"):
        shell(s,w,d,h,"cream" if kind in ("hospital","school","motel") else "plaster",
              "linoleum" if kind in ("hospital","school","kitchen","military") else "floorboard",hall)
    if kind=="living":
        sofa(s,-w/2+.59,-.15,2.5,"cloth-rust",math.pi/2)
        table(s,-1.1,-.15,1.3,.64,"walnut",.44);rug(s,-.95,-.15,2.8,2.35)
        cabinet(s,w/2-.39,-1.5,.64,.9,.63,"walnut","walnut");lamp(s,w/2-.39,-1.5)
        cabinet(s,-.5,-d/2+.34,1.8,.95,.55,"walnut","walnut");books(s,-1.1,1.09,-d/2+.38)
        chair(s,1.5,-1.6,math.pi/8)
    elif kind=="kitchen":
        cabinet(s,-1.9,-d/2+.36,2.2);cabinet(s,.6,-d/2+.36,1.8)
        s.box("refrigerator",(.74,1.66,.76),(w/2-.48,.85,-d/2+.48),"ceramic",.035)
        for yy,hh in [(1.36,.50),(.57,1.0)]:
            s.box("fridge-door",(.69,hh,.025),(w/2-.48,yy,-d/2+.875),"ceramic",.01)
            s.box("fridge-pull",(.018,.25,.055),(w/2-.73,yy,-d/2+.92),"metal",.004)
        s.block("refrigerator",(w/2-.48,.87,-d/2+.48),(.82,1.76,.86))
        s.box("stove-body",(.66,.89,.63),(-.35,.45,-d/2+.36),"ceramic",.012)
        s.box("oven-glass",(.48,.32,.01),(-.35,.43,-d/2+.68),"dark-metal",.015)
        for dx in [-.17,.17]:
            for dz in [-.15,.15]:s.lathe("stove-burner",[(.085,0),(.088,.012)],(-.35+dx,.90,-d/2+.36+dz),"dark-metal")
        s.block("stove",(-.35,.48,-d/2+.36),(.70,.96,.69))
        table(s,-.9,.65,1.55,.9)
        for dx in [-.46,.46]:chair(s,-.9+dx,1.35,math.pi);chair(s,-.9+dx,-.09)
    elif kind=="school":
        # Desks paired at side aisles, central 1.5 m circulation preserved.
        for x in [-2.5,-1.30,1.30,2.5]:
            for z in [-1.35,1.05]:desk(s,x,z,.90);chair(s,x,z+.57)
        s.box("blackboard",(3.1,1.12,.035),(0,1.60,-d/2+.075),"cloth-moss",.007,"wall-props")
        s.box("chalk-ledge",(3.15,.035,.11),(0,1.03,-d/2+.12),"oak",.004,"wall-props")
        desk(s,-2.25,-d/2+.9,1.4)
    elif kind=="church":
        for x in [-2.8,2.8]:
            for z in np.arange(-3.8,4.5,1.25):pew(s,x,float(z),3.65)
        # At-grade lectern and generic secular architecture; denomination remains configurable.
        cabinet(s,0,-d/2+.6,.64,1.05,.45,"oak","oak")
        for x in [-2.0,2.0]:table(s,x,d/2+1.15,2.3,.75)
    elif kind=="hospital":
        bed(s,-1.35,-.85,1.02,True);cabinet(s,-2.24,-2.12,.46,.86,.44,"cream","tile")
        chair(s,1.6,-1.8);s.pole("iv-pole",.012,1.85,(-.53,0,-2.08),"metal")
        s.lathe("iv-base",[(.18,0),(.18,.018),(.03,.04)],(-.53,.01,-2.08),"metal")
        s.box("curtain-track",(3.8,.025,.03),(-.45,2.45,-.35),"metal",category="architecture")
    elif kind=="dorm":
        for x in [-1.58,1.58]:bed(s,x,-.9,.98);desk(s,x,1.82,1.15);chair(s,x,1.19,math.pi)
        cabinet(s,-1.92,-2.63,.95,1.78,.58,"pine","pine");books(s,1.25,.90,1.73)
    elif kind=="military":
        for x in [-2.25,2.25]:
            for z in [-1.75,1.15]:desk(s,x,z,1.55);chair(s,x,z+.70)
        for x in [-2.8,2.8]:cabinet(s,x,-d/2+.34,1.4,1.5,.55,"paint-blue","metal")
        s.box("blank-operations-board",(2.7,1.1,.035),(0,1.60,-d/2+.07),"paper",.007,"wall-props")
    elif kind=="diner":
        for x in [-3.0,3.0]:
            for z in [-1.8,.5]:
                sofa(s,x,z-.64,1.55,"cloth-rust",0);sofa(s,x,z+.64,1.55,"cloth-rust",math.pi)
                table(s,x,z,1.25,.70,"ceramic")
        cabinet(s,0,-d/2+.35,3.3,1.04,.60,"walnut","metal")
        for x in [-.9,.9]:s.lathe("stool",[(.11,0),(.045,.09),(.04,.66),(.16,.68),(.17,.73)],(x,0,-d/2+1.25),"dark-metal")
    elif kind=="motel":
        bed(s,-1.28,-.77,1.55);cabinet(s,-2.32,-1.54,.43,.69,.48,"walnut","walnut")
        desk(s,1.8,1.34,1.35);chair(s,1.8,.70,math.pi)
        cabinet(s,1.88,-2.72,1.45,.85,.52,"walnut","walnut")
        s.box("luggage-rack",(.76,.035,.47),(1.91,.44,-.18),"cloth-moss",.004)
        for xx in [1.56,2.26]:s.box("rack-leg",(.028,.43,.028),(xx,.22,-.18),"metal",.004)
        s.block("luggage-rack",(1.91,.25,-.18),(.8,.5,.52))
    elif kind=="bedroom":
        bed(s,-1.65,-.75,1.55);cabinet(s,2.1,-1.2,1.35,.85,.50,"walnut","walnut")
        cabinet(s,-2.62,-1.48,.40,.70,.46,"pine","pine");chair(s,1.95,1.25,math.pi/8)
        rug(s,-.12,.25,2.7,2.15)
    elif kind=="office":
        for x in [-2.9,2.9]:
            for z in [-2.15,.25]:desk(s,x,z,1.65);chair(s,x,z+.76)
        cabinet(s,0,-d/2+.36,1.5,1.30,.55,"paint-blue","metal")
        books(s,-.52,1.44,-d/2+.3,8)
    elif kind=="warehouse":
        for x in [-6.5,6.5]:
            for z in [-5.0,-1.0,3.0]:
                for dx in [-1.45,1.45]:
                    for dz in [-1.65,1.65]:s.box("rack-upright",(.065,3.5,.065),(x+dx,1.75,z+dz),"paint-blue",.004)
                for y in [.26,1.36,2.46]:
                    for dz in [-1.65,1.65]:s.box("rack-beam",(3.0,.09,.045),(x,y,z+dz),"metal",.004)
                    s.box("rack-deck",(3.0,.035,3.2),(x,y+.065,z),"pine",.004)
                    for k in range(3):
                        s.box("unbranded-stable-carton",(.68,.57,1.05),(x-.88+k*.88,y+.37,z-.8),"paper",.007)
                s.block("storage-rack-bank",(x,1.8,z),(3.12,3.6,3.5))
    elif kind=="street":
        s.zones=[{"id":"left-sidewalk","min":[-5.1,0,-10.5],"max":[-3.2,0,10.5]},
                 {"id":"right-sidewalk","min":[3.2,0,-10.5],"max":[5.1,0,10.5]}]
        s.box("road",(6.0,.12,d),(0,-.08,0),"asphalt",category="floor")
        for side in [-1,1]:
            s.box("sidewalk",(2.0,.14,d),(side*4.10,-.07,0),"concrete",category="floor")
            s.box("curb",(.14,.16,d),(side*3.08,-.065,0),"concrete",.005,"architecture")
            s.box("front-lawn",(4.8,.14,d),(side*7.6,-.07,0),"grass",category="floor")
            for z in [-7.4,2.7]:
                x=side*8.3
                s.box("house-facade",(3.2,2.6,.20),(x,1.3,z),"brick",category="walls")
                window(s,x-.85,z+.13,.88);window(s,x+.85,z+.13,.88)
                s.box("eave",(3.45,.10,.52),(x,2.65,z+.11),"cream",category="architecture")
                s.block("house-facade",(x,1.35,z),(3.4,2.7,.30))
            s.pole("utility-pole",.08,6.0,(side*5.55,0,-3.9),"pine","architecture")
            s.box("utility-crossarm",(1.3,.085,.085),(side*5.55,5.5,-3.9),"pine",category="architecture")
        # No token vehicles or fake trees; commissioned dressing stays explicitly absent.
    elif kind=="lake":
        s.zones=[{"id":"dock","min":[-1.05,0,-6.7],"max":[1.05,0,6.3]},
                 {"id":"shore-path","min":[-4.0,0,6.3],"max":[4.0,0,8.8]}]
        s.box("lake-surface",(w,.06,15),(0,-.70,-2.5),"water",category="water")
        s.box("shore",(w,.62,5.6),(0,-.31,8),"soil",.08,"floor")
        for i,z in enumerate(np.arange(-6.75,6.65,.15)):
            s.box("dock-plank",(2.18,.045,.143),(0,-.027,float(z)),"pine",.003,"floor")
        for x in [-.85,.85]:
            s.box("dock-stringer",(.11,.20,13.7),(x,-.17,-.03),"walnut",category="architecture")
            for z in [-6.5,-3,0,3,6]:s.pole("dock-piling",.09,1.3,(x,-1.12,z),"pine","architecture")
        # Guard rails on sides, central path and both turnaround pads retained.
        for x in [-1.10,1.10]:
            for z in [-6.5,-3,0,3,6]:s.pole("dock-post",.032,1.1,(x,0,z),"pine","architecture")
            s.box("dock-handrail",(.06,.06,13),(x,1.05,-.2),"pine",.005,"architecture")
            s.block("dock-edge",(x,.6,-.2),(.10,1.2,13.1))
        table(s,2.1,8,1.5,.7,"pine");chair(s,2.1,7.2)
    elif kind=="backyard":
        s.box("yard",(w,.16,d),(0,-.08,0),"grass",category="floor")
        s.box("path",(1.4,.018,12),(0,.009,1),"concrete",category="floor")
        s.zones=[{"id":"yard","min":[-6.5,0,-7.5],"max":[6.5,0,7.5]}]
        # Workshop occupies a side footprint and leaves the central yard route clear.
        x=-4.0;z=-3.5;ww=4.1;dd=5.0
        s.box("workshop-slab",(ww,.16,dd),(x,-.07,z),"concrete",category="floor")
        for dx in [-ww/2,ww/2]:
            s.box("workshop-side",(.10,2.6,dd),(x+dx,1.3,z),"pine",category="walls")
            s.block("workshop-side",(x+dx,1.3,z),(.10,2.6,dd))
        s.box("workshop-back",(ww,2.6,.10),(x,1.3,z-dd/2),"pine",category="walls")
        s.block("workshop-back",(x,1.3,z-dd/2),(ww,2.6,.10))
        s.box("workshop-roof",(ww+.2,.12,dd+.2),(x,2.65,z),"concrete",category="ceiling")
        cabinet(s,x,z-dd/2+.37,3.1,.91,.66,"pine","walnut")
        for i in range(3):
            s.box("workshop-shelf",(3.0,.04,.28),(x,1.35+i*.42,z-dd/2+.18),"pine",.003)
        table(s,3.3,3.1,2.0,.9,"pine");chair(s,3.3,4.0,math.pi)
        # Construct individual fence boards rather than a stretched texture facade.
        for xx in np.arange(-w/2,w/2,.16):s.box("fence-board",(.15,1.55,.028),(float(xx),.775,-d/2+.08),"pine",.004,"architecture")
    return s

def glb_bytes(s,collision=False):
    g={"asset":{"version":"2.0","generator":"UrAi original generic-world-kit builder 1.0.0", "extras":{"units":"meters","axes":AXES,"truthClassification":"GENERIC"}},
       "scene":0,"scenes":[{"nodes":[]}],"nodes":[],"meshes":[],"accessors":[],"bufferViews":[],
       "buffers":[{"byteLength":0}],"materials":[],"images":[],"textures":[],"samplers":[{"magFilter":9729,"minFilter":9987,"wrapS":10497,"wrapT":10497}]}
    b=bytearray()
    def view(data,target=None):
        while len(b)%4:b.append(0)
        i=len(g["bufferViews"]);v={"buffer":0,"byteOffset":len(b),"byteLength":len(data)}
        if target:v["target"]=target
        g["bufferViews"].append(v);b.extend(data);return i
    def accessor(data,kind,component,target):
        data=np.ascontiguousarray(data);i=len(g["accessors"])
        a={"bufferView":view(data.tobytes(),target),"componentType":component,"count":len(data),"type":kind}
        if kind=="VEC3":a["min"]=data.min(axis=0).astype(float).tolist();a["max"]=data.max(axis=0).astype(float).tolist()
        g["accessors"].append(a);return i
    used=sorted(set(p[1] for p in s.parts));mi={}
    for mat in used:
        base,kind,rough,metal=MATERIALS[mat];m={"name":mat,"pbrMetallicRoughness":{"baseColorFactor":[1,1,1,1],"roughnessFactor":1,"metallicFactor":1}}
        if collision:m["pbrMetallicRoughness"]={"baseColorFactor":[.25,.45,.30,1],"roughnessFactor":1,"metallicFactor":0}
        else:
            tex=texture(mat,s.texsize);idx=[]
            for label,png in zip(["base-color-srgb","normal-linear","orm-linear"],tex):
                image=len(g["images"]);g["images"].append({"name":mat+"-"+label,"bufferView":view(png),"mimeType":"image/png"})
                ti=len(g["textures"]);g["textures"].append({"source":image,"sampler":0});idx.append(ti)
            m["pbrMetallicRoughness"]["baseColorTexture"]={"index":idx[0]};m["pbrMetallicRoughness"]["metallicRoughnessTexture"]={"index":idx[2]}
            m["normalTexture"]={"index":idx[1],"scale":.38}
            if mat=="glass":m["alphaMode"]="BLEND";m["pbrMetallicRoughness"]["baseColorFactor"]=[1,1,1,.24];m["doubleSided"]=True
            if mat=="light":m["emissiveFactor"]=[.7,.5,.25]
        mi[mat]=len(g["materials"]);g["materials"].append(m)
    groups=defaultdict(list)
    for part in s.parts:groups[part[-1]].append(part)
    allp=[];tris=0
    for category,parts in sorted(groups.items()):
        bymat=defaultdict(list)
        for p in parts:bymat[p[1]].append(p)
        prim=[]
        for mat,pp in sorted(bymat.items()):
            P=[];N=[];U=[];T=[];offset=0
            for _,_,p,n,u,t,_ in pp:P.append(p);N.append(n);U.append(u);T.append(t+offset);offset+=len(p)
            p=np.concatenate(P).astype("<f4");n=np.concatenate(N).astype("<f4");u=np.concatenate(U).astype("<f4");t=np.concatenate(T).reshape(-1).astype("<u4")
            allp.append(p);tris+=len(t)//3
            attrs={"POSITION":accessor(p,"VEC3",5126,34962),"NORMAL":accessor(n,"VEC3",5126,34962),"TEXCOORD_0":accessor(u,"VEC2",5126,34962)}
            if not collision:
                triangles=t.reshape(-1,3);pa=p[triangles];ua=u[triangles]
                e1=pa[:,1]-pa[:,0];e2=pa[:,2]-pa[:,0];d1=ua[:,1]-ua[:,0];d2=ua[:,2]-ua[:,0]
                det=d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0];inv=np.divide(1,det,out=np.zeros_like(det),where=np.abs(det)>1e-12)
                tx=(e1*d2[:,1,None]-e2*d1[:,1,None])*inv[:,None];bx=(e2*d1[:,0,None]-e1*d2[:,0,None])*inv[:,None]
                tv=np.zeros_like(p);bv=np.zeros_like(p)
                for column in range(3):np.add.at(tv,triangles[:,column],tx);np.add.at(bv,triangles[:,column],bx)
                tv-=n*np.sum(n*tv,axis=1)[:,None];length=np.linalg.norm(tv,axis=1)
                for i in np.flatnonzero(length<1e-8):
                    axis=np.array([1,0,0]) if abs(n[i,0])<.9 else np.array([0,0,1]);tv[i]=np.cross(n[i],axis)
                tv/=np.maximum(np.linalg.norm(tv,axis=1)[:,None],1e-8)
                sign=np.where(np.sum(np.cross(n,tv)*bv,axis=1)<0,-1,1)
                tangent=np.c_[tv,sign].astype('<f4');attrs['TANGENT']=accessor(tangent,'VEC4',5126,34962)
            prim.append({"attributes":attrs,"indices":accessor(t,"SCALAR",5125,34963),"material":mi[mat],"mode":4})
        idx=len(g["meshes"]);g["meshes"].append({"name":s.id+"-"+category,"primitives":prim})
        node=len(g["nodes"]);g["nodes"].append({"name":category,"mesh":idx,"extras":{"kitCategory":category,"partNames":sorted(set(p[0] for p in parts))}});g["scenes"][0]["nodes"].append(node)
    g["buffers"][0]["byteLength"]=len(b)
    while len(b)%4:b.append(0)
    for key in list(g):
        if isinstance(g[key],list) and not g[key]:del g[key]
    if collision:g.pop('samplers',None)
    jb=json.dumps(g,separators=(",",":"),allow_nan=False).encode();jb+=b" "*((-len(jb))%4)
    out=struct.pack("<III",0x46546c67,2,12+8+len(jb)+8+len(b))+struct.pack("<II",len(jb),0x4e4f534a)+jb+struct.pack("<II",len(b),0x004e4942)+b
    p=np.concatenate(allp)
    images=len(g.get("images",[]))
    return out,{"triangles":tris,"vertices":sum(len(v) for v in allp),"materials":len(used),"drawCalls":sum(len(m["primitives"]) for m in g["meshes"]),"textureResolution":s.texsize,"textureCount":images,"textureMemoryRgba8MipUpperBound":images*s.texsize*s.texsize*4*4//3,"bounds":{"min":p.min(axis=0).astype(float).tolist(),"max":p.max(axis=0).astype(float).tolist()},"bytes":len(out)}

def navigation(s,w,d,kind):
    radius=.30;step=.40;cells={};idx=0
    for zone in s.zones:
        x0,_,z0=zone["min"];x1,_,z1=zone["max"]
        for x in np.arange(x0+radius+step/2,x1-radius,step):
            for z in np.arange(z0+radius+step/2,z1-radius,step):
                if any(b["min"][0]-radius-step/2<x<b["max"][0]+radius+step/2 and b["min"][2]-radius-step/2<z<b["max"][2]+radius+step/2 and b["max"][1]>.08 for b in s.blocks):continue
                key=(round(float(x),4),round(float(z),4));cells[key]=idx;idx+=1
    polygons=[]
    for (x,z),i in cells.items():
        polygons.append({"id":f"walk-cell-{i:04d}","vertices":[[x-step/2,0,z-step/2],[x-step/2,0,z+step/2],[x+step/2,0,z+step/2],[x+step/2,0,z-step/2]]})
    points=list(cells)
    if not points:raise ValueError("No safe navigation cells "+s.id)
    preferred=(0,d/2-.70)
    if kind=="street":preferred=(-4.1,9.0)
    if kind=="lake":preferred=(0,6.0)
    entry=min(points,key=lambda p:(p[0]-preferred[0])**2+(p[1]-preferred[1])**2)
    # Connectivity is explicit from tile centers (including gaps between zones).
    def nearby(a,b):return abs(a[0]-b[0])+abs(a[1]-b[1])<=step*1.08 and np.linalg.norm(np.array(a)-b)<=step*1.05
    reachable={entry};todo=deque([entry])
    while todo:
        p=todo.popleft()
        for q in points:
            if q not in reachable and nearby(p,q):reachable.add(q);todo.append(q)
    distant=max(reachable,key=lambda p:(p[0]-entry[0])**2+(p[1]-entry[1])**2)
    teleports=[]
    # Search real reachable floor for safe disk centers; endpoint-only selection fails
    # when a room entrance or furthest cell lies beside furnishings.
    candidates=sorted(reachable,key=lambda p:-min((math.hypot(max(b['min'][0]-p[0],0,p[0]-b['max'][0]),max(b['min'][2]-p[1],0,p[1]-b['max'][2])) for b in s.blocks),default=10))
    for p in candidates:
        if not any(b["min"][0]-.65<p[0]<b["max"][0]+.65 and b["min"][2]-.65<p[1]<b["max"][2]+.65 and b["max"][1]>.08 for b in s.blocks):
            if any(np.linalg.norm(np.array(p)-np.array(t['position'])[[0,2]])<1.5 for t in teleports):continue
            teleports.append({"id":f"safe-teleport-{len(teleports)}","position":[p[0],0,p[1]],"radius":.65})
            if len(teleports)>=3:break
    if not teleports:raise ValueError('No collision-clear reachable teleport disk center: '+s.id)
    return {"schemaVersion":"urai-generic-navigation-v1","units":"meters","agent":{"radius":radius,"height":1.7,"minClearance":1.2},
      "walkablePolygons":polygons,"blockedVolumes":s.blocks,"teleportZones":teleports,"entry":[entry[0],0,entry[1]],"exit":[entry[0],0,entry[1]],
      "orientationLandmark":{"id":"entry-opening","position":[0,0,d/2]},"navmeshStatus":"GENERATED_PLANAR_METADATA_NOT_RUNTIME_BAKED",
      "clearanceChecked":True,"cellSize":step,"reachableCellsFromEntry":len(reachable),"totalWalkableCells":len(points),
      "knownLimitations":["Flat cells are conservatively sampled, not a Recast/runtime navigation bake.","Simple AABB furniture collision intentionally overestimates some rounded shapes.","Headroom is a design assumption requiring runtime/device verification.","Disconnected cells require governed teleport or a later navigation bake."]}

def collision_scene(source):
    s=Scene(source.id+"-collision","mobile")
    for i,b in enumerate(source.blocks):
        low=np.array(b["min"]);high=np.array(b["max"])
        s.box(f"collision-{i:03d}",(high-low).tolist(),((high+low)/2).tolist(),"concrete",category="collision")
    for zone in source.zones:
        a=np.array(zone["min"]);b=np.array(zone["max"]);size=b-a;size[1]=.06;at=(a+b)/2;at[1]=-.03
        s.box("collision-ground",size,at,"concrete",category="collision")
    return s

def pack_family(row,batch=1):
    identifier,title,w,d,h,kind=row;out=ROOT/"packages"/identifier/VERSION
    if out.exists():raise FileExistsError("Version exists; remove uncommitted development outputs or build a successor: "+str(out))
    out.mkdir(parents=True)
    records=[];profile_records={};start=time.perf_counter();desktop=None
    for profile,(level,tex,radial,bevel) in PROFILES.items():
        s=create_family(identifier,title,w,d,h,kind,profile)
        if profile=="desktop":desktop=s
        data,metrics=glb_bytes(s);name=f"lod{level}.glb";(out/name).write_bytes(data)
        profile_records[profile]={"lod":name,"textureResolution":tex,"target":{"maxTriangles":120000 if profile=="desktop" else 65000 if profile=="xr" else 35000,"maxBytes":25000000 if profile=="desktop" else 18000000 if profile=="xr" else 10000000,"maxTextureMemoryBytes":134217728 if profile=="desktop" else 67108864 if profile=="xr" else 33554432},"measuredStatic":metrics,"frameTimeMs":None,"physicalDeviceTested":False}
        records.append({"path":name,"sha256":sha(out/name),"bytes":len(data),"role":"geometry"})
    c=collision_scene(desktop);data,cm=glb_bytes(c,True);(out/"collision.glb").write_bytes(data)
    nav=navigation(desktop,w,d,kind);write_json(out/"navigation.json",nav)
    lighting={"schemaVersion":"urai-generic-lighting-v1","baseline":{"timeOfDay":"late-afternoon","ambientIntensity":1.15,"keyIntensity":3.0,"keyColor":"#fff0d7","keyPosition":[-3,7,-5]},
      "emotionalWeather":{"Calm":{"exposure":1.0,"ambientMultiplier":1.0},"Reflective":{"exposure":.94,"ambientMultiplier":.95},"Energized":{"exposure":1.05,"ambientMultiplier":1.05},"Heavy":{"exposure":.90,"ambientMultiplier":.90},"Uncertain":{"exposure":.97,"ambientMultiplier":.98},"Hopeful":{"exposure":1.04,"ambientMultiplier":1.02}},
      "sensitivityRules":{"noStrobe":True,"noCameraMotion":True,"minimumOrientationLight":.35,"userOverrideRequiredForEmotionalLighting":True},"runtimeBaked":False}
    write_json(out/"lighting.json",lighting)
    cameras={"wide":{"position":[w*.72,h*1.65,d*.78],"target":[0,1.0,0],"fov":48,"cutaway":True},
       "eye":{"position":[nav["entry"][0],1.62,nav["entry"][2]],"target":[0,1.12,-d*.24],"fov":64},
       "doorway":{"position":[0,1.62,d/2+.50],"target":[0,1.2,-d/3],"fov":68},
       "detail":{"position":[-w*.22,1.18,d*.08],"target":[-w*.28,.68,-d*.20],"fov":50}}
    if kind=="street":
        cameras["eye"]={"position":[-4.1,1.62,8.2],"target":[-4.1,1.4,-6.2],"fov":65}
        cameras["doorway"]={"position":[-4.4,1.62,2.3],"target":[-8.3,1.35,2.7],"fov":60}
        cameras["detail"]={"position":[-6.9,1.3,4.3],"target":[-8.3,1.2,2.7],"fov":45}
    elif kind=="lake":
        cameras["eye"]={"position":[0,1.62,5.9],"target":[0,1.1,-6],"fov":65}
        cameras["doorway"]={"position":[0,1.62,8.2],"target":[0,.7,-3],"fov":65}
        cameras["detail"]={"position":[.1,.85,3],"target":[.70,.1,1.2],"fov":50}
    elif kind=="backyard":
        cameras["eye"]={"position":[0,1.62,6],"target":[-3.8,1,-3.4],"fov":65}
        cameras["doorway"]={"position":[-4,1.62,-.3],"target":[-4,1,-5.7],"fov":65}
        cameras["detail"]={"position":[-3.2,1.45,-4.2],"target":[-4,.95,-5.4],"fov":50}
    write_json(out/"cameras.json",cameras)
    for name,role in [("collision.glb","collision"),("navigation.json","navigation"),("lighting.json","lighting"),("cameras.json","preview-configuration")]:records.append({"path":name,"sha256":sha(out/name),"bytes":(out/name).stat().st_size,"role":role})
    spec_path=ROOT.parents[2].parent/'world-factory-studio'/'productions'/'generic-world-library'/'v1'/'specs'/f'{identifier}.json'
    if not spec_path.exists():raise FileNotFoundError('Required exact governed source spec: '+str(spec_path))
    spec_hash=sha(spec_path)
    manifest={"schemaVersion":"urai-generic-world-package-v1","id":identifier,"version":VERSION,"title":title,"batch":batch,"truthClassification":"GENERIC","status":"GENERATED",
      "units":"meters","axes":AXES,"origin":"floor-center","bounds":profile_records["desktop"]["measuredStatic"]["bounds"],"profiles":profile_records,"files":records,
      "sourceSpec":{"repository":"LifeLoggerAI/urai-studio","path":f"productions/generic-world-library/v1/specs/{identifier}.json","version":"1.0.0","sha256":spec_hash,"realization":"PARTIAL","differences":"Local manufactured kit composition is a partial derivative of the broader source brief. Scene dimensions/furniture count, era packages, weather, vegetation, secondary subspaces and dressing are not fully implemented; actual dimensions and files here are authoritative for this build only."},
      "buildSourceSha256":sha(Path(__file__)),"dimensions":{"width":w,"depth":d,"height":h},
      "provenance":{"source":"Original parametric geometry and original periodic material synthesis","creator":"UrAi Generic World Factory / Codex","provider":"local-offline-build","license":"Repository Apache-2.0; original geometry/materials, no third-party asset inputs","commercialUse":"allowed-under-repository-license","attributionRequirement":"retain repository license and notices","sourceMedia":[],"personalIdentityEmbedded":False},
      "variants":{"generatedDressingState":"lightly-dressed","emptyVariant":"recompose architecture/floor/trim/doors/windows categories; not a separately emitted GLB","seasonWeatherEra":"specification-only; no assertion of exact historical accuracy","emotionalWeather":"lighting configurations prepared; runtime interpolation untested"},
      "personalization":{"slots":["wall-photo","furniture-substitution","personal-object","narrative-anchor","captured-subspace"],"insertTransform":{"translation":[0,0,0],"quaternion":[0,0,0,1],"scale":[1,1,1]},"insertTruthInheritance":"Never upgrade generic shell truth; each source insert retains independent provenance and consent.","minimumEvidence":"authorized source media or scan, unit/axis conversion, spatial alignment, consent, occlusion and collision review","anchors":[{"id":"entry","position":[0,0,d/2]},{"id":"floor-center","position":[0,0,0]},{"id":"rear-wall","position":[0,0,-d/2]}]},
      "runtimeIntegrated":False,"productionDeployed":False,"visualAccepted":False,"independentlyApproved":False,"xrCertified":False,
      "knownLimitations":["Procedural architecture/furniture candidates; not AAA art accepted.","No baked indirect light or hardware performance/device evidence.","Flat navigation metadata requires runtime import/bake and accessibility review.","All era/regional resemblance is generic artistic interpretation.","No character, vehicle, photographic foliage or audio source package; provider dressing jobs remain open.","GLB category batches support future governed recomposition; no runtime resolver altered."]}
    write_json(out/"manifest.json",manifest)
    write_json(out/"build-receipt.json",{"schemaVersion":"urai-generic-world-build-receipt-v1","id":identifier,"version":VERSION,"builderSha256":sha(Path(__file__)),"buildDurationSeconds":round(time.perf_counter()-start,4),"providerCalls":0,"paidCreditsSpent":0,"assets":[*records,{"path":"manifest.json","sha256":sha(out/"manifest.json"),"bytes":(out/"manifest.json").stat().st_size,"role":"manifest"}],"visualAcceptance":False,"runtimeIntegration":False})
    return {"id":identifier,"path":str(out.relative_to(ROOT)),"manifestSha256":sha(out/"manifest.json"),"profiles":{k:v["measuredStatic"] for k,v in profile_records.items()},"walkableCells":len(nav["walkablePolygons"]),"reachableCells":nav["reachableCellsFromEntry"],"teleportZones":len(nav["teleportZones"])}

def kits():
    definitions=[("dining-chair",lambda s:chair(s,0,0)),("dining-table",lambda s:table(s,0,0)),("upholstered-sofa",lambda s:sofa(s,0,0)),("panel-door",lambda s:door(s,0,0)),("sash-window",lambda s:window(s,0,0)),("base-cabinet",lambda s:cabinet(s,0,0)),("writing-desk",lambda s:desk(s,0,0)),("single-bed",lambda s:bed(s,0,0)),("hospital-bed",lambda s:bed(s,0,0,1.02,True)),("generic-pew",lambda s:pew(s,0,0)),("table-lamp",lambda s:lamp(s,0,0)),("woven-rug",lambda s:rug(s,0,0,2.8,2.0))]
    receipts=[]
    for name,build in definitions:
        path=ROOT/"kits"/name/VERSION;path.mkdir(parents=True,exist_ok=False);files=[];metrics={}
        for profile,(level,*_) in PROFILES.items():
            s=Scene("kit-"+name,profile);build(s);data,metric=glb_bytes(s);p=path/f"lod{level}.glb";p.write_bytes(data)
            files.append({"path":p.name,"sha256":sha(p),"bytes":len(data)});metrics[profile]=metric
        write_json(path/"manifest.json",{"schemaVersion":"urai-generic-kit-v1","id":"kit-"+name,"version":VERSION,"truthClassification":"GENERIC","files":files,"profiles":metrics,"provenance":{"source":"Original local parametric construction","license":"Repository Apache-2.0","sourceAssets":[]},"visualAccepted":False,"runtimeIntegrated":False})
        receipts.append({"id":"kit-"+name,"path":str(path.relative_to(ROOT)),"manifestSha256":sha(path/"manifest.json")})
    return receipts

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--only",help="exact family id");parser.add_argument("--no-kits",action="store_true");args=parser.parse_args()
    result=[]
    for row in FAMILIES+BATCH2:
        if args.only and row[0]!=args.only:continue
        r=pack_family(row,1 if row in FAMILIES else 2);result.append(r);print(json.dumps({"id":r["id"],"triangles":{k:v["triangles"] for k,v in r["profiles"].items()},"bytes":{k:v["bytes"] for k,v in r["profiles"].items()},"safeCells":r["walkableCells"]}),flush=True)
    kit_rows=[] if args.no_kits else kits()
    write_json(ROOT/"receipts"/"build-index.json",{"schemaVersion":"urai-generic-world-build-index-v1","builderSha256":sha(Path(__file__)),"worlds":result,"kits":kit_rows,"providerCalls":0,"paidCreditsSpent":0,"runtimeIntegrated":False})
if __name__=="__main__":main()
