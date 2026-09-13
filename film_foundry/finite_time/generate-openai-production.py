#!/usr/bin/env python3
from __future__ import annotations

import argparse, hashlib, json, os, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API = "https://api.openai.com/v1"
EXPECTED_SOURCE = "2f61af8442b4b20e8b0e4638ca4119a17969c6d4"
EXPECTED_SHOTS = 30
EXPECTED_SECONDS = 180
ALLOWED_MODELS = {"sora-2", "sora-2-pro"}
SCRIPT_DIR = Path(__file__).resolve().parent
REALISM_CONTRACT_PATH = SCRIPT_DIR / "realism-contract.json"
REALISM_OVERRIDES_PATH = SCRIPT_DIR / "realism-shot-overrides.json"
LIKENESS_PERIOD_CONTRACT_PATH = SCRIPT_DIR / "likeness-period-contract.json"
IDENTIFIABLE_CHARACTER_SHOTS = {
    "ft-fl-001", "ft-fl-002", "ft-fl-003", "ft-fl-004", "ft-fl-005", "ft-fl-006",
    "ft-fl-009", "ft-fl-010", "ft-fl-011", "ft-fl-016", "ft-fl-018", "ft-fl-020",
    "ft-fl-021", "ft-fl-022", "ft-fl-023", "ft-fl-024", "ft-fl-029", "ft-fl-030"
}


