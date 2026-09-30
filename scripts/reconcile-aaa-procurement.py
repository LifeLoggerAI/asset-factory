#!/usr/bin/env python3
"""Read-only, reproducible crosswalk of Drive's 50 packages to pinned Git evidence.

This does not promote assets, execute providers, certify pixels or edit Drive.
--check regenerates the expected ledger and rejects stale/tampered output.
"""
import argparse
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'audit/aaa-closeout'
UNKNOWN = 'UNKNOWN: not established by inspected evidence'


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.PIPE)


class Source:
    def __init__(self, repo, ref):
        self.repo = repo
        self.sha = git(repo, 'rev-parse', ref + '^{commit}').decode().strip()
        self.paths = set(git(repo, 'ls-tree', '-r', '--name-only', self.sha).decode().splitlines())
        self.cache = {}

    def read(self, path):
        if path not in self.cache:
            self.cache[path] = git(self.repo, 'show', self.sha + ':' + path)
        return self.cache[path]

    def record(self, path):
        if path not in self.paths:
            return {'path': path, 'existsAtPinnedCommit': False, 'state': 'MISSING_AT_PINNED_COMMIT'}
        data = self.read(path)
        return {'path': path, 'existsAtPinnedCommit': True, 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest(),
                'gitBlob': git(self.repo, 'rev-parse', self.sha + ':' + path).decode().strip(),
                'evidenceScope': 'source-file identity only; no execution or acceptance inference'}

    def json(self, path):
        return json.loads(self.read(path))


def records(snapshot, title):
    tab = next(x for x in snapshot['tabs'] if x['sheet_name'] == title)
    header, *rows = tab['values']
    return [dict(zip(header, row + [UNKNOWN] * (len(header) - len(row)))) for row in rows if row and row[0]]


