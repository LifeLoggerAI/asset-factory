#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,math,sys
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; GEN=ROOT/'image_asset_generator'; OUT=ROOT/'creative-review'
sys.path.insert(0,str(GEN))
from PIL import Image,ImageDraw,ImageOps,ImageStat
EXTS={'.png','.jpg','.jpeg','.webp'}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def