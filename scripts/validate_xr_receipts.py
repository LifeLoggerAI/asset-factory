#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

REQUIRED_TEST_IDS = {f"XR-{index:03d}" for index in range(1, 11)}


def parse_time(value: object, context: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: timestamp is required")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{context}: timestamp must be ISO-8601") from error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipts-dir", type=Path, default=Path("xr-test-packet/receipts"))
    parser.add_argument("--schema", type=Path, default=Path("xr-test-packet/device-receipt-schema.json"))
    parser.add_argument("--expected-build-sha", required=True)
    parser.add_argument("--output", type=Path, default=Path("xr-test-packet/xr-verification-report.json"))
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()

    if len(args.expected_build_sha) != 40 or any(char not in "0123456789abcdef" for char in args.expected_build_sha):
        raise SystemExit("expected build SHA must be a lowercase full commit SHA")

    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)

    errors: list[str] = []
    receipts: dict[str, dict[str, Any]] = {}
    files = sorted(args.receipts_dir.glob("*.json")) if args.receipts_dir.is_dir() else []

    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            errors.append(f"{path}: unreadable JSON: {error}")
            continue
        if not isinstance(data, dict):
            errors.append(f"{path}: receipt must be an object")
            continue

        schema_errors = sorted(validator.iter_errors(data), key=lambda item: list(item.path))
        if schema_errors:
            errors.extend(f"{path}: {error.message}" for error in schema_errors)
            continue

        test_id = str(data.get("testId"))
        if test_id in receipts:
            errors.append(f"duplicate receipt for {test_id}")
            continue
        if test_id not in REQUIRED_TEST_IDS:
            errors.append(f"unsupported test receipt {test_id}")
            continue
        receipts[test_id] = data

        if data.get("buildSha") != args.expected_build_sha:
            errors.append(f"{test_id}: build SHA does not match the exact candidate")
        if data.get("status") != "passed":
            errors.append(f"{test_id}: status is not passed")
        evidence = data.get("evidence")
        if not isinstance(evidence, list) or not evidence or any(not isinstance(item, str) or not item.strip() for item in evidence):
            errors.append(f"{test_id}: non-empty evidence references are required")

        try:
            started = parse_time(data.get("startedAtUtc"), f"{test_id}/startedAtUtc")
            completed = parse_time(data.get("completedAtUtc"), f"{test_id}/completedAtUtc")
            if completed < started:
                errors.append(f"{test_id}: completedAtUtc precedes startedAtUtc")
        except ValueError as error:
            errors.append(str(error))

        if test_id == "XR-002":
            fps = data.get("fpsMedian")
            frame_time = data.get("frameTimeP95Ms")
            if not isinstance(fps, (int, float)) or isinstance(fps, bool) or fps < 72:
                errors.append("XR-002: fpsMedian must be at least 72")
            if not isinstance(frame_time, (int, float)) or isinstance(frame_time, bool) or frame_time > 18:
                errors.append("XR-002: frameTimeP95Ms must be at most 18")

    missing = sorted(REQUIRED_TEST_IDS - set(receipts))
    if missing:
        errors.append(f"missing required physical test receipts: {missing}")

    verified = not errors and set(receipts) == REQUIRED_TEST_IDS
    report = {
        "schemaVersion": "1.0.0",
        "expectedBuildSha": args.expected_build_sha,
        "receiptDirectory": str(args.receipts_dir),
        "receiptFiles": [str(path) for path in files],
        "requiredTestIds": sorted(REQUIRED_TEST_IDS),
        "observedTestIds": sorted(receipts),
        "missingTestIds": missing,
        "errors": errors,
        "physicalXrVerified": verified,
        "claimBoundary": (
            "All required exact-build physical XR receipts passed validation."
            if verified
            else "XR packet is prepared, but physical hardware verification is incomplete or invalid."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

    if args.require_complete and not verified:
        raise SystemExit("physical XR verification is incomplete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
