#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'films'; GEN=ROOT/'image_asset_generator'; SPECS=ROOT/'multimodal/media-specifications.json'
IDS=['replay-scene-manifest','replay-timeline','replay-transition-pack','replay-narration-sync','replay-captions','replay-audio-description','replay-poster-frame','replay-thumbnail','replay-export-1080p-mp4','replay-export-1080p-webm','replay-export-720p-mp4','replay-low-bandwidth-preview']
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(cmd):
 p=subprocess.run(cmd,text=True,capture_output=True); return {'command':cmd,'exitCode':p.returncode,'stdout':p.stdout[-2000:],'stderr':p.stderr[-2000:]}
def main():
 for d in ['scripts','outputs','previews','metadata']: (OUT/d).mkdir(parents=True,exist_ok=True)
 ffmpeg=shutil.which('ffmpeg'); ffprobe=shutil.which('ffprobe')
 images=sorted(p for p in GEN.rglob('*') if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp'} and p.is_file())
 audio=sorted(p for p in ROOT.rglob('*.wav') if 'node_modules' not in p.parts and 'films' not in p.parts)
 certified=[p for p in images if (p.with_suffix(p.suffix+'.render.json')).exists()]
 blocked=[]; receipts=[]; verification=[]
 for asset_id in IDS:
  receipt={'filmId':asset_id,'status':'blocked','sourceFiles':[],'sourceChecksums':{},'ffmpegCommand':None,'ffmpegVersion':None,'ffprobeVersion':None,'output':None,'warnings':[]}
  if not ffmpeg or not ffprobe: receipt['warnings'].append('ffmpeg_or_ffprobe_unavailable')
  if not certified: receipt['warnings'].append('no_certified_visual_inputs')
  if asset_id in {'replay-audio-description','replay-export-1080p-mp4','replay-export-1080p-webm','replay-export-720p-mp4','replay-low-bandwidth-preview'} and not audio: receipt['warnings'].append('no_approved_original_audio')
  blocked.append({'filmId':asset_id,'status':'blocked','reasons':receipt['warnings'] or ['required_source_contract_not_implemented']})
  receipts.append(receipt); verification.append({'filmId':asset_id,'status':'blocked','checksExecuted':[],'reason':blocked[-1]['reasons']})
 (OUT/'assembly-receipts.jsonl').write_text(''.join(json.dumps(r,sort_keys=True)+'\n' for r in receipts))
 (OUT/'verification-results.json').write_text(json.dumps({'schemaVersion':'1.0.0','requiredOutputs':12,'createdOutputs':0,'status':'blocked','results':verification},indent=2)+'\n')
 (OUT/'metadata'/'blocked-inputs.json').write_text(json.dumps({'schemaVersion':'1.0.0','certifiedVisualsFound':len(certified),'audioFilesFound':len(audio),'ffmpeg':ffmpeg,'ffprobe':ffprobe,'items':blocked},indent=2)+'\n')
 (OUT/'checksums.sha256').write_text('')
 (OUT/'scripts'/'assemble-all.sh').write_text('#!/usr/bin/env sh\nset -eu\npython scripts/build_films.py\n')
 (OUT/'README.md').write_text('# Film assembly\n\nRun `python scripts/build_films.py`. The required matrix is the 12 film assets in `multimodal/canonical-requirements.json`. This builder is fail-closed: it does not create film files until certified visual inputs, approved original audio, FFmpeg, and ffprobe are available. Blocked receipts are evidence, not completed films.\n')
 print(json.dumps({'required':12,'created':0,'status':'blocked','certifiedVisualsFound':len(certified),'audioFilesFound':len(audio)},indent=2))
if __name__=='__main__': main()
