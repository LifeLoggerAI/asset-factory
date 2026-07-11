#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; GEN=ROOT/'image_asset_generator'; OUT=ROOT/'accessibility'
sys.path.insert(0,str(GEN))
import canonical_release_manifests

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def cue_seconds(t):
 m=re.fullmatch(r'(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})',t.strip())
 if not m: raise ValueError(f'invalid VTT time {t}')
 h=int(m.group(1) or 0); return h*3600+int(m.group(2))*60+int(m.group(3))+int(m.group(4))/1000
def validate_vtt(p):
 text=p.read_text(encoding='utf-8'); errors=[]
 if not text.lstrip().startswith('WEBVTT'): errors.append('missing_webvtt_header')
 last=0.0
 for line in text.splitlines():
  if '-->' not in line: continue
  a,b=[x.strip().split()[0] for x in line.split('-->',1)]
  try:
   start,end=cue_seconds(a),cue_seconds(b)
   if end<=start: errors.append('non_positive_cue')
   if start<last: errors.append('overlap_or_out_of_order')
   last=max(last,end)
  except ValueError as exc: errors.append(str(exc))
 return {'path':str(p.relative_to(ROOT)),'sha256':sha(p),'valid':not errors,'errors':errors,'lastCueSeconds':last}
def main():
 for d in ['captions','transcripts','reduced-motion','silent-fallbacks']: (OUT/d).mkdir(parents=True,exist_ok=True)
 assets=[]
 for version in ('v1','v2','v3','v4','v5'):
  path=canonical_release_manifests.build(version)
  for e in json.loads(path.read_text()):
   name=str(e.get('name','unnamed')); category=str(e.get('category','visual')).replace('_',' ')
   alt=f"URAI {category} visual for {name.replace('_',' ')}."
   assets.append({'assetId':name,'version':version,'sourceManifest':str(path.relative_to(ROOT)),'altText':alt[:180],'source':'manifest identifiers','confidence':'medium','humanReviewRequired':True})
 controls={'schemaVersion':'1.0.0','defaults':{'autoplay':False,'mutedByDefault':False,'pauseAvailable':True,'volumeAvailable':True,'captionsAvailableWhenVerified':True,'reducedMotionRespectsPreference':True},'assets':[]}
 fallbacks=[]
 for a in assets:
  controls['assets'].append({'assetId':a['assetId'],'essentialAudio':False,'captionStatus':'not_applicable_visual_only','transcriptStatus':'not_applicable_visual_only'})
  fallbacks.append({'assetId':a['assetId'],'strategy':'static_exact_asset','status':'completed_unverified_external','note':'Human review must confirm essential meaning remains without motion or audio.'})
 vtts=[validate_vtt(p) for p in sorted(ROOT.rglob('*.vtt')) if OUT not in p.parents]
 validation={'schemaVersion':'1.0.0','status':'verified_pass' if all(x['valid'] for x in vtts) else 'verified_fail','captionFilesChecked':len(vtts),'captionResults':vtts,'inventedSpeech':False,'automaticChecks':['WebVTT header','cue syntax','positive duration','cue order'],'humanChecksRequired':['caption accuracy','reading speed','speaker identification','audio description quality','flash and motion comfort']}
 (OUT/'alt-text-manifest.json').write_text(json.dumps({'schemaVersion':'1.0.0','assets':assets},indent=2)+'\n')
 (OUT/'audio-controls.json').write_text(json.dumps(controls,indent=2)+'\n')
 (OUT/'reduced-motion'/'manifest.json').write_text(json.dumps({'schemaVersion':'1.0.0','items':fallbacks},indent=2)+'\n')
 (OUT/'silent-fallbacks'/'manifest.json').write_text(json.dumps({'schemaVersion':'1.0.0','items':fallbacks},indent=2)+'\n')
 (OUT/'validation-results.json').write_text(json.dumps(validation,indent=2)+'\n')
 (OUT/'README.md').write_text('# Accessibility media\n\nRun `python scripts/build_accessibility_media.py`. No speech is invented. Captions/transcripts are produced only from verified source text or audio evidence. Alt text is identifier-derived and requires human review. Reduced-motion and silent-fallback manifests are readiness contracts until rendered media exists.\n')
 print(json.dumps({'altTextRecords':len(assets),'vttChecked':len(vtts),'status':validation['status']},indent=2))
if __name__=='__main__': main()
