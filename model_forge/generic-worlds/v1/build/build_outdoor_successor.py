#!/usr/bin/env python3
"""Write-once 1.0.5 outdoor scenery/material repairs; preserve collision/navigation.

Addresses measured empty cardinal views and directional texture banding. Distant
terrain is decorative and unwalkable; this is still GENERIC / NEEDS_REWORK art.
"""
from __future__ import annotations
import copy
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import shutil
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "qa"))
from audit_connected_world import audit_connected
from validate_package import load_json, validate_package
spec = importlib.util.spec_from_file_location("connected_outdoor_source", ROOT / "build/build_connected_successor.py")
connected = importlib.util.module_from_spec(spec); spec.loader.exec_module(connected)
original = connected.original
VERSION = "1.0.5"
KINDS = {"street", "lake", "backyard"}
original_texture = original.texture

@lru_cache(maxsize=12)
def outdoor_texture(name, n):
    if name not in ("grass", "water"): return original_texture(name, n)
    base, kind, rough, metal = original.MATERIALS[name]
    y, x = np.mgrid[0:n, 0:n] / n
    rng = np.random.default_rng(int(hashlib.sha256((name + "-outdoor-1.0.5").encode()).hexdigest()[:8], 16))
    # Equal-weight, varied-direction periodic modes avoid the predecessor's
    # dominant single grass/water stripe. Same modes/phases across device LODs.
    field = np.zeros((n, n)); used = set()
    while len(used) < 80:
        kx, ky = int(rng.integers(-24, 25)), int(rng.integers(-24, 25))
        if kx*kx + ky*ky < 9 or (kx, ky) in used or (-kx, -ky) in used: continue
        used.add((kx, ky)); field += np.sin(2*np.pi*(kx*x + ky*y) + rng.random()*2*np.pi)
    field /= np.abs(field).max()
    value = 1 + field * (.09 if name == "grass" else .014)
    bump = field * (.007 if name == "grass" else .003)
    dx = (np.roll(bump,-1,1)-np.roll(bump,1,1))*(n*.04); dy = (np.roll(bump,-1,0)-np.roll(bump,1,0))*(n*.04)
    normal = np.stack([-dx,-dy,np.ones_like(dx)],-1); normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
    col = np.clip(value[...,None]*np.asarray(base)*255,0,255).astype("uint8")
    norm = np.clip((normal*.5+.5)*255,0,255).astype("uint8")
    orm = np.empty((n,n,3),dtype="uint8"); orm[:,:,0] = 255; orm[:,:,1] = np.clip((rough + field*.015)*255,0,255).astype("uint8"); orm[:,:,2] = int(metal*255)
    result = []
    for pixels in (col,norm,orm):
        output = io.BytesIO(); Image.fromarray(pixels).save(output,format="PNG",compress_level=9); result.append(output.getvalue())
    return result

def horizon(scene, kind):
    points = np.concatenate([p[2] for p in scene.parts]); hx = max(abs(points[:,0]).max(), 8) + .015; hz = max(abs(points[:,2]).max(), 8) + .015
    if kind == "lake":
        scene.parts = [p for p in scene.parts if p[0] != "lake-surface"]
        # A surface plane replaces the original small water box; no coplanar
        # overlap or unearned collision support is introduced.
        scene.add("expanded-generic-lake", "water", [[-45,-.67,-45],[-45,-.67,45],[45,-.67,45],[45,-.67,-45]],
            [[0,1,0]]*4, [[0,0],[0,1.8],[1.8,1.8],[1.8,0]], [[0,1,2],[0,2,3]], "water")
        hx = hz = 45
    segments = {"desktop":128,"xr":96,"mobile":64}[scene.profile]; bands = 9
    positions = []; uv = []; indices = []
    for ring in range(bands):
        t = ring/(bands-1); smooth = t*t*(3-2*t)
        for sector in range(segments+1):
            angle = 2*math.pi*sector/segments; c,s = math.cos(angle),math.sin(angle)
            inner = 1/max(abs(c)/hx,abs(s)/hz); radius = inner + (110-inner)*t
            height = (-.70 if kind == "lake" else -.15) + smooth*(10 + 2*math.sin(3*angle+.7) + 1.4*math.cos(5*angle-.2))
            positions.append([radius*c,height,radius*s]); uv.append([radius*c*.032,radius*s*.032])
    for ring in range(bands-1):
        for sector in range(segments):
            a=ring*(segments+1)+sector;b=a+segments+1
            indices.extend([[a,a+1,b],[a+1,b+1,b]])
    p=np.asarray(positions); tri=np.asarray(indices); normals=np.zeros_like(p)
    cross=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
    if np.mean(cross[:,1]) < 0: tri=tri[:,[0,2,1]];cross=-cross
    for column in range(3):np.add.at(normals,tri[:,column],cross)
    for ring in range(bands):
        first=ring*(segments+1);last=first+segments
        normals[first]=normals[last]=normals[first]+normals[last]
    normals/=np.linalg.norm(normals,axis=1,keepdims=True)
    scene.add("generic-distant-terrain", "grass", p,normals,uv,tri,"decorative-unwalkable-scenery")

