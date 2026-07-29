#!/usr/bin/env python3
"""Rehydrate the retained V1 pack, replace only avatar_receptionist, and certify all 53 outputs."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

import render_v1_round
import score_v1_assets
import validate_assets

BASE = Path(__file__).resolve().parent
TARGET = 'avatar_receptionist'
EXPECTED_TOTAL = 53
RETAINED_ACCEPTED = 52
SOURCE_ROOT = Path(os.environ['V1_RETAINED_ARTIFACT_DIR']).resolve()
ACTIVE = BASE / 'manifest.json'
GENERATED = BASE / 'manifests/generated/v1.manifest.json'
QUALITY = BASE / 'quality_report.json'
FEEDBACK = BASE / 'upgrade_feedback.json'
RECEIPT = BASE / 'forge_receipt_v1_receptionist_recovery.json'
PROVENANCE = BASE / 'provenance_v1_receptionist_recovery.json'
CONTACT = BASE / 'contact_sheet_v1_receptionist_recovery.png'


def read(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def output_path(entry: dict[str, Any]) -> Path:
    size = max(int(value) for value in entry['sizes'])
    return BASE / entry['path_template'].format(size=size)


def metadata_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + '.render.json')


def copy_retained_pack() -> list[dict[str, Any]]:
    source_manifest = SOURCE_ROOT / 'manifests/generated/v1.manifest.json'
    source_assets = SOURCE_ROOT / 'assets'
    if not source_manifest.is_file() or not source_assets.is_dir():
        raise ValueError(f'retained artifact layout invalid: {SOURCE_ROOT}')
    entries = read(source_manifest)
    if len(entries) != EXPECTED_TOTAL:
        raise ValueError(f'retained manifest count mismatch: {len(entries)}')
    if (BASE / 'assets').exists():
        shutil.rmtree(BASE / 'assets')
    shutil.copytree(source_assets, BASE / 'assets')
    payload = json.dumps(entries, indent=2) + '\n'
    ACTIVE.write_text(payload, encoding='utf-8')
    GENERATED.parent.mkdir(parents=True, exist_ok=True)
    GENERATED.write_text(payload, encoding='utf-8')
    return entries


def score_records(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = [score_v1_assets.score(entry, True) for entry in entries]
    by_name = {record['name']: record for record in records}
    hashes = [(record['name'], record.get('metrics', {}).get('perceptualHash')) for record in records]
    for index, (name_a, hash_a) in enumerate(hashes):
        if not hash_a:
            continue
        for name_b, hash_b in hashes[index + 1:]:
            if not hash_b:
                continue
            same_category = by_name[name_a].get('category') == by_name[name_b].get('category')
            if score_v1_assets.hamming(hash_a, hash_b) <= (5 if same_category else 8):
                for name, other in ((name_a, name_b), (name_b, name_a)):
                    issue = f'composition near-duplicates {other}'
                    if issue not in by_name[name]['issues']:
                        by_name[name]['issues'].append(issue)
                        by_name[name]['status'] = 'failed'
    return records


def snapshot_accepted(entries: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for entry in entries:
        if entry['name'] == TARGET:
            continue
        path = output_path(entry)
        meta = metadata_path(path)
        if not path.is_file() or not meta.is_file():
            raise ValueError(f'missing retained accepted source: {entry["name"]}')
        result[entry['name']] = {'assetSha256': sha(path), 'metadataSha256': sha(meta)}
    if len(result) != RETAINED_ACCEPTED:
        raise ValueError(f'accepted snapshot count mismatch: {len(result)}')
    return result


def assert_accepted_unchanged(entries: list[dict[str, Any]], before: dict[str, dict[str, str]]) -> None:
    after = snapshot_accepted(entries)
    if after != before:
        changed = sorted(name for name in before if before[name] != after.get(name))
        raise ValueError(f'accepted assets changed during missing-only recovery: {changed}')


def make_contact_sheet(entries: list[dict[str, Any]]) -> None:
    thumbs: list[tuple[str, Image.Image]] = []
    for entry in entries:
        path = output_path(entry)
        with Image.open(path) as image:
            canvas = Image.new('RGB', (240, 300), (12, 16, 28))
            frame = image.convert('RGBA')
            background = Image.new('RGBA', frame.size, (28, 34, 48, 255))
            background.alpha_composite(frame)
            background.thumbnail((220, 240), Image.Resampling.LANCZOS)
            x = (240 - background.width) // 2
            y = (250 - background.height) // 2
            canvas.paste(background.convert('RGB'), (x, y))
            draw = ImageDraw.Draw(canvas)
            draw.text((8, 260), entry['name'][:34], fill=(235, 240, 255), font=ImageFont.load_default())
            thumbs.append((entry['name'], canvas))
    columns = 5
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * 240, rows * 300), (4, 7, 14))
    for index, (_, image) in enumerate(thumbs):
        sheet.paste(image, ((index % columns) * 240, (index // columns) * 300))
    sheet.save(CONTACT, 'PNG', optimize=True)


def main() -> int:
    for name, expected in (
        ('ASSET_FORGE_MAX_PROVIDER_CALLS', '1'),
        ('ASSET_FORGE_MAX_UNIT_COST_USD', '1.00'),
        ('ASSET_FORGE_MAX_COST_USD', '1.00'),
        ('ASSET_RENDERER_MAX_ATTEMPTS', '1'),
    ):
        if os.environ.get(name) != expected:
            raise ValueError(f'{name} must equal {expected}')

    entries = copy_retained_pack()
    initial = score_records(entries)
    initial_failed = [record['name'] for record in initial if record['status'] != 'passed']
    if initial_failed != [TARGET]:
        raise ValueError(f'retained pack must prove exact 52/1 state; failed={initial_failed}')
    accepted_before = snapshot_accepted(entries)
    old_target = output_path(next(entry for entry in entries if entry['name'] == TARGET))
    old_target_sha = sha(old_target)
    old_target_meta = read(metadata_path(old_target))

    feedback = {
        TARGET: (
            'Replace only this asset. Create a premium full-body light-form receptionist with a clearly '
            'readable human silhouette, warm grounded posture, refined face and hands, layered translucent '
            'materials, fine cinematic surface detail, strong tonal separation, realistic depth and rim '
            'lighting. Transparent background. No text, card, poster, flat icon, cropped limbs, duplicate '
            'character, or empty negative-space composition.'
        )
    }
    write(FEEDBACK, feedback)
    os.environ['ASSET_FORGE_LIMIT_ENTRIES'] = '1'
    os.environ['ASSET_FORGE_LIMIT_OUTPUTS'] = '1'
    os.environ['ASSET_FORGE_SKIP_EXISTING_OUTPUTS'] = '0'
    generation = render_v1_round.render_round(2)
    if generation.get('outputRequests') != 1 or generation.get('renderedEntries') != 1:
        raise ValueError(f'one-asset generation boundary violated: {generation}')

    entries = read(ACTIVE)
    assert_accepted_unchanged(entries, accepted_before)
    final_records = score_records(entries)
    failed = [record for record in final_records if record['status'] != 'passed']
    report = {
        'schemaVersion': '2.1.0',
        'status': 'failed' if failed else 'passed',
        'requireProvider': True,
        'passed': len(final_records) - len(failed),
        'failed': len(failed),
        'assets': final_records,
    }
    write(QUALITY, report)
    write(FEEDBACK, score_v1_assets.feedback(final_records))

    target_entry = next(entry for entry in entries if entry['name'] == TARGET)
    target_path = output_path(target_entry)
    target_meta = read(metadata_path(target_path))
    ledger_path = Path(os.environ['ASSET_FORGE_BUDGET_STATE_PATH'])
    ledger = read(ledger_path)
    if ledger.get('providerCallsExecuted') != 1:
        raise ValueError('budget ledger must contain exactly one provider call')
    attempts = ledger.get('attempts', [])
    if len(attempts) != 1 or attempts[0].get('asset') != TARGET or attempts[0].get('status') != 'succeeded':
        raise ValueError(f'provider receipt mismatch: {attempts}')

    base_receipt = {
        'schemaVersion': '1.0.0',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'version': 'v1',
        'targetAsset': TARGET,
        'retainedArtifactId': 8741010314,
        'retainedAcceptedOutputs': RETAINED_ACCEPTED,
        'newProviderCalls': 1,
        'reservedMaximumSpendUsd': '1.00',
        'oldTargetSha256': old_target_sha,
        'newTargetSha256': sha(target_path),
        'oldProviderRequestId': old_target_meta.get('metadata', {}).get('provider_request_id'),
        'newProviderRequestId': target_meta.get('metadata', {}).get('provider_request_id'),
        'acceptedInputsSha256': accepted_before,
        'budgetLedger': ledger,
        'qualityFailures': [record['name'] for record in failed],
        'promote': False,
    }

    if failed:
        base_receipt['status'] = 'needs-single-output-retry'
        write(RECEIPT, base_receipt)
        make_contact_sheet(entries)
        return 4

    validation_errors = validate_assets.validate()
    if validation_errors:
        raise ValueError(f'asset validation failed: {validation_errors}')
    payload = json.dumps(entries, indent=2) + '\n'
    GENERATED.write_text(payload, encoding='utf-8')
    make_contact_sheet(entries)
    subprocess.run(['python', 'create_preview.py'], cwd=BASE, check=True)
    subprocess.run(['python', 'create_firebase_seed.py'], cwd=BASE, check=True)
    subprocess.run(['python', 'export_assets.py'], cwd=BASE, check=True)
    subprocess.run(['python', 'export_spatial_handoff.py'], cwd=BASE, check=True)
    subprocess.run(['python', 'certify_version_handoff.py', '--version', 'v1'], cwd=BASE, check=True)

    base_receipt['status'] = 'passed'
    base_receipt['ready'] = EXPECTED_TOTAL
    base_receipt['missing'] = 0
    base_receipt['contactSheetSha256'] = sha(CONTACT)
    write(RECEIPT, base_receipt)
    write(PROVENANCE, {
        'schemaVersion': '1.0.0',
        'status': 'complete',
        'provider': 'openai',
        'model': target_meta.get('metadata', {}).get('provider_model'),
        'providerRequestId': target_meta.get('metadata', {}).get('provider_request_id'),
        'targetAsset': TARGET,
        'retainedArtifactId': 8741010314,
        'retainedAcceptedOutputs': RETAINED_ACCEPTED,
        'newOutputSha256': sha(target_path),
        'rightsBasis': 'Owner-authorized provider generation for URAI production use; provider account and request provenance retained.',
        'promotionAuthorized': False,
    })
    print('V1_RECEPTIONIST_RECOVERY_CERTIFIED ready=53 missing=0 providerCalls=1')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
