from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
SPECS = ROOT / "media-specifications.json"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    specs = json.loads(SPECS.read_text(encoding="utf-8"))
    changed = 0

    for asset in manifest["assets"]:
        lane = asset["lane"]
        kind = asset["assetType"]

        if lane == "audio":
            spec = specs["audio"].get(kind)
            if not spec:
                raise SystemExit(f"missing audio specification for {kind}")
            phase = asset["world"]
            asset["expectedOutputPath"] = (
                f"multimodal/outputs/audio/{phase}/{phase}-{kind}.{spec['extension']}"
            )
            asset["technicalBudget"] = {
                key: value
                for key, value in spec.items()
                if key not in {"extension", "consentRequired"}
            }
            asset["deviceVariants"] = [
                "desktop", "mobile", "tablet", "supported-xr", "low-bandwidth"
            ]
            asset["accessibilityVariants"] = [
                "transcript", "captions", "silent-fallback"
            ]
            if spec.get("consentRequired"):
                consent = ["documented approved voice consent"]
                asset["consentRequirements"] = consent
                asset["likenessRequirements"] = consent
            changed += 1

        elif lane == "film":
            spec = specs["film"].get(kind)
            if not spec:
                raise SystemExit(f"missing film specification for {kind}")
            asset["expectedOutputPath"] = (
                f"multimodal/outputs/film/{kind}.{spec['extension']}"
            )
            asset["technicalBudget"] = {
                key: value for key, value in spec.items() if key != "extension"
            }
            asset["routes"] = ["/replay", "/demo/replay-film"]
            asset["runtimeRoute"] = "/replay"
            asset["deviceVariants"] = [
                "desktop", "mobile", "tablet", "low-bandwidth"
            ]
            asset["accessibilityVariants"] = [
                "captions", "audio-description", "poster-frame"
            ]
            asset["consentRequirements"] = [
                "no private life data without explicit authorization"
            ]
            asset["likenessRequirements"] = [
                "no identifiable likeness without explicit authorization"
            ]
            changed += 1

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"mediaRecordsUpdated": changed}, indent=2))


if __name__ == "__main__":
    main()