def outdoor_scene(row, profile):
    scene, _ = connected.connected_scene(row,profile); before = copy.deepcopy((scene.blocks,scene.zones)); horizon(scene,row[-1])
    if (scene.blocks,scene.zones) != before: raise ValueError("Decorative scenery must not change collision/navigation authoring")
    return scene

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def build_successor(row):
    source = ROOT/"packages"/row[0]/"1.0.4"; target = source.parent/VERSION
    if target.exists():raise FileExistsError("Version exists; previous bytes retained: " + str(target))
    if not validate_package(source/"manifest.json")["passed"]:raise ValueError("Invalid predecessor")
    manifest=copy.deepcopy(load_json(source/"manifest.json")); target.mkdir(parents=True)
    for record in manifest["files"]:
        if record["role"] != "geometry":shutil.copyfile(source/record["path"],target/record["path"])
    original.texture=outdoor_texture
    try:
        for profile,(level,*_) in original.PROFILES.items():
            scene=outdoor_scene(row,profile);data,measured=original.glb_bytes(scene);(target/f"lod{level}.glb").write_bytes(data);manifest["profiles"][profile]["measuredStatic"]=measured
    finally:original.texture=original_texture
    for record in manifest["files"]:record["sha256"]=digest(target/record["path"]);record["bytes"]=(target/record["path"]).stat().st_size
    manifest.update({"version":VERSION,"status":"NEEDS_REWORK","bounds":manifest["profiles"]["desktop"]["measuredStatic"]["bounds"]})
    manifest["successorSource"]={"predecessorVersion":"1.0.4","predecessorManifestSha256":digest(source/"manifest.json"),"outdoorSuccessorSha256":digest(Path(__file__)),
        "connectedSuccessorSha256":digest(ROOT/"build/build_connected_successor.py"),"changes":["Added original distant terrain to all cardinal horizons", "Removed dominant grass/water texture modes", "Lake water extends to surrounding land without coplanar old surface"],
        "collisionAndNavigationBytesUnchanged":True,"sceneryTruth":"GENERIC decorative/unwalkable","artAcceptanceTransferred":False}
    manifest["knownLimitations"].append("Distant terrain and extended water are decorative: they grant no new walk/collision domain. Photographic foliage, final sky/atmosphere, audio and AAA dressing remain absent.")
    original.write_json(target/"manifest.json",manifest);audit=audit_connected(target/"manifest.json");original.write_json(target/"connected-exported-box-receipt.json",audit)
    original.write_json(target/"build-receipt.json",{"schemaVersion":"urai-outdoor-successor-receipt-v1","builtAt":datetime.now(timezone.utc).isoformat(),"id":row[0],"version":VERSION,"manifestSha256":digest(target/"manifest.json"),"source":manifest["successorSource"],"files":manifest["files"],"providerCalls":0,"paidCreditsSpent":0,"visualAccepted":False,"runtimeIntegrated":False,"physicalDeviceTested":False})
    return {"id":row[0],"version":VERSION,"manifestSha256":digest(target/"manifest.json"),"connectedGridRetained":audit["retainedCells"],"collisionAndNavigationBytesUnchanged":True,"visualAccepted":False}

def main():
    index=ROOT/"receipts/outdoor-successor-1.0.5-index.json"
    if index.exists():raise FileExistsError("Index exists; choose a new version")
    rows=[]
    for row in original.FAMILIES:
        if row[-1] in KINDS:
            result=build_successor(row);rows.append(result);print(json.dumps(result),flush=True)
    original.write_json(index,{"schemaVersion":"urai-outdoor-successor-index-v1","version":VERSION,"worlds":rows,"providerCalls":0,"paidCreditsSpent":0,"visualAccepted":False,"runtimeIntegrated":False})

if __name__=="__main__":main()
