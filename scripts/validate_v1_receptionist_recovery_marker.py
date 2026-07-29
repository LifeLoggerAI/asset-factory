#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

MARKER_PATH = Path('authorizations/execute-v1-receptionist-recovery-20260729.json')
PROVIDER = 'openai'
ENDPOINT = 'https://api.openai.com/v1/images/generations'
ALPHA_MODEL = 'gpt-image-1.5'
TARGET = 'avatar_receptionist'
RETAINED_ARTIFACT_ID = 8741010314
RETAINED_ARTIFACT_DIGEST = 'sha256:10318639cd60051d612a4277a639a2bd9fd55d64fda3e17b1a7d42452d9e24ff'


def expected_marker(parent_sha: str) -> dict[str, Any]:
    if not re.fullmatch(r'[0-9a-f]{40}', parent_sha):
        raise ValueError('expected parent SHA must be a lowercase 40-character SHA-1')
    return {
        'schemaVersion': '1.0.0',
        'confirm': 'AUTHORIZE_URAI_V1_RECEPTIONIST_MISSING_ONLY_RECOVERY',
        'expectedParentSha': parent_sha,
        'provider': PROVIDER,
        'endpoint': ENDPOINT,
        'alphaModel': ALPHA_MODEL,
        'targetAsset': TARGET,
        'retainedArtifactId': RETAINED_ARTIFACT_ID,
        'retainedArtifactDigest': RETAINED_ARTIFACT_DIGEST,
        'retainedAcceptedOutputs': 52,
        'canonicalOutputs': 53,
        'maxNewProviderCalls': 1,
        'maxUnitCostUsd': '1.00',
        'maxTotalCostUsd': '1.00',
        'promote': False,
        'executionNonce': 'URAI-V1-RECEPTIONIST-RECOVERY-20260729-ONE-TIME',
    }


def validate_marker(marker_path: Path, parent_sha: str) -> dict[str, Any]:
    if marker_path != MARKER_PATH and marker_path.name != MARKER_PATH.name:
        raise ValueError(f'unexpected marker filename: {marker_path}')
    if not marker_path.is_file():
        raise FileNotFoundError(marker_path)
    actual = json.loads(marker_path.read_text(encoding='utf-8'))
    expected = expected_marker(parent_sha)
    if actual != expected:
        raise ValueError(
            'authorization marker does not match the canonical one-asset boundary:\n'
            f'actual={json.dumps(actual, sort_keys=True)}\n'
            f'expected={json.dumps(expected, sort_keys=True)}'
        )
    return actual


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--marker', type=Path, default=MARKER_PATH)
    parser.add_argument('--expected-parent-sha', required=True)
    parser.add_argument('--github-output', type=Path)
    args = parser.parse_args()
    marker = validate_marker(args.marker, args.expected_parent_sha)
    if args.github_output:
        with args.github_output.open('a', encoding='utf-8') as output:
            output.write(f"provider={marker['provider']}\n")
            output.write(f"endpoint={marker['endpoint']}\n")
            output.write(f"alpha_model={marker['alphaModel']}\n")
            output.write(f"target_asset={marker['targetAsset']}\n")
            output.write(f"retained_artifact_id={marker['retainedArtifactId']}\n")
    print(json.dumps(marker, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
