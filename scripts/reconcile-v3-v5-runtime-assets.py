#!/usr/bin/env python3
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import re
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
GEN = BASE / 'image_asset_generator'
OUT = BASE / 'artifacts/reconciliation/v3-v5'
EXPECTED = {'v3': 14, 'v4': 39, 'v5': 27}
SPATIAL_REPO = 'LifeLoggerAI/urai-spatial'
AAA_MANIFEST = 'urai-tier1/public/assets/urai-aaa-full-pack/manifest.json'
DRIVE_EVIDENCE = [
    {
        'id': '1KetSmEfTEBWb4o_PazOVp5GFD6DfcZxFdEn_TgarRR0',
        'title': 'URAI All-Asset Completion Program — Live Execution Receipt — 2026-07-29',
    },
    {
        'id': '1MpkGagrfSpRWsHIOJm0NyNZBMawPxrRskQgxL_P-ge0',
        'title': 'URAI 100% Verification & Receipt Tracker — 2026-07-14',
    },
]
STOP = {'v3', 'v4', 'v5', 'asset', 'visual', 'state', 'main', 'production', 'final', 'ui'}


def gh_json(endpoint: str) -> dict:
    run = subprocess.run(['gh', 'api', endpoint], text=True, capture_output=True)
    if run.returncode:
        raise RuntimeError(run.stderr.strip()[-1000:])
    return json.loads(run.stdout)


def api_exists(repo_path: str, ref: str) -> tuple[bool, dict]:
    run = subprocess.run(
        ['gh', 'api', f'repos/{SPATIAL_REPO}/contents/{repo_path}?ref={ref}'],
        text=True,
        capture_output=True,
    )
    if run.returncode:
        return False, {'lookupError': run.stderr.strip()[-500:]}
    payload = json.loads(run.stdout)
    return True, {
        'blobSha': payload.get('sha'),
        'size': payload.get('size'),
        'downloadUrl': payload.get('download_url'),
    }


def words(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r'[a-z0-9]+', value.lower().replace('_', '-'))
        if len(token) > 2 and token not in STOP
    }


def alternate_candidates(entry: dict, placeholders: list[dict]) -> list[dict]:
    target = words(' '.join(str(entry.get(key, '')) for key in ('name', 'category', 'purpose', 'canonical_path')))
    ranked = []
    for candidate in placeholders:
        source = words(f"{candidate.get('id', '')} {candidate.get('role', '')}")
        overlap = sorted(target & source)
        if overlap:
            ranked.append({
                'id': candidate.get('id'),
                'role': candidate.get('role'),
                'visual': candidate.get('visual'),
                'status': candidate.get('status'),
                'launchUse': candidate.get('launchUse'),
                'tokenOverlap': overlap,
                'score': len(overlap),
            })
    ranked.sort(key=lambda item: (-item['score'], item['id'] or ''))
    return ranked[:5]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--spatial-ref', default='main')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(['python', 'canonical_version_contract.py'], cwd=GEN, check=True)

    encoded = gh_json(f'repos/{SPATIAL_REPO}/contents/{AAA_MANIFEST}?ref={args.spatial_ref}')
    aaa = json.loads(base64.b64decode(encoded['content']).decode('utf-8'))
    all_placeholders = aaa.get('assets', [])
    if len(all_placeholders) != 180:
        raise SystemExit(f'AAA placeholder manifest must contain 180 records; found {len(all_placeholders)}')

    total = 0
    versions = {}
    for version, count in EXPECTED.items():
        manifest_name = f'{version}-canonical.manifest.json'
        entries = json.loads((GEN / 'manifests/generated' / manifest_name).read_text(encoding='utf-8'))
        if len(entries) != count:
            raise SystemExit(f'{version}: expected {count}, got {len(entries)}')
        placeholder_pool = [item for item in all_placeholders if item.get('version') == version]
        records = []
        for entry in entries:
            canonical = entry['canonical_path'].lstrip('/')
            repo_path = f'urai-tier1/public/{canonical}'
            present, metadata = api_exists(repo_path, args.spatial_ref)
            alternatives = [] if present else alternate_candidates(entry, placeholder_pool)
            if present:
                state = 'generated-but-uncertified'
            elif alternatives:
                state = 'missing-canonical-with-placeholder-candidates'
            else:
                state = 'missing-no-candidate-found'
            records.append({
                'name': entry['name'],
                'category': entry.get('category'),
                'purpose': entry.get('purpose'),
                'canonicalPath': canonical,
                'runtimePath': repo_path,
                'state': state,
                'present': present,
                'alternateCandidates': alternatives,
                **metadata,
            })

        receipt = {
            'schemaVersion': '1.1.0',
            'version': version,
            'expected': count,
            'present': sum(record['present'] for record in records),
            'missingCanonical': sum(not record['present'] for record in records),
            'missingWithPlaceholderCandidates': sum(
                record['state'] == 'missing-canonical-with-placeholder-candidates' for record in records
            ),
            'missingWithNoCandidate': sum(
                record['state'] == 'missing-no-candidate-found' for record in records
            ),
            'placeholderPoolCount': len(placeholder_pool),
            'placeholderAuthority': {
                'repository': SPATIAL_REPO,
                'path': AAA_MANIFEST,
                'blobSha': encoded.get('sha'),
                'statusBoundary': 'generated-final-placeholder',
            },
            'externalEvidence': DRIVE_EVIDENCE,
            'providerCalls': 0,
            'spendUsd': '0.00',
            'spatialRef': args.spatial_ref,
            'assets': records,
        }
        raw = (json.dumps(receipt, indent=2, sort_keys=True) + '\n').encode()
        receipt['receiptSha256'] = hashlib.sha256(raw).hexdigest()
        (OUT / f'{version}-runtime-reconciliation.json').write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8'
        )
        versions[version] = {
            'expected': count,
            'present': receipt['present'],
            'missingCanonical': receipt['missingCanonical'],
            'missingWithPlaceholderCandidates': receipt['missingWithPlaceholderCandidates'],
            'missingWithNoCandidate': receipt['missingWithNoCandidate'],
            'placeholderPoolCount': receipt['placeholderPoolCount'],
            'missingNames': [record['name'] for record in records if not record['present']],
            'noCandidateNames': [
                record['name'] for record in records
                if record['state'] == 'missing-no-candidate-found'
            ],
        }
        total += count

    summary = {
        'schemaVersion': '1.1.0',
        'expected': total,
        'providerCalls': 0,
        'spendUsd': '0.00',
        'versions': versions,
        'generationAuthorized': False,
        'reason': 'Canonical gaps must be reviewed against alternate placeholder candidates and external evidence first.',
    }
    (OUT / 'v3-v5-runtime-reconciliation-summary.json').write_text(
        json.dumps(summary, indent=2, sort_keys=True) + '\n', encoding='utf-8'
    )
    print(json.dumps(summary, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
