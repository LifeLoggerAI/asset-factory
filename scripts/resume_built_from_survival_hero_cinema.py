#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API='https://api.openai.com/v1'
EXPECTED_PROGRAM_REPOSITORY='LifeLoggerAI/urai-studio'
EXPECTED_PROGRAM_SHA='802f909ecad2bd000e4c8011a14bc3340fe88950'
EXPECTED_PRIOR_RUN=33237442786
EXPECTED_PRIOR_ARTIFACT=9710419037
EXPECTED_ORIGINAL_AUTH_COMMIT='a2aac0f4d1d35bdd7c07add8e195597fbe7bb0fd'
EXPECTED_GEN01_ID='video_6a927644a858819184b9ab460ce9e0a00b8ca47e894f0559'
EXPECTED_GEN02_ID='video_6a9276ec7e488193a7501cd2ae2aeac40478f6bc6ff28d70'
EXPECTED_GEN01_SHA='06497c426b14035b93d156a1b105c0b6dab9aea1c35c121d595af867eaf1e3d0'
MAX_LIFETIME_CREATE_CALLS=5
PRIOR_CREATE_CALLS=2
MAX_NEW_CREATE_CALLS=3
MAX_RESERVED_SPEND_USD='8.00'

def now(): return datetime.now(timezone.utc).isoformat()
def sha256(path: Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
def run(cmd:list[str],capture=True): return subprocess.run(cmd,check=True,text=True,capture_output=capture)
def curl_json(args:list[str]):
    p=run(['curl','--fail-with-body','--silent','--show-error',*args]); return json.loads(p.stdout)
def poll_existing(api_key:str, video_id:str, timeout_seconds=3600):
    started=time.monotonic(); transient=0
    while True:
        try:
            data=curl_json([f'{API}/videos/{video_id}','-H',f'Authorization: Bearer {api_key}']); transient=0
        except subprocess.CalledProcessError as exc:
            transient+=1
            if transient>6: raise RuntimeError(f'existing video status poll failed after bounded transport retries: {video_id}') from exc
            time.sleep(min(10*transient,30)); continue
        status=str(data.get('status') or '')
        print(json.dumps({'video':video_id,'status':status,'progress':data.get('progress'),'recoveredExisting':True}),flush=True)
        if status=='completed': return data
        if status in {'failed','cancelled'}: raise RuntimeError(f'existing video {video_id} ended with status {status}; replacement generation is not authorized')
        if time.monotonic()-started>timeout_seconds: raise TimeoutError(f'existing video {video_id} timed out; replacement generation is not authorized')
        time.sleep(20)
def create_video_once(api_key,model,size,seconds,prompt):
    return curl_json([f'{API}/videos','-H',f'Authorization: Bearer {api_key}','-F',f'model={model}','-F',f'size={size}','-F',f'seconds={seconds}','-F',f'prompt={prompt}'])
def wait_new(api_key,video_id,timeout_seconds=3600):
    started=time.monotonic(); transient=0
    while True:
        try:
            data=curl_json([f'{API}/videos/{video_id}','-H',f'Authorization: Bearer {api_key}']); transient=0
        except subprocess.CalledProcessError as exc:
            transient+=1
            if transient>6: raise RuntimeError(f'new video status poll failed after bounded transport retries: {video_id}') from exc
            time.sleep(min(10*transient,30)); continue
        status=str(data.get('status') or '')
        print(json.dumps({'video':video_id,'status':status,'progress':data.get('progress')}),flush=True)
        if status=='completed': return data
        if status in {'failed','cancelled'}: raise RuntimeError(f'video {video_id} ended with status {status}; generation retry is not authorized')
        if time.monotonic()-started>timeout_seconds: raise TimeoutError(f'video {video_id} timed out; generation retry is not authorized')
        time.sleep(20)
def download_video(api_key,video_id,output):
    run(['curl','--fail-with-body','--location','--silent','--show-error','--retry','4','--retry-delay','5','--retry-all-errors',f'{API}/videos/{video_id}/content','-H',f'Authorization: Bearer {api_key}','--output',str(output)],capture=False)
def ffprobe(path):
    return json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,duration','-show_entries','format=duration,size','-of','json',str(path)]).stdout)
def make_reel(clips,output):
    concat=output.with_suffix('.txt'); concat.write_text(''.join(f"file '{p.resolve().as_posix()}'\n" for p in clips),encoding='utf-8')
    run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy',str(output)],capture=False)
def clip_entry(shot,video_id,completed,path,manifest,recovered):
    return {'shotId':shot['id'],'name':shot['name'],'classification':shot['classification'],'targetEditorialDurationSeconds':shot['targetEditorialDurationSeconds'],'sourceClipSecondsRequested':manifest['secondsPerSourceClip'],'videoId':video_id,'status':completed.get('status','completed'),'model':completed.get('model',manifest['videoModel']),'sizeRequested':manifest['videoSize'],'path':path.as_posix(),'sha256':sha256(path),'bytes':path.stat().st_size,'probe':ffprobe(path),'recoveredExistingProviderJob':recovered}
def validate(manifest,auth,manifest_path):
    assert manifest['programAuthorityRepository']==EXPECTED_PROGRAM_REPOSITORY
    assert manifest['programAuthoritySha']==EXPECTED_PROGRAM_SHA
    assert [s['id'] for s in manifest['shots']]==['GEN-01','GEN-02','GEN-03','GEN-04','GEN-05']
    required={'mode':'resume-existing-generation','programAuthorityRepository':EXPECTED_PROGRAM_REPOSITORY,'programAuthoritySha':EXPECTED_PROGRAM_SHA,'manifestPath':manifest_path.as_posix(),'originalAuthorizationCommit':EXPECTED_ORIGINAL_AUTH_COMMIT,'priorRunId':EXPECTED_PRIOR_RUN,'priorArtifactId':EXPECTED_PRIOR_ARTIFACT,'maximumProviderCalls':MAX_LIFETIME_CREATE_CALLS,'providerCreateCallsPreviouslyExecuted':PRIOR_CREATE_CALLS,'maximumNewProviderCalls':MAX_NEW_CREATE_CALLS,'maximumReservedCostUsd':MAX_RESERVED_SPEND_USD,'automaticRetryAuthorized':False,'generationRetryAuthorized':False,'remixAuthorized':False,'publicReleaseAuthorized':False,'privateReviewAuthorized':True,'editorialPromotionAuthorized':False}
    for k,v in required.items():
        if auth.get(k)!=v: raise ValueError(f'resume authorization drift: {k}')
    jobs=auth.get('existingProviderJobs') or {}
    if jobs.get('GEN-01')!=EXPECTED_GEN01_ID or jobs.get('GEN-02')!=EXPECTED_GEN02_ID: raise ValueError('existing provider job identity drift')
    return manifest['shots']
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--manifest',required=True); ap.add_argument('--authorization',required=True); ap.add_argument('--prior-root',required=True); ap.add_argument('--output-root',required=True); args=ap.parse_args()
    mp,apath,prior,out=map(Path,[args.manifest,args.authorization,args.prior_root,args.output_root]); clips=out/'clips'; clips.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(mp.read_text()); auth=json.loads(apath.read_text()); shots=validate(manifest,auth,mp)
    key=os.environ.get('OPENAI_API_KEY','').strip()
    if not key: raise RuntimeError('OPENAI_API_KEY missing')
    receipt={'schemaVersion':'1.1.0','projectId':manifest['projectId'],'programAuthorityRepository':EXPECTED_PROGRAM_REPOSITORY,'programAuthoritySha':EXPECTED_PROGRAM_SHA,'mode':'resume-existing-generation','startedAt':now(),'manifestPath':mp.as_posix(),'manifestSha256':sha256(mp),'authorizationPath':apath.as_posix(),'authorizationSha256':sha256(apath),'priorRunId':EXPECTED_PRIOR_RUN,'priorArtifactId':EXPECTED_PRIOR_ARTIFACT,'providerCallsAuthorized':MAX_LIFETIME_CREATE_CALLS,'providerCreateCallsPreviouslyExecuted':PRIOR_CREATE_CALLS,'providerCreateCallsExecutedThisRun':0,'providerCreateCallsLifetime':PRIOR_CREATE_CALLS,'maximumNewProviderCalls':MAX_NEW_CREATE_CALLS,'maximumReservedCostUsd':MAX_RESERVED_SPEND_USD,'automaticRetryAuthorized':False,'generationRetryAuthorized':False,'statusPollingTransportRetryAuthorized':True,'remixAuthorized':False,'publicReleaseAuthorized':False,'privateReviewAuthorized':True,'editorialPromotionAuthorized':False,'generatedImageryIsRecreation':True,'clips':[],'status':'running'}
    rp=out/'hero-cinema-receipt.json'; paths=[]
    try:
        gen01_src=prior/'clips'/'GEN-01.mp4'
        if not gen01_src.is_file() or sha256(gen01_src)!=EXPECTED_GEN01_SHA: raise RuntimeError('prior GEN-01 immutable artifact identity mismatch')
        gen01=clips/'GEN-01.mp4'; gen01.write_bytes(gen01_src.read_bytes())
        receipt['clips'].append(clip_entry(shots[0],EXPECTED_GEN01_ID,{'status':'completed'},gen01,manifest,True)); paths.append(gen01)
        completed2=poll_existing(key,EXPECTED_GEN02_ID); gen02=clips/'GEN-02.mp4'; download_video(key,EXPECTED_GEN02_ID,gen02)
        receipt['clips'].append(clip_entry(shots[1],EXPECTED_GEN02_ID,completed2,gen02,manifest,True)); paths.append(gen02); rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
        for shot in shots[2:]:
            if receipt['providerCreateCallsExecutedThisRun']>=MAX_NEW_CREATE_CALLS: raise RuntimeError('new provider create-call ceiling reached')
            created=create_video_once(key,str(manifest['videoModel']),str(manifest['videoSize']),str(manifest['secondsPerSourceClip']),str(shot['prompt']))
            receipt['providerCreateCallsExecutedThisRun']+=1; receipt['providerCreateCallsLifetime']=PRIOR_CREATE_CALLS+receipt['providerCreateCallsExecutedThisRun']
            video_id=str(created['id']); completed=wait_new(key,video_id); path=clips/f"{shot['id']}.mp4"; download_video(key,video_id,path)
            receipt['clips'].append(clip_entry(shot,video_id,completed,path,manifest,False)); paths.append(path); rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
        if receipt['providerCreateCallsExecutedThisRun']!=3 or receipt['providerCreateCallsLifetime']!=5 or len(receipt['clips'])!=5: raise RuntimeError('bounded resume result count mismatch')
        reel=out/'hero-cinema-private-review-reel.mp4'; make_reel(paths,reel); receipt['reviewReel']={'path':reel.as_posix(),'sha256':sha256(reel),'bytes':reel.stat().st_size}; receipt['status']='passed'
    except Exception as exc:
        receipt['status']='failed'; receipt['error']=str(exc); raise
    finally:
        receipt['finishedAt']=now(); rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':receipt['status'],'newCreateCalls':receipt['providerCreateCallsExecutedThisRun'],'lifetimeCreateCalls':receipt['providerCreateCallsLifetime'],'clips':len(receipt['clips'])},sort_keys=True))
if __name__=='__main__': main()
