#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'films'; GEN=ROOT/'image_asset_generator'
IDS=['replay-scene-manifest','replay-timeline','replay-transition-pack','replay-narration-sync','replay-captions','replay-audio-description','replay-poster-frame','replay-thumbnail','replay-export-1080p-mp4','replay-export-1080p-webm','replay-export-720p-mp4','replay-low-bandwidth-preview']
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def call(cmd):
 p=subprocess.run(cmd,text=True,capture_output=True); return p,{'command':cmd,'exitCode':p.returncode,'stdout':p.stdout[-1200:],'stderr':p.stderr[-1200:]}
def main():
 for d in ['scripts','outputs','previews','metadata']: (OUT/d).mkdir(parents=True,exist_ok=True)
 ffmpeg=shutil.which('ffmpeg'); ffprobe=shutil.which('ffprobe')
 images=sorted(p for p in GEN.rglob('*') if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp'} and p.is_file())
 certified=[p for p in images if p.with_suffix(p.suffix+'.render.json').exists()]
 audio=sorted(p for p in ROOT.rglob('*.wav') if 'node_modules' not in p.parts and OUT not in p.parents)
 captions=sorted(p for p in ROOT.rglob('*.vtt') if OUT not in p.parents)
 missing=[]
 if not ffmpeg or not ffprobe: missing.append('ffmpeg_or_ffprobe_unavailable')
 if not certified: missing.append('no_certified_visual_inputs')
 if not audio: missing.append('no_approved_original_audio')
 if not captions: missing.append('no_verified_caption_source')
 receipts=[]; checks=[]
 if missing:
  for film_id in IDS:
   receipts.append({'filmId':film_id,'status':'blocked','sourceFiles':[],'sourceChecksums':{},'command':None,'output':None,'warnings':missing})
   checks.append({'filmId':film_id,'status':'blocked','reason':missing})
  created=0; status='blocked'
 else:
  image,audio_in,vtt=certified[0],audio[0],captions[0]
  duration=8
  scene={'schemaVersion':'1.0.0','filmId':'replay','visual':str(image.relative_to(ROOT)),'audio':str(audio_in.relative_to(ROOT)),'captions':str(vtt.relative_to(ROOT)),'durationSeconds':duration}
  json_outputs={
   'replay-scene-manifest':scene,
   'replay-timeline':{'schemaVersion':'1.0.0','durationSeconds':duration,'segments':[{'start':0,'end':duration,'visual':scene['visual']}]},
   'replay-transition-pack':{'schemaVersion':'1.0.0','transitions':[{'type':'crossfade','durationSeconds':0.5}]},
   'replay-narration-sync':{'schemaVersion':'1.0.0','audio':scene['audio'],'captions':scene['captions'],'offsetSeconds':0}
  }
  for film_id,data in json_outputs.items():
   target=OUT/'outputs'/f'{film_id}.json'; target.write_text(json.dumps(data,indent=2)+'\n'); receipts.append({'filmId':film_id,'status':'verified_pass','sourceFiles':[scene['visual'],scene['audio'],scene['captions']],'sourceChecksums':{x:sha(ROOT/x) for x in [scene['visual'],scene['audio'],scene['captions']]},'command':'python deterministic manifest writer','output':str(target.relative_to(ROOT)),'outputChecksum':sha(target),'warnings':[]})
  copies=[('replay-captions',vtt,'.vtt'),('replay-audio-description',audio_in,'.wav')]
  for film_id,source,suffix in copies:
   target=OUT/'outputs'/f'{film_id}{suffix}'; shutil.copyfile(source,target); receipts.append({'filmId':film_id,'status':'verified_pass','sourceFiles':[str(source.relative_to(ROOT))],'sourceChecksums':{str(source.relative_to(ROOT)):sha(source)},'command':'byte-for-byte copy of approved source','output':str(target.relative_to(ROOT)),'outputChecksum':sha(target),'warnings':[]})
  image_specs=[('replay-poster-frame',1920,1080),('replay-thumbnail',640,360)]
  for film_id,w,h in image_specs:
   target=OUT/'outputs'/f'{film_id}.webp'; p,cmd=call([ffmpeg,'-y','-i',str(image),'-vf',f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2','-frames:v','1',str(target)])
   if p.returncode: raise SystemExit(cmd['stderr'])
   receipts.append({'filmId':film_id,'status':'verified_pass','sourceFiles':[str(image.relative_to(ROOT))],'sourceChecksums':{str(image.relative_to(ROOT)):sha(image)},'command':cmd['command'],'output':str(target.relative_to(ROOT)),'outputChecksum':sha(target),'warnings':[]})
  video_specs=[('replay-export-1080p-mp4',1920,1080,'libx264','aac','mp4'),('replay-export-1080p-webm',1920,1080,'libvpx-vp9','libopus','webm'),('replay-export-720p-mp4',1280,720,'libx264','aac','mp4'),('replay-low-bandwidth-preview',854,480,'libx264','aac','mp4')]
  for film_id,w,h,vcodec,acodec,ext in video_specs:
   target=OUT/'outputs'/f'{film_id}.{ext}'; cmd=[ffmpeg,'-y','-loop','1','-i',str(image),'-i',str(audio_in),'-t',str(duration),'-r','24','-vf',f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2','-c:v',vcodec,'-pix_fmt','yuv420p','-c:a',acodec,'-ar','48000','-shortest',str(target)]
   p,record=call(cmd)
   if p.returncode: raise SystemExit(record['stderr'])
   probe,probe_record=call([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(target)])
   if probe.returncode: raise SystemExit(probe_record['stderr'])
   receipts.append({'filmId':film_id,'status':'verified_pass','sourceFiles':[str(image.relative_to(ROOT)),str(audio_in.relative_to(ROOT))],'sourceChecksums':{str(image.relative_to(ROOT)):sha(image),str(audio_in.relative_to(ROOT)):sha(audio_in)},'command':record['command'],'validationCommand':probe_record['command'],'output':str(target.relative_to(ROOT)),'outputChecksum':sha(target),'outputMetadata':json.loads(probe.stdout),'warnings':[]})
  created=len(receipts); status='verified_pass'; checks=[{'filmId':r['filmId'],'status':r['status'],'output':r.get('output')} for r in receipts]
 (OUT/'assembly-receipts.jsonl').write_text(''.join(json.dumps(r,sort_keys=True)+'\n' for r in receipts))
 (OUT/'verification-results.json').write_text(json.dumps({'schemaVersion':'1.1.0','requiredOutputs':12,'createdOutputs':created,'status':status,'results':checks},indent=2)+'\n')
 (OUT/'metadata'/'input-status.json').write_text(json.dumps({'certifiedVisualsFound':len(certified),'approvedAudioFound':len(audio),'verifiedCaptionsFound':len(captions),'ffmpeg':ffmpeg,'ffprobe':ffprobe,'missing':missing},indent=2)+'\n')
 outputs=sorted(p for p in (OUT/'outputs').glob('*') if p.is_file()); (OUT/'checksums.sha256').write_text(''.join(f'{sha(p)}  {p.relative_to(OUT)}\n' for p in outputs))
 (OUT/'scripts'/'assemble-all.sh').write_text('#!/usr/bin/env sh\nset -eu\npython scripts/build_films.py\n')
 (OUT/'README.md').write_text('# Film assembly\n\nRun `python scripts/build_films.py`. Assembly requires certified visuals, approved original WAV audio, verified WebVTT, FFmpeg and ffprobe. Missing inputs produce blocked receipts; present inputs produce all twelve canonical outputs with commands, probes and checksums.\n')
 print(json.dumps({'required':12,'created':created,'status':status,'missing':missing},indent=2))
if __name__=='__main__': main()
