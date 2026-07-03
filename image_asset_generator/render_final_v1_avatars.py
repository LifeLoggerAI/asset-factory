"""Add the six remaining V1 avatar assets to an existing render checkpoint."""

from __future__ import annotations

import json
import time
import traceback
from pathlib import Path
from typing import Optional

import build_version_manifests
import generate_assets as base

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
TARGETS = (
    "avatar_builder",
    "avatar_guide",
    "avatar_mirror",
    "avatar_operator",
    "avatar_protector",
    "avatar_relationship_liaison",
)
MODERATION_RETRIES = 6


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


def main() -> int:
    checkpoint_entries = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    contract_entries = build_version_manifests._v1_manifest()
    contract_by_name = {entry.get("name"): entry for entry in contract_entries}
    entries = list(checkpoint_entries)
    existing_names = {entry.get("name") for entry in entries}

    missing_contract = [name for name in TARGETS if name not in contract_by_name]
    if missing_contract:
        raise RuntimeError(f"Missing target contract entries: {missing_contract}")

    for name in TARGETS:
        if name not in existing_names:
            entries.append(contract_by_name[name])

    selected = [contract_by_name[name] for name in TARGETS]
    rendered: list[str] = []

    for entry in selected:
        print(
            f"RENDER_START name={entry['name']} ratio={entry.get('aspect_ratio')} "
            f"alpha={entry.get('alpha')} sizes={entry.get('sizes')}",
            flush=True,
        )
        try:
            for size, output_path in base.iter_outputs(entry):
                output_path.parent.mkdir(parents=True, exist_ok=True)
                result = render_with_bounded_retry(entry, size)
                if result.renderer != "provider":
                    raise RuntimeError(f"Non-provider output for {entry['name']}: {result.renderer}")
                result.image.save(output_path, format="PNG", optimize=True)
                base.write_render_metadata(output_path, entry, result)
                rendered.append(str(output_path.relative_to(BASE_DIR)))
                print(
                    f"RENDER_OK name={entry['name']} path={output_path.relative_to(BASE_DIR)} "
                    f"attempt={result.attempt}",
                    flush=True,
                )
            entry["status"] = "generated"
            entry["renderer"] = "provider"
            MANIFEST_PATH.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
        except Exception as exc:
            print(f"RENDER_ERROR name={entry['name']} error={type(exc).__name__}: {exc}", flush=True)
            traceback.print_exc()
            raise

    print(f"CHECKPOINT_COUNT={len(checkpoint_entries)}")
    print(f"FINAL_MANIFEST_COUNT={len(entries)}")
    print(f"TARGET_COUNT={len(TARGETS)}")
    print(f"RENDERED_COUNT={len(rendered)}")
    for path in rendered:
        print(f"PROVIDER_RENDERED={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
