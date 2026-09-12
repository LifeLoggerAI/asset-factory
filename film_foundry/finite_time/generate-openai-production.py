#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API = "https://api.openai.com/v1"
EXPECTED_SOURCE = "2f61af8442b4b20e8b0e4638ca4119a17969c6d4"
EXPECTED_SHOTS = 30

def now(): return datetime.now(timezone.utc).isoformat()
def sha256(path: Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def run(cmd:list[str], capture=True): return subprocess.run(cmd,check=True,text=True,capture_output=capture)
def curl_json(args:list[str])->dict[str,Any]:
    cp=run(['curl','--fail-with-body','--silent','--show-error',*args]); return json.loads(cp.stdout)
def create_video(key, model, size, seconds, prompt):
    return curl_json([f'{API}/videos','-H',f'Authorization: Bearer {key}','-F',f'model={model}','-F',f'size={size}','-F',f'seconds={seconds}','-F',f'prompt={prompt}'])
def wait_video(key, video_id, timeout=3600):
    start=time.monotonic()
    while True:
        data=curl_json([f'{API}/videos/{video_id}','-H',f'Authorization: Bearer {key}'])
        status=data.get('status')
        print(json.dumps({'video':video_id,'status':status,'progress':data.get('progress')}),flush=True)
        if status=='completed': return data
        if status in {'failed','cancelled'}: raise RuntimeError(f'{video_id} ended {status}: {data}')
        if time.monotonic()-start>timeout: raise TimeoutError(video_id)
        time.sleep(20)
def download_video(key, video_id, output):
    run(['curl','--fail-with-body','--location','--silent','--show-error',f'{API}/videos/{video_id}/content','-H',f'Authorization: Bearer {key}','--output',str(output)],capture=False)

def prompt_for(shot:dict[str,Any])->str:
    title=shot['title']; visual=shot['visual']; ad=shot.get('audioDescription','')
    return ("Photoreal cinematic autobiographical memory, East Texas, natural human motion, physically believable bodies and hands, "
            "natural skin and hair, lived-in practical environment, restrained motivated camera, subtle film grain, no logos, no readable brand text, "
            "no subtitles or overlays, no synthetic plastic look. Preserve autobiographical restraint; do not invent dialogue or unsupported events. "
            f"Shot: {title}. Action and composition: {visual}. Accessibility intent: {ad}. "
            "Continuous moving footage, coherent lighting and screen direction, realistic physics and temporal consistency.")

def main():
    p=argparse.ArgumentParser(); p.add_argument('--manifest',required=True); p.add_argument('--authorization',required=True); p.add_argument('--output-root',required=True); p.add_argument('--start-shot',type=int,default=1); p.add_argument('--end-shot',type=int,default=30); a=p.parse_args()
    mp,ap,out=Path(a.manifest),Path(a.authorization),Path(a.output_root); out.mkdir(parents=True,exist_ok=True); clips=out/'clips'; clips.mkdir(exist_ok=True)
    manifest=json.loads(mp.read_text()); auth=json.loads(ap.read_text()); shots=manifest.get('shots',[])
    if auth.get('sourceCommit')!=EXPECTED_SOURCE: raise ValueError('source authority drift')
    if len(shots)!=EXPECTED_SHOTS: raise ValueError('exactly 30 shots required')
    if not auth.get('release',{}).get('paidGenerationAuthorized'): raise ValueError('paid generation not authorized')
    if auth.get('release',{}).get('publicReleaseAuthorized') is not False: raise ValueError('public release must remain false')
    if auth.get('privacy',{}).get('semanticKeysOnly') is not True: raise ValueError('private reference boundary missing')
    if not (1<=a.start_shot<=a.end_shot<=30): raise ValueError('invalid shot range')
    key=os.environ.get('OPENAI_API_KEY','').strip()
    if not key: raise RuntimeError('OPENAI_API_KEY missing')
    model=os.environ.get('FINITE_TIME_VIDEO_MODEL',auth['provider']['primaryModel']).strip(); size=os.environ.get('FINITE_TIME_VIDEO_SIZE','1280x720').strip()
    receipt={'schemaVersion':'finite-time-provider-receipt-v1','sourceCommit':EXPECTED_SOURCE,'startedAt':now(),'model':model,'size':size,'providerCallsExecuted':0,'videos':[],'status':'running','publicReleaseAuthorized':False,'privateSourcePointersRetained':False}
    rp=out/'provider-receipt.json'
    try:
        for index in range(a.start_shot-1,a.end_shot):
            shot=shots[index]; seconds=str(int(shot['durationSeconds'])); created=create_video(key,model,size,seconds,prompt_for(shot)); receipt['providerCallsExecuted']+=1
            vid=created['id']; completed=wait_video(key,vid); target=clips/f"{shot['id']}.mp4"; download_video(key,vid,target)
            receipt['videos'].append({'shotId':shot['id'],'videoId':vid,'status':completed.get('status'),'model':completed.get('model',model),'seconds':completed.get('seconds',seconds),'size':completed.get('size',size),'sha256':sha256(target),'bytes':target.stat().st_size})
            rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
        receipt['status']='generated-awaiting-literal-qc'
    except Exception as exc:
        receipt['status']='failed'; receipt['error']=str(exc); raise
    finally:
        receipt['finishedAt']=now(); rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':receipt['status'],'calls':receipt['providerCallsExecuted'],'videos':len(receipt['videos'])},sort_keys=True))
if __name__=='__main__': main()
