#!/usr/bin/env python3
"""Inspect every prior V1 paid-run attempt before authorizing another provider call."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from github_artifact_download import download_artifact, github_api_json

DEFAULT_MARKER_SHAS = [
    "bdf2cd003bf16ed621cdcdc63312c75ce5e5d5e5",
    "de27f2f36aa1ca73d504e5dffed99161078fb0c8",
    "4dc05a67746e189054609e405ca3801683ab5445",
    "0cf837d585d3d1c1d8e171938037098c72230c22",
]
WORKFLOW_NAMES = {
    "One-Time V1 AAA Spatial Pack",
    "One-Time V1 AAA Spatial Pack Marker",
    "One-Time V1 AAA Spatial Pack Safe Resume",
    "One-Time V1 AAA Spatial Pack Safe Resume 2",
    "One-Time V1 AAA Spatial Pack Safe Resume 3",
}
ARTIFACT_PREFIX = "urai-v1-aaa-spatial-pack-"
MAX_ARTIFACT_BYTES = 1024 * 1024 * 1024


def _evidence_files(names: list[str]) -> list[str]:
    return sorted(
        name
        for name in names
        if name == "artifacts/budget/paid-request-state.json"
        or "forge_receipt" in name
        or "quality_report" in name
        or "dropin_receipt" in name
        or (name.startswith("image_asset_generator/assets/") and not name.endswith("/"))
        or (
            name.startswith("image_asset_generator/spatial_handoff/")
            and name.endswith(".webp")
        )
        or name.lower().endswith((".png", ".webp", ".jpg", ".jpeg"))
    )


def inspect_history(
    repository: str,
    token: str,
    api_root: str,
    marker_shas: list[str],
) -> dict[str, Any]:
    reasons: list[str] = []
    records: list[dict[str, Any]] = []
    seen_shas: set[str] = set()

    with tempfile.TemporaryDirectory(prefix="urai-v1-safe-resume-") as temporary:
        temporary_root = Path(temporary)
        for marker_sha in marker_shas:
            runs_url = (
                f"{api_root.rstrip('/')}/repos/{repository}/actions/runs"
                f"?head_sha={marker_sha}&per_page=100"
            )
            returned = github_api_json(runs_url, token).get("workflow_runs", [])
            relevant = sorted(
                [run for run in returned if run.get("name") in WORKFLOW_NAMES],
                key=lambda run: int(run["id"]),
            )
            if relevant:
                seen_shas.add(marker_sha)

            for run in relevant:
                run_id = int(run["id"])
                jobs = github_api_json(
                    f"{api_root.rstrip('/')}/repos/{repository}/actions/runs/"
                    f"{run_id}/jobs?filter=all&per_page=100",
                    token,
                ).get("jobs", [])
                artifacts = github_api_json(
                    f"{api_root.rstrip('/')}/repos/{repository}/actions/runs/"
                    f"{run_id}/artifacts?per_page=100",
                    token,
                ).get("artifacts", [])

                artifact_records: list[dict[str, Any]] = []
                for artifact in artifacts:
                    artifact_id = int(artifact["id"])
                    artifact_name = str(artifact.get("name", ""))
                    is_pack_artifact = artifact_name.startswith(ARTIFACT_PREFIX)
                    expired = bool(artifact.get("expired"))
                    item: dict[str, Any] = {
                        "id": artifact_id,
                        "name": artifact_name,
                        "expired": expired,
                        "sizeInBytes": artifact.get("size_in_bytes"),
                        "evidenceFiles": [],
                    }
                    if is_pack_artifact and expired:
                        reasons.append(
                            f"historical pack artifact {artifact_id} is expired and "
                            "cannot be inspected for spend or generated outputs"
                        )
                    elif is_pack_artifact:
                        archive_path = temporary_root / f"artifact-{artifact_id}.zip"
                        download_artifact(
                            repository,
                            artifact_id,
                            token,
                            archive_path,
                            api_root=api_root,
                            max_bytes=MAX_ARTIFACT_BYTES,
                        )
                        with zipfile.ZipFile(archive_path) as bundle:
                            names = bundle.namelist()
                        evidence = _evidence_files(names)
                        item["evidenceFiles"] = evidence
                        if evidence:
                            reasons.append(
                                f"historical artifact {artifact_id} contains spend or "
                                "generated-output evidence"
                            )
                    artifact_records.append(item)

                record: dict[str, Any] = {
                    "markerSha": marker_sha,
                    "runId": run_id,
                    "workflowName": run.get("name"),
                    "status": run.get("status"),
                    "conclusion": run.get("conclusion"),
                    "runAttempt": run.get("run_attempt"),
                    "createdAt": run.get("created_at"),
                    "updatedAt": run.get("updated_at"),
                    "jobs": [],
                    "artifacts": artifact_records,
                }
                if run.get("status") != "completed":
                    reasons.append(
                        f"historical run {run_id} is unresolved: {run.get('status')}"
                    )

                for job in jobs:
                    steps = job.get("steps") or []
                    record["jobs"].append(
                        {
                            "id": job.get("id"),
                            "name": job.get("name"),
                            "status": job.get("status"),
                            "conclusion": job.get("conclusion"),
                            "runAttempt": job.get("run_attempt"),
                            "runnerName": job.get("runner_name"),
                            "steps": [
                                {
                                    "number": step.get("number"),
                                    "name": step.get("name"),
                                    "status": step.get("status"),
                                    "conclusion": step.get("conclusion"),
                                }
                                for step in steps
                            ],
                        }
                    )
                    if str(job.get("name", "")).lower() != "execute":
                        continue
                    if job.get("status") == "in_progress" or job.get("conclusion") == "success":
                        reasons.append(
                            f"historical execute job {job.get('id')} may have generated outputs"
                        )
                    for step in steps:
                        if step.get("name") != "Generate all 53 V1 Spatial outputs":
                            continue
                        status = step.get("status")
                        conclusion = step.get("conclusion")
                        if status == "in_progress" or (
                            status == "completed" and conclusion != "skipped"
                        ):
                            reasons.append(
                                "historical generation step was not skipped in job "
                                f"{job.get('id')}: {status}/{conclusion}"
                            )
                records.append(record)

    if seen_shas != set(marker_shas):
        reasons.append(
            f"historical marker coverage incomplete: {sorted(seen_shas)}; "
            f"expected {sorted(marker_shas)}"
        )

    return {
        "schemaVersion": "3.1.0",
        "repository": repository,
        "historicalMarkerShas": marker_shas,
        "inspectedWorkflowNames": sorted(WORKFLOW_NAMES),
        "matchingRuns": len(records),
        "safeToExecute": not reasons,
        "blockingReasons": sorted(set(reasons)),
        "runs": records,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com")
    )
    parser.add_argument("--token-env", default="GH_TOKEN")
    parser.add_argument("--marker-sha", action="append", dest="marker_shas")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    token = os.environ.get(args.token_env, "")
    if not token:
        raise SystemExit(f"{args.token_env} is required")

    marker_shas = args.marker_shas or DEFAULT_MARKER_SHAS
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = inspect_history(args.repository, token, args.api_root, marker_shas)
    except Exception as exc:
        result = {
            "schemaVersion": "3.1.0",
            "repository": args.repository,
            "historicalMarkerShas": marker_shas,
            "inspectedWorkflowNames": sorted(WORKFLOW_NAMES),
            "matchingRuns": 0,
            "safeToExecute": False,
            "blockingReasons": [f"preflight exception: {type(exc).__name__}: {exc}"],
            "runs": [],
        }

    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(
                f"safe_to_execute={'true' if result['safeToExecute'] else 'false'}\n"
            )

    return 0 if result["safeToExecute"] else 17


if __name__ == "__main__":
    raise SystemExit(main())
