from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import zipfile
from pathlib import Path
from typing import Any

WORKFLOW_NAME = "One-Time V1 AAA Spatial Pack Marker"
GENERATION_STEP = "Generate all 53 V1 Spatial outputs"
EVIDENCE_EXACT = {"artifacts/budget/paid-request-state.json"}
IMAGE_SUFFIXES = (".png", ".webp", ".jpg", ".jpeg")


class InspectionError(RuntimeError):
    pass


def curl_bytes(url: str, token: str, *, accept: str = "application/vnd.github+json") -> bytes:
    command = [
        "curl",
        "--fail-with-body",
        "--location",
        "--silent",
        "--show-error",
        "--max-time",
        "90",
        "-H",
        f"Accept: {accept}",
        "-H",
        f"Authorization: Bearer {token}",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        "-H",
        "User-Agent: urai-v1-safe-resume-history-inspector",
        url,
    ]
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        message = completed.stderr.decode("utf-8", errors="replace").strip()
        raise InspectionError(f"curl failed for {url}: exit={completed.returncode}: {message}")
    return completed.stdout


def get_json(url: str, token: str) -> dict[str, Any]:
    try:
        return json.loads(curl_bytes(url, token).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InspectionError(f"invalid JSON from {url}: {exc}") from exc


def generated_evidence_files(names: list[str]) -> list[str]:
    return sorted(
        name
        for name in names
        if name in EVIDENCE_EXACT
        or "forge_receipt" in name
        or "quality_report" in name
        or "dropin_receipt" in name
        or (name.startswith("image_asset_generator/assets/") and not name.endswith("/"))
        or (name.startswith("image_asset_generator/spatial_handoff/") and name.endswith(".webp"))
        or name.lower().endswith(IMAGE_SUFFIXES)
    )


def execute_job_reasons(job: dict[str, Any]) -> list[str]:
    if str(job.get("name", "")).lower() != "execute":
        return []
    reasons: list[str] = []
    if job.get("status") == "in_progress" or job.get("conclusion") == "success":
        reasons.append(f"historical execute job {job.get('id')} may have generated outputs")
    for step in job.get("steps") or []:
        if step.get("name") != GENERATION_STEP:
            continue
        status = step.get("status")
        conclusion = step.get("conclusion")
        if status == "in_progress" or (status == "completed" and conclusion != "skipped"):
            reasons.append(
                f"historical generation step was not skipped in job {job.get('id')}: "
                f"{status}/{conclusion}"
            )
    return reasons


def write_receipt(path: Path, result: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def set_output(safe: bool) -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if not output:
        return
    with open(output, "a", encoding="utf-8") as handle:
        handle.write(f"safe_to_execute={'true' if safe else 'false'}\n")


def inspect_history(
    *, repository: str, api_root: str, token: str, marker_shas: list[str]
) -> dict[str, Any]:
    blocking_reasons: list[str] = []
    technical_errors: list[str] = []
    records: list[dict[str, Any]] = []
    seen_shas: set[str] = set()

    for marker_sha in marker_shas:
        runs_url = f"{api_root}/repos/{repository}/actions/runs?head_sha={marker_sha}&per_page=100"
        try:
            returned = get_json(runs_url, token).get("workflow_runs", [])
        except Exception as exc:
            technical_errors.append(f"run lookup failed for {marker_sha}: {type(exc).__name__}: {exc}")
            continue

        relevant = sorted(
            [run for run in returned if run.get("name") == WORKFLOW_NAME],
            key=lambda run: int(run["id"]),
        )
        if relevant:
            seen_shas.add(marker_sha)

        for run in relevant:
            run_id = int(run["id"])
            record: dict[str, Any] = {
                "markerSha": marker_sha,
                "runId": run_id,
                "status": run.get("status"),
                "conclusion": run.get("conclusion"),
                "runAttempt": run.get("run_attempt"),
                "createdAt": run.get("created_at"),
                "updatedAt": run.get("updated_at"),
                "jobs": [],
                "artifacts": [],
            }

            try:
                jobs = get_json(
                    f"{api_root}/repos/{repository}/actions/runs/{run_id}/jobs?filter=all&per_page=100",
                    token,
                ).get("jobs", [])
            except Exception as exc:
                jobs = []
                technical_errors.append(
                    f"job lookup failed for run {run_id}: {type(exc).__name__}: {exc}"
                )

            try:
                artifacts = get_json(
                    f"{api_root}/repos/{repository}/actions/runs/{run_id}/artifacts?per_page=100",
                    token,
                ).get("artifacts", [])
            except Exception as exc:
                artifacts = []
                technical_errors.append(
                    f"artifact lookup failed for run {run_id}: {type(exc).__name__}: {exc}"
                )

            for artifact in artifacts:
                item: dict[str, Any] = {
                    "id": artifact.get("id"),
                    "name": artifact.get("name"),
                    "expired": artifact.get("expired"),
                    "sizeInBytes": artifact.get("size_in_bytes"),
                    "digest": artifact.get("digest"),
                    "archiveFiles": [],
                    "evidenceFiles": [],
                }
                if str(artifact.get("name", "")).startswith("urai-v1-aaa-spatial-pack-"):
                    if artifact.get("expired"):
                        technical_errors.append(
                            f"historical artifact {artifact.get('id')} is expired and cannot be inspected"
                        )
                    else:
                        try:
                            archive = curl_bytes(
                                f"{api_root}/repos/{repository}/actions/artifacts/{artifact['id']}/zip",
                                token,
                                accept="application/octet-stream",
                            )
                            with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
                                names = sorted(bundle.namelist())
                            evidence = generated_evidence_files(names)
                            item["archiveFiles"] = names
                            item["evidenceFiles"] = evidence
                            if evidence:
                                blocking_reasons.append(
                                    f"historical artifact {artifact['id']} contains spend or generated-output evidence"
                                )
                        except Exception as exc:
                            error = (
                                f"artifact inspection failed for {artifact.get('id')} in run {run_id}: "
                                f"{type(exc).__name__}: {exc}"
                            )
                            item["inspectionError"] = error
                            technical_errors.append(error)
                record["artifacts"].append(item)

            if run.get("status") != "completed":
                blocking_reasons.append(f"historical run {run_id} is unresolved: {run.get('status')}")

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
                blocking_reasons.extend(execute_job_reasons(job))

            records.append(record)

    missing = sorted(set(marker_shas) - seen_shas)
    if missing:
        blocking_reasons.append(f"historical marker coverage incomplete: {missing}")

    blocking_reasons = sorted(set(blocking_reasons))
    technical_errors = sorted(set(technical_errors))
    safe = not blocking_reasons and not technical_errors
    status = "passed" if safe else ("error" if technical_errors else "blocked")
    return {
        "schemaVersion": "3.0.0",
        "inspectionStatus": status,
        "historicalMarkerShas": marker_shas,
        "matchingRuns": len(records),
        "safeToExecute": safe,
        "providerCallsProven": 0 if safe else None,
        "blockingReasons": blocking_reasons,
        "technicalErrors": technical_errors,
        "runs": records,
    }


def run_self_test() -> None:
    assert generated_evidence_files(["image_asset_generator/manifests/generated/v1.manifest.json"]) == []
    assert generated_evidence_files(["artifacts/budget/paid-request-state.json"]) == [
        "artifacts/budget/paid-request-state.json"
    ]
    assert generated_evidence_files(["image_asset_generator/assets/x.png"]) == [
        "image_asset_generator/assets/x.png"
    ]
    skipped = {
        "id": 1,
        "name": "execute",
        "status": "completed",
        "conclusion": "failure",
        "steps": [{"name": GENERATION_STEP, "status": "completed", "conclusion": "skipped"}],
    }
    assert execute_job_reasons(skipped) == []
    ran = {
        "id": 2,
        "name": "execute",
        "status": "completed",
        "conclusion": "failure",
        "steps": [{"name": GENERATION_STEP, "status": "completed", "conclusion": "failure"}],
    }
    assert len(execute_job_reasons(ran)) == 1
    print("V1 safe-resume history inspector self-test passed.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY"))
    parser.add_argument("--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com"))
    parser.add_argument("--token", default=os.environ.get("GH_TOKEN"))
    parser.add_argument("--marker-sha", action="append", dest="marker_shas")
    parser.add_argument(
        "--output",
        default="artifacts/preflight/v1-safe-resume-historical-inspection.json",
    )
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return 0

    output = Path(args.output)
    base = {
        "schemaVersion": "3.0.0",
        "inspectionStatus": "error",
        "historicalMarkerShas": args.marker_shas or [],
        "matchingRuns": 0,
        "safeToExecute": False,
        "providerCallsProven": None,
        "blockingReasons": [],
        "technicalErrors": [],
        "runs": [],
    }
    try:
        if not args.repository or not args.token or not args.marker_shas:
            raise InspectionError("repository, token, and at least one marker SHA are required")
        result = inspect_history(
            repository=args.repository,
            api_root=args.api_root,
            token=args.token,
            marker_shas=args.marker_shas,
        )
    except Exception as exc:
        result = base
        result["technicalErrors"] = [f"fatal inspector error: {type(exc).__name__}: {exc}"]

    write_receipt(output, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    safe = bool(result.get("safeToExecute"))
    set_output(safe)
    if safe:
        return 0
    if result.get("technicalErrors"):
        return 18
    return 17


if __name__ == "__main__":
    raise SystemExit(main())
