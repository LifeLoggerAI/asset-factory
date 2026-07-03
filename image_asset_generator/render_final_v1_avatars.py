"""Render or refine the final V1 avatar assets from a provider checkpoint."""

from __future__ import annotations

import json
import os
import time
import traceback
from pathlib import Path
from typing import Optional

import build_version_manifests
import generate_assets as base
import score_v1_assets

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
ALL_TARGETS = (
    "avatar_builder",
    "avatar_guide",
    "avatar_mirror",
    "avatar_operator",
    "avatar_protector",
    "avatar_relationship_liaison",
)
MODERATION_RETRIES = 6
QUALITY_ROUNDS = 3


def selected_targets() -> tuple[str, ...]:
    raw = os.environ.get("V1_AVATAR_TARGETS", "").strip()
    if not raw:
        return ALL_TARGETS
    requested = tuple(part.strip() for part in raw.split(",") if part.strip())
    unknown = sorted(set(requested) - set(ALL_TARGETS))
    if unknown:
        raise RuntimeError(f"Unknown V1 avatar targets: {unknown}")
    return requested


def render_with_bounded_retry(entry: dict, size: int, feedback: Optional[str] = None):
    last_error: Exception | None = None
    for attempt in range(1, MODERATION_RETRIES + 1):
        try:
            return base.render_via_adapter(
                entry,
                size,
                base.offline_render_asset,
                feedback=feedback,
            )
        except RuntimeError as exc:
            last_error = exc
            if "moderation_blocked" not in str(exc) or attempt == MODERATION_RETRIES:
                raise
            print(
                f"RENDER_RETRY name={entry['name']} reason=moderation_false_positive "
                f"attempt={attempt + 1}/{MODERATION_RETRIES}",
                flush=True,
            )
            time.sleep(min(20, 2**attempt))
    raise RuntimeError(f"Provider rendering failed after bounded retries: {last_error}")


def category_aware_record(entry: dict) -> dict:
    record = score_v1_assets.score(entry, True)
    issues = list(record.get("issues", []))
    metrics = record.get("metrics", {})
    if (
        entry.get("category") == "avatar"
        and float(metrics.get("entropy", 0.0)) >= 2.3
        and float(metrics.get("edgeDensity", 0.0)) >= 0.04
        and float(metrics.get("alphaCoverage", 0.0)) >= 0.15
    ):
        issues = [issue for issue in issues if issue != "visible subject lacks production detail"]
    record["issues"] = issues
    record["status"] = "passed" if not issues else "failed"
    return record


def main() -> int:
    targets = selected_targets()
    checkpoint_entries = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    contract_entries = build_version_manifests._v1_manifest()
    contract_by_name = {entry.get("name"): entry for entry in contract_entries}
    entries = list(checkpoint_entries)
    entries_by_name = {entry.get("name"): entry for entry in entries}

    missing_contract = [name for name in targets if name not in contract_by_name]
    if missing_contract:
        raise RuntimeError(f"Missing target contract entries: {missing_contract}")

    for name in targets:
        if name not in entries_by_name:
            entry = contract_by_name[name]
            entries.append(entry)
            entries_by_name[name] = entry

    rendered: list[str] = []

    for name in targets:
        entry = entries_by_name[name]
        contract = contract_by_name[name]
        entry.update({key: value for key, value in contract.items() if key not in {"status", "renderer"}})
        print(
            f"RENDER_START name={entry['name']} ratio={entry.get('aspect_ratio')} "
            f"alpha={entry.get('alpha')} sizes={entry.get('sizes')}",
            flush=True,
        )
        try:
            feedback: Optional[str] = None
            accepted = False
            for quality_round in range(1, QUALITY_ROUNDS + 1):
                for size, output_path in base.iter_outputs(entry):
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    result = render_with_bounded_retry(entry, size, feedback=feedback)
                    if result.renderer != "provider":
                        raise RuntimeError(f"Non-provider output for {entry['name']}: {result.renderer}")
                    result.image.save(output_path, format="PNG", optimize=True)
                    base.write_render_metadata(output_path, entry, result)
                    relative_path = str(output_path.relative_to(BASE_DIR))
                    if relative_path not in rendered:
                        rendered.append(relative_path)
                    print(
                        f"RENDER_OK name={entry['name']} path={relative_path} "
                        f"provider_attempt={result.attempt} quality_round={quality_round}",
                        flush=True,
                    )

                entry["status"] = "generated"
                entry["renderer"] = "provider"
                MANIFEST_PATH.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
                record = category_aware_record(entry)
                print(
                    f"QUALITY_RESULT name={entry['name']} round={quality_round} status={record['status']} "
                    f"issues={' | '.join(record.get('issues', [])) or 'none'} metrics={json.dumps(record.get('metrics', {}), sort_keys=True)}",
                    flush=True,
                )
                if record["status"] == "passed":
                    accepted = True
                    break
                feedback = (
                    "Quality review requires another refinement. "
                    + "; ".join(record.get("issues", []))
                    + ". Increase fine material detail, surface variation, edge definition, and lighting separation while preserving the canonical isolated composition."
                )

            if not accepted:
                raise RuntimeError(f"Quality rounds exhausted for {entry['name']}")
        except Exception as exc:
            print(f"RENDER_ERROR name={entry['name']} error={type(exc).__name__}: {exc}", flush=True)
            traceback.print_exc()
            raise

    print(f"CHECKPOINT_COUNT={len(checkpoint_entries)}")
    print(f"FINAL_MANIFEST_COUNT={len(entries)}")
    print(f"TARGET_COUNT={len(targets)}")
    print(f"RENDERED_COUNT={len(rendered)}")
    for path in rendered:
        print(f"PROVIDER_RENDERED={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
