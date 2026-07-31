#!/usr/bin/env python3
"""Zero-spend recertification of the retained V4 provider estate."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "image_asset_generator"
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(GEN))

import canonical_release_manifests  # noqa: E402
import generate_exact_version_assets as generator  # noqa: E402
import score_v1_assets  # noqa: E402

SOURCE_RUN_ID = 30543824770
SOURCE_ARTIFACT_ID = 8763242401
SOURCE_ARTIFACT_DIGEST = "sha256:b99e5e7d653cbf4a02d41504387cc59ee1c3a8f7dea45f5825d75664e910daa9"
SOURCE_RECEIPT_SHA256 = "504a4d5fb2fb268cda14cd1478ae5f43094e7066cf5a612d70aac72735a08bf3"
EXPECTED_PREVIOUS_FAILURES = [
    "v4_comfort_recenter_marker",
    "v4_comfort_teleport_marker",
    "v4_mobile_android_adaptive_icon",
    "v4_mobile_ios_app_icon",
    "v4_mobile_pwa_icon_set",
]
EXPECTED_RUNTIME_DECODE_FALLBACKS = ["v4_comfort_teleport_marker"]


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_source_receipt(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    claimed = payload.pop("receiptSha256", None)
    canonical = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode()
    if claimed != SOURCE_RECEIPT_SHA256 or sha256_bytes(canonical) != SOURCE_RECEIPT_SHA256:
        raise SystemExit("retained V4 receipt digest mismatch")
    payload["receiptSha256"] = claimed
    if payload.get("version") != "v4" or payload.get("generated") != 39:
        raise SystemExit("retained V4 receipt identity drift")
    if payload.get("providerCallsExecuted") != 44:
        raise SystemExit("retained V4 provider call ledger drift")
    if str(payload.get("reservedEstimatedCostUsd")) != "44.00":
        raise SystemExit("retained V4 cost ledger drift")
    if payload.get("failedNames") != EXPECTED_PREVIOUS_FAILURES:
        raise SystemExit("retained V4 historical failure set drift")
    return payload


def successful_attempt(record: dict[str, Any]) -> dict[str, Any]:
    attempts = [a for a in record.get("attempts", []) if a.get("providerStatus") == "succeeded"]
    if not attempts:
        raise SystemExit(f"successful provider attempt missing: {record.get('name')}")
    return attempts[-1]


def validate_metadata(
    metadata_path: Path,
    entry: dict[str, Any],
    record: dict[str, Any],
    size: int,
) -> None:
    payload = load_json(metadata_path)
    metadata = payload.get("metadata", {})
    attempt = successful_attempt(record)
    name = str(entry["name"])
    if payload.get("name") != name or payload.get("renderer") != "provider":
        raise SystemExit(f"provider metadata identity drift: {name}")
    if metadata.get("provider") != "openai":
        raise SystemExit(f"provider metadata provider drift: {name}")
    if metadata.get("provider_request_id") != attempt.get("providerRequestId"):
        raise SystemExit(f"provider request binding drift: {name}")
    if metadata.get("provider_model") != attempt.get("providerModel"):
        raise SystemExit(f"provider model binding drift: {name}")
    if metadata.get("target_width") != size or metadata.get("target_height") != size:
        raise SystemExit(f"provider target geometry drift: {name}")


def prepare_scoring_source(
    entry: dict[str, Any],
    record: dict[str, Any],
    receipt_path: Path,
    forge_source: Path,
    size: int,
) -> dict[str, Any]:
    name = str(entry["name"])
    source = receipt_path.parent / "sources" / f"{name}_{size}.png"
    source_meta = source.with_suffix(source.suffix + ".render.json")
    if not source_meta.is_file():
        raise SystemExit(f"retained provider metadata missing: {name}")
    validate_metadata(source_meta, entry, record, size)

    forge_source.parent.mkdir(parents=True, exist_ok=True)
    fallback = False
    retained_source_sha: str | None = None
    if source.is_file():
        retained_source_sha = sha256_file(source)
        if retained_source_sha != successful_attempt(record).get("sourceSha256"):
            raise SystemExit(f"retained provider source hash drift: {name}")
        shutil.copy2(source, forge_source)
    else:
        if name not in EXPECTED_RUNTIME_DECODE_FALLBACKS:
            raise SystemExit(f"unexpected retained provider PNG omission: {name}")
        retained_runtime = receipt_path.parent / record["runtimeFile"]
        if not retained_runtime.is_file():
            raise SystemExit(f"retained runtime fallback missing: {name}")
        expected_runtime_sha = record.get("technical", {}).get("sha256")
        if sha256_file(retained_runtime) != expected_runtime_sha:
            raise SystemExit(f"retained runtime fallback hash drift: {name}")
        with Image.open(retained_runtime) as image:
            image.load()
            if image.size != (size, size):
                raise SystemExit(f"retained runtime fallback geometry drift: {name}")
            converted = image.convert("RGBA" if bool(entry.get("alpha")) else "RGB")
            converted.save(forge_source, format="PNG", optimize=True)
        fallback = True

    forge_meta = forge_source.with_suffix(forge_source.suffix + ".render.json")
    shutil.copy2(source_meta, forge_meta)
    return {
        "source": forge_source,
        "metadata": forge_meta,
        "evidenceMode": "runtime-decoded-for-scoring" if fallback else "retained-provider-png",
        "retainedProviderPngPresent": not fallback,
        "retainedProviderPngSha256": retained_source_sha,
        "scoringPngSha256": sha256_file(forge_source),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retained-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()

    receipt_path = (
        args.retained_root.resolve()
        / "artifacts/exact-paid/v4/v4-generation-receipt.json"
    )
    retained_receipt = validate_source_receipt(receipt_path)
    records = {record["name"]: record for record in retained_receipt["assets"]}

    output_root = args.output_root.resolve()
    if output_root.exists():
        shutil.rmtree(output_root)
    (output_root / "sources").mkdir(parents=True)
    (output_root / "runtime").mkdir(parents=True)

    entries = load_json(canonical_release_manifests.build("v4"))
    if not isinstance(entries, list) or len(entries) != 39:
        raise SystemExit("canonical V4 manifest count drift")

    recertified: list[dict[str, Any]] = []
    fallbacks: list[str] = []
    for entry in entries:
        name = str(entry["name"])
        size = int(entry["sizes"][0])
        record = records.get(name)
        if record is None:
            raise SystemExit(f"retained V4 record missing: {name}")

        forge_source = GEN / str(entry["path_template"]).format(size=size)
        evidence = prepare_scoring_source(entry, record, receipt_path, forge_source, size)
        if evidence["evidenceMode"] == "runtime-decoded-for-scoring":
            fallbacks.append(name)

        quality = score_v1_assets.score(entry, True)
        if quality.get("status") != "passed":
            raise SystemExit(f"V4 quality recertification failed: {name}: {quality.get('issues')}")

        retained_runtime = receipt_path.parent / record["runtimeFile"]
        output_runtime = output_root / record["runtimeFile"]
        output_runtime.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(retained_runtime, output_runtime)
        technical = generator.inspect_runtime(entry, output_runtime, size)
        if technical.get("technicalStatus") != "passed":
            raise SystemExit(f"V4 technical recertification failed: {name}: {technical.get('issues')}")

        output_source = output_root / "sources" / f"{name}_{size}.png"
        output_meta = output_source.with_suffix(output_source.suffix + ".render.json")
        shutil.copy2(evidence["source"], output_source)
        shutil.copy2(evidence["metadata"], output_meta)

        recertified.append(
            {
                **record,
                "status": "passed",
                "quality": quality,
                "technical": technical,
                "runtimeFile": str(output_runtime.relative_to(output_root)),
                "recertification": {
                    "mode": "zero-provider-call",
                    "sourceRunId": SOURCE_RUN_ID,
                    "sourceArtifactId": SOURCE_ARTIFACT_ID,
                    "canonicalMinimumEdge": quality["metrics"]["canonicalMinimumEdge"],
                    **{k: v for k, v in evidence.items() if k not in {"source", "metadata"}},
                },
            }
        )

    if fallbacks != EXPECTED_RUNTIME_DECODE_FALLBACKS:
        raise SystemExit(f"runtime decode fallback set drift: {fallbacks}")

    exact_duplicates, near_duplicates = generator.duplicate_evidence(recertified)
    if exact_duplicates:
        raise SystemExit(f"V4 exact duplicate groups remain: {exact_duplicates}")

    receipt: dict[str, Any] = {
        "schemaVersion": "1.1.0",
        "programAuthority": "LifeLoggerAI/asset-factory#206",
        "version": "v4",
        "recertificationMode": "zero-provider-call",
        "sourceRunId": SOURCE_RUN_ID,
        "sourceArtifactId": SOURCE_ARTIFACT_ID,
        "sourceArtifactDigest": SOURCE_ARTIFACT_DIGEST,
        "sourceReceiptSha256": SOURCE_RECEIPT_SHA256,
        "previouslyPassed": 34,
        "previouslyFailedOnlyForLegacyGeometryFloor": EXPECTED_PREVIOUS_FAILURES,
        "runtimeDecodedForScoring": fallbacks,
        "generated": 39,
        "passed": 39,
        "failed": 0,
        "failedNames": [],
        "provider": "openai",
        "providerCallsExecuted": 44,
        "providerCallsExecutedThisRecertification": 0,
        "reservedEstimatedCostUsd": "44.00",
        "reservedEstimatedCostUsdThisRecertification": "0.00",
        "exactDuplicateGroups": [],
        "nearDuplicatePairs": near_duplicates,
        "promotionAuthorized": False,
        "deploymentAuthorized": False,
        "status": "passed",
        "assets": recertified,
    }
    canonical = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode()
    receipt["receiptSha256"] = sha256_bytes(canonical)
    (output_root / "v4-generation-receipt.json").write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "status": "passed",
        "generated": 39,
        "passed": 39,
        "failed": 0,
        "runtimeDecodedForScoring": fallbacks,
        "providerCallsExecutedThisRecertification": 0,
        "reservedEstimatedCostUsdThisRecertification": "0.00",
        "receiptSha256": receipt["receiptSha256"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