def now(): return datetime.now(timezone.utc).isoformat()
def sha256(path: Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def run(cmd:list[str], capture=True): return subprocess.run(cmd,check=True,text=True,capture_output=capture)
def curl_json(args:list[str])->dict[str,Any]:
    cp=run(['curl','--fail-with-body','--silent','--show-error',*args]); return json.loads(cp.stdout)
def create_video(key, model, size, seconds, prompt, reference):
    args=[f'{API}/videos','-H',f'Authorization: Bearer {key}','-F',f'model={model}','-F',f'size={size}','-F',f'seconds={seconds}','-F',f'prompt={prompt}']
    if reference is not None: args.extend(['-F',f'input_reference=@{reference}'])
    return curl_json(args)
def wait_video(key, video_id, timeout=3600):
    start=time.monotonic()
    while True:
        data=curl_json([f'{API}/videos/{video_id}','-H',f'Authorization: Bearer {key}']); status=data.get('status')
        print(json.dumps({'video':video_id,'status':status,'progress':data.get('progress')}),flush=True)
        if status=='completed': return data
        if status in {'failed','cancelled'}: raise RuntimeError(f'{video_id} ended {status}: {data}')
        if time.monotonic()-start>timeout: raise TimeoutError(video_id)
        time.sleep(20)
def download_video(key, video_id, output):
    run(['curl','--fail-with-body','--location','--silent','--show-error',f'{API}/videos/{video_id}/content','-H',f'Authorization: Bearer {key}','--output',str(output)],capture=False)
def choose_source_duration(editorial_seconds):
    for candidate in (4,8,12):
        if editorial_seconds<=candidate: return candidate
    raise ValueError(f'editorial shot {editorial_seconds}s exceeds one supported source clip')


def load_realism_authority():
    contract=json.loads(REALISM_CONTRACT_PATH.read_text())
    overrides=json.loads(REALISM_OVERRIDES_PATH.read_text())
    periods=json.loads(LIKENESS_PERIOD_CONTRACT_PATH.read_text())
    if contract.get('schemaVersion')!='finite-time-realism-v1': raise ValueError('realism contract schema mismatch')
    required_true=('ageContinuityRequired','roomContinuityRequired','periodObjectsRequired','literalQcRequired')
    if contract.get('genericFamilySubstitution') is not False or any(contract.get(k) is not True for k in required_true):
        raise ValueError('realism contract required guarantees missing')
    cat=contract.get('cat',{})
    if cat.get('color')!='white' or cat.get('sameCatAcrossShots') is not True or cat.get('tvType')!='period-deep-television':
        raise ValueError('cat continuity authority mismatch')
    if cat.get('shots')!=['ft-fl-013','ft-fl-014']:
        raise ValueError('cat continuity shot authority mismatch')
    if overrides.get('schemaVersion')!='finite-time-realism-shot-overrides-v1':
        raise ValueError('realism shot override schema mismatch')
    shot_overrides=overrides.get('shots',{})
    if set(shot_overrides)!={'ft-fl-013','ft-fl-014'}:
        raise ValueError('realism shot override authority mismatch')
    for sid, spec in shot_overrides.items():
        for key in ('title','visual','audioDescription'):
            if not isinstance(spec.get(key),str) or not spec[key].strip():
                raise ValueError(f'{sid}: incomplete realism override')
    if periods.get('schemaVersion')!='finite-time-likeness-period-v1':
        raise ValueError('likeness period contract schema mismatch')
    if periods.get('missingReferenceBehavior')!='stage-shot-do-not-substitute':
        raise ValueError('likeness missing-reference behavior mismatch')
    if periods.get('prohibitAge19FallbackForChildhood') is not True:
        raise ValueError('likeness age fallback guard missing')
    likeness_periods=periods.get('shots',{})
    if not likeness_periods or not set(likeness_periods).issubset(IDENTIFIABLE_CHARACTER_SHOTS):
        raise ValueError('likeness period shot authority mismatch')
    return contract,shot_overrides,likeness_periods


def validate_reference_period(sid, spec, likeness_periods):
    period=likeness_periods.get(sid)
    if period is None:
        return
    if not spec:
        raise RuntimeError(f'{sid}: appropriate period reference unavailable; stage shot instead of substituting a generic person')
    keys=spec.get('semanticReferenceKeys') or []
    if not isinstance(keys,list):
        raise RuntimeError(f'{sid}: semantic reference keys must be a list')
    younger_period = period.startswith('childhood') or period.startswith('junior-high') or period.startswith('school-age')
    if younger_period and any('AGE19' in str(key).upper() for key in keys):
        raise RuntimeError(f'{sid}: age-19 likeness reference cannot authorize {period}; stage until an appropriate period reference is available')


def build_prompt(shot, editorial_seconds, has_reference, realism=None):
    if realism is None:
        realism,_,_=load_realism_authority()
    scene = (
        f"MANDATORY SHOT {shot['id']} ({editorial_seconds}s editorial). "
        f"Title: {shot.get('title','')}. "
        f"Required visual action: {shot.get('visual','')}. "
        f"Accessibility intent: {shot.get('audioDescription','')}. "
        "This exact subject and action are the shot. Do not replace them with a generic adult portrait, pickup-truck portrait, porch portrait, or unrelated rural tableau. "
    )
    identity = (
        "A supplied reference, when present, is identity/appearance authority only: preserve recognizable facial structure, age cues, hair, body proportions and grounded family resemblance while creating new continuous action. "
        if has_reference else
        "Use natural non-celebrity casting only when this shot explicitly requires people; do not introduce people, vehicles, animals, or props that are absent from the required visual action. "
    )
    continuity = (
        "Memory-specific realism is mandatory: never substitute a generic family or generic memory. Preserve age, room and period-object continuity where the shot requires them. "
    )
    if shot['id'] in set(realism['cat']['shots']):
        continuity += "This is the same white family cat, same room, and same older deep television across the connected cat shots; preserve believable cat and fall physics exactly. "
    craft = (
        "FINITE TIME autobiographical prestige short film; real moving cinema, never a slideshow, photo montage, Ken Burns move, frozen portrait, parallax card, or still-image presentation. "
        "Photoreal East Texas memory-realism with believable body mechanics, micro-expressions where relevant, natural fabric/environment motion, real depth and coherent lens/camera behavior. "
        "Keep geography, lighting and animal/water/vehicle physics credible. No text overlays, readable brands, synthetic plastic AI look, morphing faces, extra fingers, identity drift, invented dialogue, or unsupported event. "
        "Deliver the mandatory shot as a believable live-action moment photographed by a real cinema camera on location."
    )
    prompt = scene + identity + continuity + craft
    if len(prompt) > 1800: raise ValueError(f"{shot['id']}: provider prompt exceeds bounded length")
    return prompt
def load_reference_map(path):
    if path is None: return {}
    data=json.loads(path.read_text())
    if data.get('schemaVersion')!='finite-time-private-reference-map-v1': raise ValueError('private reference map schema mismatch')
    return data.get('shots',{})


def main():
    p=argparse.ArgumentParser(); p.add_argument('--manifest',required=True); p.add_argument('--edit-plan',required=True); p.add_argument('--authorization',required=True); p.add_argument('--private-reference-map'); p.add_argument('--output-root',required=True); p.add_argument('--start-shot',type=int,default=1); p.add_argument('--end-shot',type=int,default=30); args=p.parse_args()
    story_path,edit_path,auth_path=Path(args.manifest),Path(args.edit_plan),Path(args.authorization)
    story=json.loads(story_path.read_text()); edit=json.loads(edit_path.read_text()); auth=json.loads(auth_path.read_text())
    realism,shot_overrides,likeness_periods=load_realism_authority()
    if auth.get('sourceCommit')!=EXPECTED_SOURCE: raise ValueError('source authority drift')
    if not auth.get('release',{}).get('paidGenerationAuthorized'): raise ValueError('paid generation not authorized')
    if auth.get('release',{}).get('publicReleaseAuthorized') is not False: raise ValueError('public release must remain false')
    if auth.get('privacy',{}).get('semanticKeysOnly') is not True: raise ValueError('private reference boundary missing')
    if auth.get('creativeStandard',{}).get('slideshowTreatmentProhibited') is not True: raise ValueError('moving-cinema standard missing')
    shots=story.get('shots',[])
    if len(shots)!=EXPECTED_SHOTS or not (1<=args.start_shot<=args.end_shot<=EXPECTED_SHOTS): raise ValueError('shot authority mismatch')
    durations=edit.get('shotDurations',{})
    if set(durations)!={s['id'] for s in shots} or sum(int(v) for v in durations.values())!=EXPECTED_SECONDS: raise ValueError('certified edit-plan mismatch')
    key=os.environ.get('OPENAI_API_KEY','').strip()
    if not key: raise RuntimeError('OPENAI_API_KEY missing')
    model=os.environ.get('FINITE_TIME_VIDEO_MODEL',auth['provider']['primaryModel']).strip()
    if model not in ALLOWED_MODELS: raise ValueError('unsupported video model')
    size=os.environ.get('FINITE_TIME_VIDEO_SIZE','1280x720').strip(); refs=load_reference_map(Path(args.private_reference_map) if args.private_reference_map else None)
    out=Path(args.output_root); clips=out/'clips'; clips.mkdir(parents=True,exist_ok=True); rp=out/'provider-receipt.json'
    receipt={'schemaVersion':'finite-time-provider-receipt-v2','sourceCommit':EXPECTED_SOURCE,'startedAt':now(),'model':model,'size':size,'providerCallsExecuted':0,'generatedSeconds':0,'videos':[],'status':'running','publicReleaseAuthorized':False,'privateSourcePointersRetained':False,'storyManifestSha256':sha256(story_path),'editPlanSha256':sha256(edit_path),'authorizationSha256':sha256(auth_path),'realismContractSha256':sha256(REALISM_CONTRACT_PATH),'realismOverridesSha256':sha256(REALISM_OVERRIDES_PATH),'likenessPeriodContractSha256':sha256(LIKENESS_PERIOD_CONTRACT_PATH)}
    try:
        for index in range(args.start_shot-1,args.end_shot):
            shot=shots[index]; sid=shot['id']; editorial=int(durations[sid]); source=choose_source_duration(editorial); spec=refs.get(sid); reference=None
            effective_shot={**shot,**shot_overrides.get(sid,{})}
            if sid in IDENTIFIABLE_CHARACTER_SHOTS and not spec: raise RuntimeError(f'{sid}: provenance-mapped private reference required before provider submission')
            validate_reference_period(sid,spec,likeness_periods)
            if spec:
                if spec.get('clearedForProviderSubmission') is not True: raise RuntimeError(f'{sid}: private reference not cleared')
                raw=spec.get('path')
                if not raw: raise RuntimeError(f'{sid}: private reference has no materialized path')
                reference=Path(raw)
                if not reference.is_file(): raise RuntimeError(f'{sid}: materialized private reference missing')
            created=create_video(key,model,size,source,build_prompt(effective_shot,editorial,reference is not None,realism),reference); receipt['providerCallsExecuted']+=1; receipt['generatedSeconds']+=source
            vid=created['id']; completed=wait_video(key,vid); target=clips/f'{sid}.mp4'; download_video(key,vid,target)
            receipt['videos'].append({'shotId':sid,'videoId':vid,'status':completed.get('status'),'model':completed.get('model',model),'editorialSeconds':editorial,'generatedSeconds':source,'size':completed.get('size',size),'referenceUsed':reference is not None,'sha256':sha256(target),'bytes':target.stat().st_size,'acceptanceStatus':'awaiting-literal-visual-qc'})
            rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
        receipt['status']='generated-awaiting-literal-qc'
    except Exception as exc:
        receipt['status']='failed'; receipt['error']=str(exc); raise
    finally:
        receipt['finishedAt']=now(); rp.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':receipt['status'],'calls':receipt['providerCallsExecuted'],'generatedSeconds':receipt['generatedSeconds'],'videos':len(receipt['videos'])},sort_keys=True))
if __name__=='__main__': main()
