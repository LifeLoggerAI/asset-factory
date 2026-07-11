#!/usr/bin/env python3
from __future__ import annotations
import json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'creative-review'; PREV=OUT/'previews'

def main():
 manifest=json.loads((OUT/'manifest.json').read_text())
 PREV.mkdir(parents=True,exist_ok=True)
 made=[]
 for group,paths in sorted(manifest.get('groups',{}).items()):
  items=[]
  for rel in paths:
   p=ROOT/rel
   try:
    with Image.open(p) as im: items.append((rel,im.convert('RGB').copy()))
   except Exception: pass
  if not items: continue
  cols=4; cell=(320,220); rows=math.ceil(len(items)/cols)
  sheet=Image.new('RGB',(cols*cell[0],rows*cell[1]),'white'); draw=ImageDraw.Draw(sheet)
  for i,(rel,im) in enumerate(items):
   x=(i%cols)*cell[0]; y=(i//cols)*cell[1]
   thumb=ImageOps.contain(im,(300,170)); sheet.paste(thumb,(x+10,y+10))
   draw.text((x+10,y+185),Path(rel).name[:44],fill='black')
  target=PREV/f'{group}-contact-sheet.png'; sheet.save(target,optimize=True); made.append(str(target.relative_to(ROOT)))
 (OUT/'contact-sheets.json').write_text(json.dumps({'schemaVersion':'1.0.0','generated':made},indent=2)+'\n')
 print(json.dumps({'contactSheets':len(made)},indent=2))
if __name__=='__main__': main()
