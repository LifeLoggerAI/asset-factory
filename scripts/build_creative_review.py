#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,sys
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
GEN=ROOT/'image_asset_generator'
OUT=ROOT/'creative-review'
sys.path.insert(0,str(GEN))
try:
 from PIL import Image,ImageStat
except Exception as exc: raise SystemExit(f'Pillow required: {exc}')
EXTS={'.png','.jpg','.jpeg','.webp'}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def score_image(p):
 r={'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p),'warnings':[]}
 try:
  with Image.open(p) as im:
   im.load(); r.update(width=im.width,height=im.height,mode=im.mode,format=im.format,aspectRatio=round(im.width/im.height,6))
   rgb=im.convert('RGB'); stat=ImageStat.Stat(rgb.resize((64,64)))
   mean=sum(stat.mean)/3; spread=sum(stat.var)/3
   if mean<4 or mean>251: r['warnings'].append('near_blank_luminance')
   if spread<2: r['warnings'].append('low_variance_possible_blank')
   if 'A' in im.getbands():
    alpha=im.getchannel('A').resize((64,64)); extrema=alpha.getextrema(); r['alphaRange']=list(extrema)
    if extrema==(0,0): r['warnings'].append('fully_transparent')
   border=rgb.resize((64,64)); px=border.load(); samples=[]
   for x in range(64): samples.extend([px[x,0],px[x,63]])
   for y in range(1,63): samples.extend([px[0,y],px[63,y]])
   dark=sum(1 for v in samples if sum(v)/3<6)/len(samples)
   if dark>.9: r['warnings'].append('possible_black_border')
   r['technicalScore']=max(0,100-20*len(r['warnings']))
 except Exception as exc:
  r.update(error=str(exc),technicalScore=0); r['warnings'].append('unreadable')
 return r
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 files=sorted(p for p in GEN.rglob('*') if p.is_file() and p.suffix.lower() in EXTS)
 records=[score_image(p) for p in files]; by_sha=defaultdict(list)
 for r in records: by_sha[r['sha256']].append(r['path'])
 duplicates=[v for v in by_sha.values() if len(v)>1]
 rejections=[]
 for r in records:
  if r.get('error') or r['technicalScore']==0: rejections.append({'path':r['path'],'severity':'reject','reasons':r['warnings']})
  elif r['warnings']: rejections.append({'path':r['path'],'severity':'review','reasons':r['warnings']})
 groups=defaultdict(list)
 for r in records:
  parts=Path(r['path']).parts; key=next((x for x in parts if x in {'v1','v2','v3','v4','v5','xr'}),'unclassified'); groups[key].append(r['path'])
 manifest={'schemaVersion':'1.0.0','root':str(GEN.relative_to(ROOT)),'artifactCount':len(records),'groups':dict(sorted(groups.items())),'artifacts':records}
 scores={'schemaVersion':'1.0.0','heuristicOnly':True,'formula':'100 minus 20 points per detected technical warning; zero when unreadable','artifacts':[{'path':r['path'],'score':r['technicalScore'],'warnings':r['warnings']} for r in records],'duplicateSets':duplicates}
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (OUT/'quality-scores.json').write_text(json.dumps(scores,indent=2)+'\n')
 (OUT/'rejections.json').write_text(json.dumps({'schemaVersion':'1.0.0','items':rejections},indent=2)+'\n')
 receipts=OUT/'provider-receipts.jsonl'; receipts.write_text('')
 for meta in sorted(GEN.rglob('*.render.json')):
  try:
   data=json.loads(meta.read_text()); data['sourceReceipt']=str(meta.relative_to(ROOT)); receipts.open('a').write(json.dumps(data,sort_keys=True)+'\n')
  except Exception: pass
 (OUT/'reviewer-checklist.md').write_text('# Reviewer checklist\n\n- [ ] Open every grouped preview/contact sheet when generated.\n- [ ] Review all items in `rejections.json`.\n- [ ] Confirm brand, route consistency, text legibility, safe areas, and absence of unwanted likeness.\n- [ ] Record approve/reject decisions outside heuristic scores.\n')
 (OUT/'README.md').write_text('# Creative review package\n\nRun `python scripts/build_creative_review.py` followed by `python scripts/build_contact_sheets.py`. Scores are technical heuristics, not human aesthetic approval.\n')
 print(json.dumps({'artifacts':len(records),'rejections':len(rejections),'duplicateSets':len(duplicates)},indent=2))
if __name__=='__main__': main()
