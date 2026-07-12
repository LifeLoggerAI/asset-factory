#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import tempfile
import zipfile
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
MODULE_PATH = SCRIPT_DIR / "v1_safe_resume_preflight.py"
spec = importlib.util.spec_from_file_location("v1_safe_resume_preflight", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

REPOSITORY = "LifeLoggerAI/asset-factory"
API_ROOT = "https://api.github.com"
TOKEN = "test-token"
MARKERS = ["a" * 40, "b" * 40, "c" * 40, "d" * 40]
EXPECTED_DEFAULT_MARKERS = [
    "bdf2cd003bf16ed621cdcdc63312c75ce5e5d5e5",
    "de27f2f36aa1ca73d504e5dffed99161078fb0c8",
    "4dc05a67746e189054609e405ca3801683ab5445",
    "0cf837d585d3d1c1d8e171938037098c72230c22",
]
EXPECTED_WORKFLOW_NAMES = {
    "One-Time V1 AAA Spatial Pack",
    "One-Time V1 AAA Spatial Pack Marker",
    "One-Time V1 AAA Spatial Pack Safe Resume",
    "One-Time V1 AAA Spatial Pack Safe Resume 2",
    "One-Time V1 AAA Spatial Pack Safe Resume 3",
}
EXPECTED_GENERATION_STEP_NAMES = {
    "Generate and certify all 53 V1 Spatial outputs",
    "Generate all 53 V1 Spatial outputs",
}


def run_record(marker: str, run_id: int, *, name: str = "One-Time V1 AAA Spatial Pack Marker") -> dict:
    return {
        "id": run_id,
        "name": name,
        "head_sha": marker,
        "status": "completed",
        "conclusion": "failure",
        "run_attempt": 1,
        "created_at": "2026-07-11T00:00:00Z",
        "updated_at": "2026-07-11T00:01:00Z",
    }


def execute_job(
    job_id: int,
    *,
    conclusion: str = "skipped",
    steps: list[dict] | None = None,
) -> dict:
    return {
        "id": job_id,
        "name": "execute",
        "status": "completed",
        "conclusion": conclusion,
        "run_attempt": 1,
        "runner_name": "test-runner",
        "steps": steps or [],
    }


def api_fixture(
    *,
    artifacts_by_run: dict[int, list[dict]] | None = None,
    jobs_by_run: dict[int, list[dict]] | None = None,
    missing_markers: set[str] | None = None,
    workflow_names_by_marker: dict[str, str] | None = None,
):
    artifacts_by_run = artifacts_by_run or {}
    jobs_by_run = jobs_by_run or {}
    missing_markers = missing_markers or set()
    workflow_names_by_marker = workflow_names_by_marker or {}
    run_ids = {marker: index + 100 for index, marker in enumerate(MARKERS)}

    def fake_json(url: str, token: str):
        assert token == TOKEN
        if "/actions/runs?" in url:
            marker = url.split("head_sha=", 1)[1].split("&", 1)[0]
            if marker in missing_markers:
                return {"workflow_runs": []}
            return {
                "workflow_runs": [
                    run_record(
                        marker,
                        run_ids[marker],
                        name=workflow_names_by_marker.get(
                            marker, "One-Time V1 AAA Spatial Pack Marker"
                        ),
                    )
                ]
            }
        if "/jobs?" in url:
            run_id = int(url.split("/actions/runs/", 1)[1].split("/", 1)[0])
            return {
                "jobs": jobs_by_run.get(
                    run_id,
                    [execute_job(run_id + 1000)],
                )
            }
        if "/artifacts?" in url:
            run_id = int(url.split("/actions/runs/", 1)[1].split("/", 1)[0])
            return {"artifacts": artifacts_by_run.get(run_id, [])}
        raise AssertionError(f"unexpected URL: {url}")

    return fake_json, run_ids


def test_default_marker_history_is_complete_and_ordered() -> None:
    assert module.DEFAULT_MARKER_SHAS == EXPECTED_DEFAULT_MARKERS
    assert len(module.DEFAULT_MARKER_SHAS) == 4
    assert len(set(module.DEFAULT_MARKER_SHAS)) == 4
    assert module.WORKFLOW_NAMES == EXPECTED_WORKFLOW_NAMES
    assert module.GENERATION_STEP_NAMES == EXPECTED_GENERATION_STEP_NAMES


def test_skipped_execution_without_artifacts_is_safe() -> None:
    fake_json, _ = api_fixture()
    with mock.patch.object(module, "github_api_json", side_effect=fake_json), mock.patch.object(
        module, "download_artifact"
    ) as download:
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is True
    assert result["blockingReasons"] == []
    assert result["matchingRuns"] == 4
    assert set(result["inspectedWorkflowNames"]) == EXPECTED_WORKFLOW_NAMES
    assert set(result["generationStepNames"]) == EXPECTED_GENERATION_STEP_NAMES
    download.assert_not_called()


def test_original_paid_workflow_success_blocks_execution() -> None:
    fake_json, _ = api_fixture(
        workflow_names_by_marker={MARKERS[0]: "One-Time V1 AAA Spatial Pack"},
        jobs_by_run={100: [execute_job(1100, conclusion="success")]},
    )
    with mock.patch.object(module, "github_api_json", side_effect=fake_json):
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is False
    assert result["matchingRuns"] == 4
    assert result["runs"][0]["workflowName"] == "One-Time V1 AAA Spatial Pack"
    assert any("may have generated outputs" in reason for reason in result["blockingReasons"])


def test_legacy_generation_step_blocks_failed_execute_job() -> None:
    legacy_step = {
        "number": 9,
        "name": "Generate and certify all 53 V1 Spatial outputs",
        "status": "completed",
        "conclusion": "success",
    }
    fake_json, _ = api_fixture(
        workflow_names_by_marker={MARKERS[0]: "One-Time V1 AAA Spatial Pack"},
        jobs_by_run={100: [execute_job(1100, conclusion="failure", steps=[legacy_step])]},
    )
    with mock.patch.object(module, "github_api_json", side_effect=fake_json):
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is False
    assert any("generation step was not skipped" in reason for reason in result["blockingReasons"])


def test_expired_pack_artifact_blocks_execution() -> None:
    fake_json, run_ids = api_fixture(
        artifacts_by_run={
            100: [
                {
                    "id": 9001,
                    "name": "urai-v1-aaa-spatial-pack-old",
                    "expired": True,
                    "size_in_bytes": 100,
                }
            ]
        }
    )
    assert run_ids[MARKERS[0]] == 100
    with mock.patch.object(module, "github_api_json", side_effect=fake_json), mock.patch.object(
        module, "download_artifact"
    ) as download:
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is False
    assert any("expired" in reason for reason in result["blockingReasons"])
    download.assert_not_called()


def test_non_skipped_generation_step_blocks_execution() -> None:
    step = {
        "number": 5,
        "name": "Generate all 53 V1 Spatial outputs",
        "status": "completed",
        "conclusion": "failure",
    }
    fake_json, _ = api_fixture(
        jobs_by_run={100: [execute_job(1100, conclusion="failure", steps=[step])]}
    )
    with mock.patch.object(module, "github_api_json", side_effect=fake_json):
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is False
    assert any("generation step was not skipped" in reason for reason in result["blockingReasons"])


def test_missing_marker_coverage_blocks_execution() -> None:
    fake_json, _ = api_fixture(missing_markers={MARKERS[1]})
    with mock.patch.object(module, "github_api_json", side_effect=fake_json):
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is False
    assert any("coverage incomplete" in reason for reason in result["blockingReasons"])


def test_generated_output_artifact_blocks_execution() -> None:
    fake_json, _ = api_fixture(
        artifacts_by_run={
            100: [
                {
                    "id": 9002,
                    "name": "urai-v1-aaa-spatial-pack-output",
                    "expired": False,
                    "size_in_bytes": 100,
                }
            ]
        }
    )

    def fake_download(repository, artifact_id, token, output_path, **kwargs):
        assert repository == REPOSITORY
        assert artifact_id == 9002
        assert token == TOKEN
        destination = Path(output_path)
        with zipfile.ZipFile(destination, "w") as bundle:
            bundle.writestr("image_asset_generator/assets/generated.webp", b"WEBP")
        return destination

    with mock.patch.object(module, "github_api_json", side_effect=fake_json), mock.patch.object(
        module, "download_artifact", side_effect=fake_download
    ):
        result = module.inspect_history(REPOSITORY, TOKEN, API_ROOT, MARKERS)
    assert result["safeToExecute"] is False
    assert any("generated-output evidence" in reason for reason in result["blockingReasons"])


def main() -> int:
    test_default_marker_history_is_complete_and_ordered()
    test_skipped_execution_without_artifacts_is_safe()
    test_original_paid_workflow_success_blocks_execution()
    test_legacy_generation_step_blocks_failed_execute_job()
    test_expired_pack_artifact_blocks_execution()
    test_non_skipped_generation_step_blocks_execution()
    test_missing_marker_coverage_blocks_execution()
    test_generated_output_artifact_blocks_execution()
    print("PASS V1 safe-resume historical preflight behavior")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
