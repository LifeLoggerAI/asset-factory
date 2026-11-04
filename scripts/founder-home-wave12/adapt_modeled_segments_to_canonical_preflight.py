#!/usr/bin/env python3
"""Preserve original modeled segment labels while satisfying existing frozen
World001 training-side preflight field names; never mislabel historical footage.
Run BEFORE model fitting. Writes an immutable prior-manifest copy/receipt.
"""
import json,hashlib,shutil,argparse
from pathlib import Path
REQUIRED=('S07_BRIDGE_0060_0084','S07_BRIDGE_0084_0108','S07_BRIDGE_0108_0132','S04_S08_LATE_CROSS_SURVEY')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def adapt(root):
 root=Path(root);src=root/'manifest_train.json';prior=root/'manifest_train_before_schema_adapter_R2.json';receipt=root/'MANIFEST_SEGMENT_SCHEMA_ADAPTER_RECEIPT.json'
 if not src.is_file() or prior.exists() or receipt.exists():raise RuntimeError('SOURCE_MISSING_OR_SCHEMA_ADAPTER_ALREADY_RAN')
 data=json.loads(src.read_text());segments=data.get('segments',[])
 if len(segments)!=4 or not all(x.get('id','').startswith('MODEL_COVERAGE_') for x in segments):raise RuntimeError('NOT_V3_MODELED_ANALOG_SEGMENTS')
 if any(x.get('split')!='train' for x in data.get('views',[])):raise RuntimeError('TEST_IN_TRAIN_SOURCE')
 shutil.copy2(src,prior)
 for s,name in zip(segments,REQUIRED):
  previous=s['id'];s['id']=name;s['modeled_analogue_label']=previous
  s['truth']='V3_MODELED_APPROACH_NOT_HISTORICAL_S07_S04_S08_IMAGES'
 src.write_text(json.dumps(data,sort_keys=True,indent=2)+'\n')
 rec={'status':'METADATA_SCHEMA_ADAPTER_BEFORE_MODEL_FIT','unchanged_train_images_count':len(data['views']),
   'source_image_sha256_unchanged':True,'prior_manifest_sha256':sha(prior),
   'new_manifest_sha256':sha(src),'protocol_sha256':sha(root/'FROZEN_PROTOCOL_BEFORE_MODEL_FIT.json'),
   'holdout_materialized':False,'misrepresentation_prevention':'Frozen legacy field IDs are MODELLED ANALOGUES, never historical S07/S04/S08 imagery.'}
 receipt.write_text(json.dumps(rec,indent=2,sort_keys=True)+'\n');return rec
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('root');print(json.dumps(adapt(parser.parse_args().root),indent=2))
