#!/usr/bin/env python3
"""Validate the one-file V1 Spatial paid-resume v3 authorization marker."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

MARKER_PATH = Path(
    "authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json"
)
HISTORICAL_MARKER_SHAS = [
    "bdf2cd003bf16ed621cdcdc63312c75ce5e5d5e5",
    "de27f2f36aa1ca73d504e5dffed99161078fb0c8",
    "4dc05a67746e189054609e405ca3801683ab5445",
    "0cf837d585d3d1c1d8e171938037098c72230c22",
]
PROVIDER = "openai"
ENDPOINT = "https://api.openai.com/v1/images/generations"
OPAQUE_MODEL = "gpt-image-2"
ALPHA_MODEL = "gpt-image-1.5"


def expected_marker(parent_sha: str) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{40}", parent_sha):
        raise ValueError("expected parent SHA must be a lowercase 40-character SHA-1")
    return {
        "schemaVersion": "1.1.0",
        "confirm": "AUTHORIZE_URAI_V1_AAA_SPATIAL_PACK_SAFE_RESUME_3",
        "expectedParentSha": parent_sha,
        "historicalMarkerShas": HISTORICAL_MARKER_SHAS,
        "provider": PROVIDER,
        "endpoint": ENDPOINT,
        "opaqueModel": OPAQUE_MODEL,
        "alphaModel": ALPHA_MODEL,
        "maxNewProviderCalls": 47,
        "maxUnitCostUsd": "1.00",
        "maxTotalCostUsd": "47.00",
        "canonicalOutputs": 53,
        "reuseProvenOutputs": 1,
        "derivedProviderOutputs": 5,
        "promote": False,
        "executionNonce": (
            "URAI-V1-AAA-SPATIAL-20260711-SAFE-RESUME-3-REAUTHORIZED-ONE-TIME"
        ),
    }


def validate_marker(marker_path: Path, parent_sha: str) -> dict[str, Any]:
    if marker_path != MARKER_PATH and marker_path.name != MARKER_PATH.name:
        raise ValueError(f"unexpected marker filename: {marker_path}")
    if not marker_path.is_file():
        raise FileNotFoundError(marker_path)
    actual = json.loads(marker_path.read_text(encoding="utf-8"))
    if not isinstance(actual, dict):
        raise ValueError("authorization marker must contain one JSON object")
    expected = expected_marker(parent_sha)
    if actual != expected:
        raise ValueError(
            "authorization marker does not match the canonical paid boundary:\n"
            f"actual={json.dumps(actual, sort_keys=True)}\n"
            f"expected={json.dumps(expected, sort_keys=True)}"
        )
    return actual


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--marker", type=Path, default=MARKER_PATH)
    parser.add_argument("--expected-parent-sha", required=True)
    parser.add_argument("--github-output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    marker = validate_marker(args.marker, args.expected_parent_sha)
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for output_name, marker_name in (
                ("provider", "provider"),
                ("endpoint", "endpoint"),
                ("opaque_model", "opaqueModel"),
                ("alpha_model", "alphaModel"),
            ):
                output.write(f"{output_name}={marker[marker_name]}\n")
    print(json.dumps(marker, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
