#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, subprocess
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]
GEN=BASE/'image_asset_generator'
OUT=BASE/'artifacts/reconciliation/v3-v5'
EXPECTED={'v3':14,'v4':39,'v5':27}

def api_exists(repo_path:str, ref:str)->tuple[bool,dict]:
    cmd=['gh','api',f'repos/LifeLoggerAI/urai-spatial/contents/{repo_path}?ref={ref}']
    run=subprocess.run(cmd,text=True,capture_output=True)
    if run.returncode!=0: return False,{'error':run.stderr.strip()[-500:]}
    payload=json.loads(run.stdout)
    return True,{'blobSha':payload.get('sha'),'size':payload.get('size'),'downloadUrl':payload.get('download_url')}

def main()->int:
    p=argparse.ArgumentParser(); p.add_argument('--spatial-ref',default='main'); args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    subprocess.run(['python','canonical_version_contract.py'],cwd=GEN,check=True)
    total=0; versions={}
    for version,count in EXPECTED.items():
        name={'v3':'v3-canonical.manifest.json','v4':'v4-canonical.manifest.json','v5':'v5-canonical.manifest.json'}[version]
        path=GEN/'manifests/generated'/name
        entries=json.loads(path.read_text())
        if len(entries)!=count: raise SystemExit(f'{version}: expected {count}, got {len(entries)}')
        records=[]
        for entry in entries:
            canonical=entry['canonical_path'].lstrip('/')
            repo_path=f'urai-tier1/public/{canonical}'
            present,meta=api_exists(repo_path,args.spatial_ref)
            records.append({'name':entry['name'],'canonicalPath':canonical,'runtimePath':repo_path,'state':'generated-but-uncertified' if present else 'missing','present':present,**meta})
        receipt={'schemaVersion':'1.0.0','version':version,'expected':count,'present':sum(r['present'] for r in records),'missing':sum(not r['present'] for r in records),'providerCalls':0,'spendUsd':'0.00','spatialRef':args.spatial_ref,'assets':records}
        raw=(json.dumps(receipt,indent=2,sort_keys=True)+'\n').encode(); receipt['receiptSha256']=hashlib.sha256(raw).hexdigest()
        (OUT/f'{version}-runtime-reconciliation.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
        versions[version]={'expected':count,'present':receipt['present'],'missing':receipt['missing'],'missingNames':[r['name'] for r in records if not r['present']]}; total+=count
    summary={'schemaVersion':'1.0.0','expected':total,'providerCalls':0,'spendUsd':'0.00','versions':versions}
    (OUT/'v3-v5-runtime-reconciliation-summary.json').write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
    print(json.dumps(summary,sort_keys=True))
    return 0
if __name__=='__main__': raise SystemExit(main())
