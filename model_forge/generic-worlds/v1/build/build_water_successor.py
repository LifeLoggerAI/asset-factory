#!/usr/bin/env python3
"""Write-once lake 1.0.6: dielectric water, softer static wave roughness.

Preserves geometry and collision/navigation from 1.0.5. Supplemental room IBL
does not grant final outdoor lighting or physically certified water rendering.
"""
from datetime import datetime, timezone
import copy
import hashlib
import importlib.util
import io
from pathlib import Path
import shutil
import sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'qa'))
from audit_connected_world import audit_connected
from validate_package import load_json,validate_package
spec=importlib.util.spec_from_file_location('preserved_outdoor_water_source',ROOT/'build/build_outdoor_successor.py')
outdoor=importlib.util.module_from_spec(spec);spec.loader.exec_module(outdoor)
VERSION='1.0.6'

def water_texture(name,n):
    result=outdoor.outdoor_texture(name,n)
    if name!='water':return result
    pixels=np.asarray(Image.open(io.BytesIO(result[2])).convert('RGB')).copy()
    pixels[:,:,1]=np.maximum(pixels[:,:,1],round(.42*255))
    pixels[:,:,2]=0  # lake water is dielectric, not a partially metallic conductor
    output=io.BytesIO();Image.fromarray(pixels).save(output,format='PNG',compress_level=9)
    return [result[0],result[1],output.getvalue()]

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    row=next(r for r in outdoor.original.FAMILIES if r[-1]=='lake')
    source=ROOT/'packages'/row[0]/'1.0.5';target=source.parent/VERSION
    if target.exists():raise FileExistsError('Existing version is retained: '+str(target))
    if not validate_package(source/'manifest.json')['passed']:raise ValueError('Invalid predecessor')
    manifest=copy.deepcopy(load_json(source/'manifest.json'));target.mkdir(parents=True)
    for record in manifest['files']:
        if record['role']!='geometry':shutil.copyfile(source/record['path'],target/record['path'])
    original=outdoor.original;previous=original.texture;original.texture=water_texture
    try:
        for profile,(level,*_) in original.PROFILES.items():
            scene=outdoor.outdoor_scene(row,profile);data,measured=original.glb_bytes(scene)
            (target/f'lod{level}.glb').write_bytes(data);manifest['profiles'][profile]['measuredStatic']=measured
    finally:original.texture=previous
    for record in manifest['files']:record['sha256']=digest(target/record['path']);record['bytes']=(target/record['path']).stat().st_size
    manifest.update({'version':VERSION,'status':'NEEDS_REWORK','bounds':manifest['profiles']['desktop']['measuredStatic']['bounds']})
    manifest['successorSource']={'predecessorVersion':'1.0.5','predecessorManifestSha256':digest(source/'manifest.json'),'waterSuccessorSha256':digest(Path(__file__)),
        'outdoorSuccessorSha256':digest(ROOT/'build/build_outdoor_successor.py'),'changes':['Water metalness texture is zero (dielectric)','Static roughness floor .42 softens harsh mirror patches'],
        'geometryChanged':False,'collisionAndNavigationBytesUnchanged':True,'artAcceptanceTransferred':False}
    manifest['knownLimitations'].append('Static dielectric PBR water; final outdoor IBL/sky, wave motion, shore interaction, refraction and device/human review remain unverified.')
    original.write_json(target/'manifest.json',manifest);audit=audit_connected(target/'manifest.json');original.write_json(target/'connected-exported-box-receipt.json',audit)
    original.write_json(target/'build-receipt.json',{'schemaVersion':'urai-dielectric-water-successor-receipt-v1','builtAt':datetime.now(timezone.utc).isoformat(),'manifestSha256':digest(target/'manifest.json'),
        'source':manifest['successorSource'],'files':manifest['files'],'providerCalls':0,'paidCreditsSpent':0,'runtimeIntegrated':False,'visualAccepted':False,'physicalDeviceTested':False})
    print(__import__('json').dumps({'id':row[0],'version':VERSION,'manifestSha256':digest(target/'manifest.json'),'cells':audit['retainedCells'],'visualAccepted':False}))

if __name__=='__main__':main()