def build(spatial, factory, snapshot, crosswalk):
    procurement = records(snapshot, '11 AAA+++ Procurement')
    hero = {r['Spec ID']: r for r in records(snapshot, '12 Hero Technical Specs')}
    sensory = {r['Spec ID']: r for r in records(snapshot, '13 Audio Motion VFX Specs')}
    gates = {r['Gate ID']: r for r in records(snapshot, '17 Gold Master Acceptance')}
    vendors = records(snapshot, '18 Vendor Selection')
    dispatch = records(snapshot, '19 Vendor Dispatch')
    manifest_path = 'operations/assets/launch-critical-assets.json'
    manifest = spatial.json(manifest_path)
    assets = {a['id']: a for a in manifest['assets']}
    inventory_path = 'model_forge/launch-model-inventory.json'
    inventory = factory.json(inventory_path)
    expected = {f'AAA-{n:03}' for n in range(1, 51)}
    assert len(procurement) == 50 and {r['ID'] for r in procurement} == expected, 'authoritative package set changed; inspect instead of dropping rows'
    mappings = {r['id']: r for r in crosswalk['packages']}
    assert len(mappings) == 50 and set(mappings) == expected, 'crosswalk must cover exactly the authoritative set'
    findings = []
    rows = []
    for p in procurement:
        ident = p['ID']
        mapping = mappings[ident]
        src = factory if mapping['repository'] == 'LifeLoggerAI/asset-factory' else spatial
        evidence = [src.record(path) for path in mapping['sourcePaths']]
        candidates = []
        asset_ids = list(mapping['manifestAssetIds'])
        if ident == 'AAA-015':
            asset_ids += [key for key in assets if key.startswith('council-')]
        for asset_id in asset_ids:
            assert asset_id in assets, f'{ident}: mapped manifest asset disappeared: {asset_id}'
            asset = assets[asset_id]
            binary = spatial.record(asset['fixedPath'])
            receipts = []
            for kind in ['promotion-rehearsal', 'promotion-decisions', 'production-receipts']:
                path = f'operations/assets/{kind}/{asset_id}.json'
                if path not in spatial.paths:
                    continue
                receipt = spatial.json(path)
                matched = receipt.get('sha256') == binary.get('sha256') if receipt.get('sha256') else None
                item = {'source': spatial.record(path), 'recordedMode': receipt.get('mode', UNKNOWN),
                        'recordedSha256': receipt.get('sha256', UNKNOWN), 'matchesCurrentBinary': matched,
                        'recordedFlags': {k: receipt.get(k, UNKNOWN) for k in
                         ['promote', 'humanReviewApproved', 'visualProofVerified', 'exactHeadChecksPassed', 'optimizationVerified', 'routeConsumptionVerified']},
                        'acceptanceTransferred': False}
                receipts.append(item)
                if receipt.get('promote') is True and matched is False:
                    findings.append({'id': 'HISTORICAL_PROMOTION_BINARY_MISMATCH', 'package': ident, 'asset': asset_id,
                                     'evidence': path, 'reason': 'Historical promotion hash differs from inspected binary; approval does not transfer.'})
            candidates.append({'manifestId': asset_id, 'manifestReleaseState': asset['releaseState'],
                               'role': asset.get('authorityRole', UNKNOWN),
                               'runtimeConsumptionAllowedByManifest': asset.get('runtimeConsumptionAllowed', UNKNOWN),
                               'targetRoutesDeclared': asset.get('targetRoutes', []),
                               'sourceDeclared': asset.get('source', UNKNOWN), 'licenseDeclared': asset.get('license', UNKNOWN),
                               'binary': binary, 'format': Path(asset['fixedPath']).suffix.lstrip('.'),
                               'triangleBudgetRequired': asset.get('maxTriangles', UNKNOWN),
                               'compressionRequired': asset.get('requiredCompression', UNKNOWN),
                               'actualLODsVerified': False, 'actualGpuBudgetVerified': False,
                               'receipts': receipts, 'finalAcceptanceEstablished': False})
        related = []
        if ident == 'AAA-006':
            path = 'operations/assets/third-party/ground-polyhaven-jacaranda-web-v1.json'
            cc0 = spatial.json(path)
            related.append({'receipt': spatial.record(path), 'recordedStatus': cc0['status'],
                            'source': cc0['source'], 'integrationDeclared': cc0['integration'],
                            'binary': spatial.record(cc0['integration']['repositoryPath']),
                            'finalAcceptanceEstablished': False})
        if ident == 'AAA-017':
            path = 'operations/assets/promotion-rehearsal/legacy-archive-foundation-v1.json'
            related.append({'receipt': spatial.record(path), 'recordedFlags': spatial.json(path),
                            'finalAcceptanceEstablished': False})
        lanes = [v for v in vendors if ident in re.findall(r'AAA-\d{3}', v['Packages'])]
        briefs = [d for d in dispatch if ident in re.findall(r'AAA-\d{3}', d['Package'])]
        spec = hero.get(mapping['heroSpecId'])
        scope = 'SOURCE_PRESENT_ACCEPTANCE_UNVERIFIED' if any(e['existsAtPinnedCommit'] for e in evidence) else 'IMPLEMENTATION_NOT_ESTABLISHED_BY_THIS_AUDIT'
        package_findings = []
        if ident == 'AAA-011' and re.search(r'Focus V\d+|exact head', p['Paid Trigger']):
            package_findings.append('PAID_TRIGGER_CELL_CONTAINS_RUNTIME_STATUS: preserve source verbatim; do not interpret this cell as spend authorization.')
        if ident in ['AAA-006', 'AAA-010', 'AAA-011', 'AAA-013']:
            package_findings.append('HISTORICAL_BINARY_IS_NOT_CURRENT_VISUAL_AUTHORITY: use manifest role and runtime source; do not infer acceptance from retained GLB.')
        rows.append({
            'id': ident, 'name': p['Deliverable'], 'priority': p['Priority'], 'scene': mapping['scene'],
            'source': {'registryRow': int(ident[-3:]) + 1, 'registryTab': '11 AAA+++ Procurement',
                       'repository': mapping['repository'], 'mappingScope': mapping['mappingScope']},
            'registryStatus': {'classification': p['Classification'], 'currentRuntimeStatus': p['Current Runtime Status'],
                               'spendState': p['Spend State'], 'paidTriggerVerbatim': p['Paid Trigger']},
            'integration': {'assessment': scope, 'targetDeclared': p['Integration Target'], 'sourceEvidence': evidence,
                            'runtimeExecutionVerified': False, 'deployedRevisionVerified': False},
            'placeholderOrCandidate': {'registryClassification': p['Classification'], 'manifestCandidates': candidates,
                                        'additionalSourceReceipts': related},
            'final': {'status': 'NOT_CERTIFIED_BY_THIS_AUDIT', 'accepted': False, 'reason': 'Requirements and source evidence do not establish current exact-head literal acceptance.'},
            'provider': {'buyBuild': p['Buy / Build'], 'vendorTypeRequired': p['Vendor Type'],
                         'selectionLanes': [{'lane': v['Vendor Lane'], 'status': v['Status']} for v in lanes],
                         'selectedProvider': UNKNOWN, 'fundingOrCredentialVerified': False,
                         'paidExecutionAuthorizedByThisLedger': False},
            'specification': {'deliverable': p['Exact Deliverable'], 'canon': p['Canon / Authority'],
                              'heroSpec': spec if spec else UNKNOWN,
                              'relatedSensoryRequirements': [sensory[s] for s in mapping['relatedSensorySpecIds']],
                              'dispatchIds': [d['Dispatch ID'] for d in briefs], 'formatRequired': spec['Source / Runtime Format'] if spec else UNKNOWN},
            'budgets': {'geometryMediaRequired': p['Geometry / Media Budget'], 'texturesRequired': p['Materials / Textures'],
                        'performanceRequired': spec['Performance Budget'] if spec else UNKNOWN,
                        'memoryDrawCallsRequired': spec['Memory / Draw Calls'] if spec else UNKNOWN,
                        'measuredBytesAndTriangles': 'See candidate binary bytes and manifest triangle ceilings; ceilings are not measured triangle counts.',
                        'measuredFrameTime': UNKNOWN, 'measuredGpuMemory': UNKNOWN, 'approvedSpendCeiling': UNKNOWN},
            'lod': {'required': {k: spec[k] for k in ['LOD0','LOD1','LOD2 / Mobile']} if spec else p['Geometry / Media Budget'],
                    'deliveredSetVerified': False},
            'devices': {'required': p['Desktop / Mobile / XR'], 'physicalDeviceValidation': UNKNOWN},
            'accessibility': {'required': p['Accessibility'], 'reducedMotionRequired': spec['Reduced Motion'] if spec else UNKNOWN,
                              'acceptanceEvidence': UNKNOWN},
            'motionVfxRequired': p['Motion / VFX'], 'audioHapticRequired': p['Audio / Haptic'],
            'rightsProvenanceRequired': p['Rights / Provenance'],
            'dependencies': {'verbatim': p['Dependencies'], 'explicitPackageIds': sorted(set(re.findall(r'AAA-\d{3}', p['Dependencies'])))},
            'evidence': {'acceptanceViewsRequired': p['Acceptance Views'], 'rejectIf': p['Rejection Conditions'],
                         'closureEvidenceRequired': p['Closure Evidence'],
                         'relatedGoldMasterRequirements': [gates[g] for g in mapping['relatedGoldMasterGateIds']],
                         'exactHeadPixelAcceptance': UNKNOWN, 'independentApproval': UNKNOWN},
            'findings': package_findings,
        })
    historical = spatial.json('brand/v1-aaa-asset-program-matrix.json')
    certified = [s['id'] for s in historical['surfaces'] if s['status'] == 'certified-production-ready']
    findings.append({'id': 'HISTORICAL_CERTIFICATION_NOT_CURRENT_AUTHORITY',
                     'evidence': 'brand/v1-aaa-asset-program-matrix.json',
                     'historicalBaseCommit': historical['baseCommit'], 'historicalCertifiedSurfaces': certified,
                     'currentManifestStates': dict(Counter(a['releaseState'] for a in manifest['assets'])),
                     'reason': 'August certification labels are historical; current manifest states and exact-head approval remain separate.'})
    declared = inventory['authority']['recoveredSpatialHead']
    if declared != spatial.sha:
        findings.append({'id': 'MODEL_FORGE_CHECKPOINT_DIFFERS_FROM_LOCAL_SPATIAL_SOURCE',
                         'declaredCheckpoint': declared, 'inspectedLocalCommit': spatial.sha,
                         'reason': 'This local audit includes an unpublished successor. It does not renew Model Forge paid-target authority or claim the remote head changed.'})
    return {'schemaVersion': 'urai-aaa-procurement-readiness-ledger-v1',
            'purpose': 'Derived audit only; authoritative Drive register remains unchanged. Not a promotion or spend authority.',
            'source': {'registryUrl': snapshot['sourceUrl'], 'registryReadAt': snapshot['readAt'],
                       'snapshotSha256': hashlib.sha256((AUDIT/'procurement-source-snapshot.json').read_bytes()).hexdigest(),
                       'crosswalkSha256': hashlib.sha256((AUDIT/'source-crosswalk.json').read_bytes()).hexdigest(),
                       'spatialCommit': spatial.sha, 'assetFactoryCommit': factory.sha,
                       'spatialRefScope': 'Pinned local Git commit; uncommitted changes excluded; remote head not inferred.',
                       'launchManifest': spatial.record(manifest_path), 'modelForgeInventory': factory.record(inventory_path)},
            'summary': {'packages': len(rows), 'acceptedByThisAudit': 0,
                        'registrySpendStates': dict(Counter(p['Spend State'] for p in procurement)),
                        'vendorLaneStates': dict(Counter(v['Status'] for v in vendors)),
                        'sourceEvidenceCoverage': dict(Counter(r['integration']['assessment'] for r in rows)),
                        'heroSpecs': len(hero), 'audioMotionVfxSpecs': len(records(snapshot, '13 Audio Motion VFX Specs')),
                        'goldMasterGates': len(gates), 'dispatchPackets': len(dispatch)},
            'findings': findings, 'packages': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spatial-repo', required=True, type=Path)
    parser.add_argument('--spatial-ref', default='HEAD')
    parser.add_argument('--factory-ref', required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    snapshot = json.loads((AUDIT/'procurement-source-snapshot.json').read_text())
    crosswalk = json.loads((AUDIT/'source-crosswalk.json').read_text())
    ledger = build(Source(args.spatial_repo, args.spatial_ref), Source(ROOT, args.factory_ref), snapshot, crosswalk)
    output = json.dumps(ledger, indent=2, ensure_ascii=False) + '\n'
    destination = AUDIT/'readiness-ledger.json'
    if args.check:
        assert destination.read_text() == output, 'Ledger is stale or changed: regenerate from inspected source; never hand-promote statuses.'
        print('PASS: exact 50-package coverage, source identities, receipt hash checks, and no inherited acceptance')
    else:
        destination.write_text(output)
        print('Wrote derived audit:', destination.relative_to(ROOT))
    print(json.dumps(ledger['summary'], indent=2))
    print(json.dumps(ledger['findings'], indent=2))


if __name__ == '__main__':
    main()
